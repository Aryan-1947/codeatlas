// POST (not GET) because the request body carries the question + history,
// which EventSource can't send — the frontend will read this with fetch's
// streaming body reader instead. Same SSE event shape as /api/generate:
//   event: chunk  { text: string }
//   event: done   {}
//   event: error  { code: string, message: string }

import { Router } from "express";
import { z } from "zod";
import { getRepoCache } from "../lib/repoCache.js";
import { query } from "../lib/db.js";
import { RepoRefParamsSchema } from "../lib/repoRefSchema.js";
import { ApiError } from "../middleware/errorHandler.js";
import { streamChatReply } from "../services/chat.js";

export const chatRouter = Router();

const ChatBodySchema = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

function sseWrite(res: import("express").Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post("/:owner/:repo", async (req, res) => {
  const paramsParsed = RepoRefParamsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: { code: "invalid_repo_ref", message: "Repository must look like owner/repo." } });
    return;
  }
  const bodyParsed = ChatBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: { code: "invalid_body", message: "A non-empty 'question' is required." } });
    return;
  }

  const cached = await getRepoCache(paramsParsed.data.owner, paramsParsed.data.repo);
  if (!cached) {
    res.status(409).json({
      error: {
        code: "not_generated_yet",
        message: "Generate a diagram for this repo first (POST /api/generate/:owner/:repo), then chat about it.",
      },
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const abortController = new AbortController();
  res.on("close", () => abortController.abort());

  let reply = "";
  try {
    await streamChatReply(
      bodyParsed.data.question,
      bodyParsed.data.history,
      cached.context,
      cached.summary,
      cached.graph,
      (text) => {
        reply += text;
        sseWrite(res, "chunk", { text });
      },
      abortController.signal,
    );

    const userId = req.auth?.payload?.sub;
    if (userId && reply) {
      try {
        await query(
          `INSERT INTO chat_messages (user_id, owner, repo, role, content) VALUES ($1, $2, $3, 'user', $4), ($1, $2, $3, 'assistant', $5)`,
          [userId, paramsParsed.data.owner, paramsParsed.data.repo, bodyParsed.data.question, reply],
        );
      } catch (saveErr) {
        console.error("Failed to save chat messages:", saveErr);
      }
    }

    sseWrite(res, "done", {});
  } catch (err) {
    if (err instanceof ApiError) {
      sseWrite(res, "error", { code: err.code, message: err.message });
    } else {
      console.error("Unhandled error in /api/chat:", err);
      sseWrite(res, "error", { code: "internal_error", message: "Something went wrong on our end." });
    }
  } finally {
    res.end();
  }
});

interface ChatHistoryRow {
  role: "user" | "assistant";
  content: string;
}

chatRouter.get("/:owner/:repo/history", async (req, res) => {
  const paramsParsed = RepoRefParamsSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: { code: "invalid_repo_ref", message: "Repository must look like owner/repo." } });
    return;
  }
  const userId = req.auth?.payload?.sub;
  if (!userId) {
    res.status(401).json({ error: { code: "unauthorized", message: "Sign in required." } });
    return;
  }

  try {
    const result = await query<ChatHistoryRow>(
      `SELECT role, content FROM chat_messages WHERE user_id = $1 AND owner = $2 AND repo = $3 ORDER BY created_at ASC LIMIT 200`,
      [userId, paramsParsed.data.owner, paramsParsed.data.repo],
    );
    res.json(result.map((row) => ({ role: row.role, content: row.content })));
  } catch (err) {
    console.error("Failed to load chat history:", err);
    res.status(500).json({ error: { code: "internal_error", message: "Could not load chat history." } });
  }
});