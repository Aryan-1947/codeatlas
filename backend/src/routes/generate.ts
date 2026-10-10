// Server-Sent Events so the frontend gets real progress, not a fake
// simulated pipeline. Event types:
//   stage           { stage: "fetching" | "analyzing" | "graph" | "explaining" }
//   context         { repo, tree, truncated, stats }  (sent once, after analyzing)
//   graph           { graph: DiagramGraph, warnings: string[] }
//   explanation     { text: string }   (one per streamed chunk, append-only)
//   done            {}
//   fail            { code: string, message: string }
//   (named "fail", not "error" — EventSource treats any custom event named
//   "error" as its own built-in connection-error event, making
//   the two indistinguishable; see frontend/src/lib/api.ts)

import { Router } from "express";
import { RepoRefParamsSchema } from "../lib/repoRefSchema.js";
import { setRepoCache } from "../lib/repoCache.js";
import { query } from "../lib/db.js";
import { ApiError } from "../middleware/errorHandler.js";
import { buildContextSummary, type ContextSummary } from "../services/contextSummary.js";
import { streamExplanation } from "../services/generateExplanation.js";
import { generateGraph } from "../services/generateGraph.js";
import { buildRepoContext } from "../services/repoContext.js";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";

export const generateRouter = Router();



// Guests can diagram these without signing in. Everything else requires auth.
const GUEST_ALLOWED_REPOS = new Set([
  "fastapi/fastapi",
  "streamlit/streamlit",
  "pallets/flask",
  "axios/axios",
]);

function allowGuestExamplesOrRequireAuth(req: Request, res: Response, next: NextFunction) {
  const key = `${req.params.owner}/${req.params.repo}`.toLowerCase();
  const hasToken = Boolean(req.headers.authorization);
  if (GUEST_ALLOWED_REPOS.has(key) && !hasToken) {
    next();
    return;
  }
  requireAuth(req, res, next);
}




function sseWrite(res: import("express").Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Shape matches the frontend's existing RepoStats type field-for-field. */
function statsFromSummary(summary: ContextSummary) {
  return {
    fileCount: summary.fileCount,
    dirCount: summary.dirCount,
    totalKb: summary.totalKb,
    languages: summary.languages,
    primaryLanguage: summary.primaryLanguage,
    stack: summary.stack,
    testFiles: summary.testFileCount,
    docFiles: summary.docFileCount,
  };
}

generateRouter.get("/:owner/:repo", allowGuestExamplesOrRequireAuth, async (req, res) => {
  const parsed = RepoRefParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "invalid_repo_ref", message: "Repository must look like owner/repo." } });
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

  try {
    sseWrite(res, "stage", { stage: "fetching" });
    let context;
    try {
      context = await buildRepoContext(parsed.data);
    } catch (err) {
      const userToken = req.headers["x-github-token"];
      if (err instanceof ApiError && err.code === "not_found" && typeof userToken === "string" && userToken) {
        context = await buildRepoContext(parsed.data, userToken);
      } else {
        throw err;
      }
    }

    sseWrite(res, "stage", { stage: "analyzing" });
    const summary = buildContextSummary(context);
    const stats = statsFromSummary(summary);
    sseWrite(res, "context", {
      repo: context.repo,
      tree: context.tree,
      truncated: context.truncated,
      stats,
    });

    sseWrite(res, "stage", { stage: "graph" });
    const { graph, warnings } = await generateGraph(summary);
    await setRepoCache(parsed.data.owner, parsed.data.repo, { context, summary, graph });
    sseWrite(res, "graph", { graph, warnings });

    sseWrite(res, "stage", { stage: "explaining" });
    let explanation = "";
    await streamExplanation(
      summary,
      graph,
      (text) => {
        explanation += text;
        sseWrite(res, "explanation", { text });
      },
      abortController.signal,
    );

    const userId = req.auth?.payload?.sub;
    if (userId) {
      try {
        await query(
          `INSERT INTO diagrams (user_id, owner, repo, full_name, graph, explanation, stats, tree, stars, description, language)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (user_id, full_name) DO UPDATE SET
             graph = EXCLUDED.graph,
             explanation = EXCLUDED.explanation,
             stats = EXCLUDED.stats,
             tree = EXCLUDED.tree,
             stars = EXCLUDED.stars,
             description = EXCLUDED.description,
             language = EXCLUDED.language,
             updated_at = now()`,
          [
            userId,
            parsed.data.owner,
            parsed.data.repo,
            `${parsed.data.owner}/${parsed.data.repo}`.toLowerCase(),
            JSON.stringify(graph),
            explanation,
            JSON.stringify(stats),
            JSON.stringify(context.tree),
            context.repo.stars,
            context.repo.description,
            context.repo.language,
          ],
        );
      } catch (saveErr) {
        console.error("Failed to save diagram:", saveErr);
      }
    }

    sseWrite(res, "done", {});
  } catch (err) {
    if (err instanceof ApiError) {
      sseWrite(res, "fail", { code: err.code, message: err.message });
    } else {
      console.error("Unhandled error in /api/generate:", err);
      sseWrite(res, "fail", { code: "internal_error", message: "Something went wrong on our end." });
    }
  } finally {
    res.end();
  }
});