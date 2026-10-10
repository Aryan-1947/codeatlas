// Talks to the CodeAtlas backend. /api/chat is always protected
// (requireAuth on the backend); /api/generate is protected except for a
// handful of whitelisted example repos guests can use without signing in.
// Every request still attaches the current Auth0 access token when one
// exists, via the Authorization header.
//
// Both /api/generate and /api/chat stream over a plain fetch instead of
// EventSource — the browser's native EventSource can't send custom
// headers, so it has no way to carry the token. /api/chat already used
// fetch (it had to, since it's a POST); /api/generate is moved onto the
// same approach here.

import { getToken } from "./authToken";
import { getGithubToken } from "./githubToken";
import type { DiagramGraph, RepoInfo, RepoRef, RepoStats, TreeEntry } from "./types";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:4000";

export interface BackendError {
  code: string;
  message: string;
}

export interface GenerateContextPayload {
  repo: RepoInfo;
  tree: TreeEntry[];
  truncated: boolean;
  stats: RepoStats;
}

export interface GenerateGraphPayload {
  graph: DiagramGraph;
  warnings: string[];
}

export interface GenerateHandlers {
  onStage?: (stage: string) => void;
  onContext?: (payload: GenerateContextPayload) => void;
  onGraph?: (payload: GenerateGraphPayload) => void;
  onExplanationChunk?: (text: string) => void;
  onDone?: () => void;
  onFail?: (err: BackendError) => void;
}

function repoUrl(base: string, ref: RepoRef): string {
  return `${base}/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const githubToken = getGithubToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(githubToken ? { "X-Github-Token": githubToken } : {}),
  };
}

/** Parses one or more complete "event: X\ndata: Y\n\n" frames out of a buffer. */
function parseSseFrames(buffer: string): { frames: { event: string; data: string }[]; rest: string } {
  const frames: { event: string; data: string }[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const lines = part.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) frames.push({ event, data });
  }
  return { frames, rest };
}

/** Starts the generate SSE stream over fetch (so the Authorization header
 * can actually be sent). Returns a function that cancels it. */
export function streamGenerate(ref: RepoRef, handlers: GenerateHandlers): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(repoUrl(`${API_BASE_URL}/api/generate`, ref), {
        method: "GET",
        headers: { ...authHeaders() },
        signal: controller.signal,
      });
    } catch {
      handlers.onFail?.({ code: "connection_error", message: "Lost connection to the backend. Is it running?" });
      return;
    }

    if (!res.ok || !res.body) {
      let message = `Generate request failed (${res.status}).`;
      try {
        const body = await res.json();
        message = body?.error?.message ?? message;
      } catch {
        /* non-JSON error body, keep default message */
      }
      handlers.onFail?.({ code: res.status === 401 ? "unauthorized" : "generate_request_failed", message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          try {
            const data = JSON.parse(frame.data);
            switch (frame.event) {
              case "stage":
                handlers.onStage?.(data.stage);
                break;
              case "context":
                handlers.onContext?.(data);
                break;
              case "graph":
                handlers.onGraph?.(data);
                break;
              case "explanation":
                handlers.onExplanationChunk?.(data.text);
                break;
              case "fail":
                handlers.onFail?.(data);
                return;
              case "done":
                handlers.onDone?.();
                return;
            }
          } catch {
            handlers.onFail?.({ code: "parse_error", message: `Malformed "${frame.event}" event from server.` });
            return;
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return; // intentional cancellation, not a real failure
      handlers.onFail?.({ code: "stream_read_failed", message: "Lost connection to the backend mid-stream." });
    }
  })();

  return () => controller.abort();
}

/* --------------------------------- chat (POST) -------------------------------- */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatHandlers {
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onFail?: (err: BackendError) => void;
}

/** Starts a chat request. Returns a function that aborts it. */
export function streamChat(
  ref: RepoRef,
  question: string,
  history: ChatMessage[],
  handlers: ChatHandlers,
): () => void {
  const controller = new AbortController();

  (async () => {
    let res: Response;
    try {
      res = await fetch(repoUrl(`${API_BASE_URL}/api/chat`, ref), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      });
    } catch {
      handlers.onFail?.({ code: "connection_error", message: "Couldn't reach the backend." });
      return;
    }

    if (!res.ok || !res.body) {
      let message = `Chat request failed (${res.status}).`;
      try {
        const body = await res.json();
        message = body?.error?.message ?? message;
      } catch {
        /* non-JSON error body, keep default message */
      }
      handlers.onFail?.({ code: res.status === 401 ? "unauthorized" : "chat_request_failed", message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          try {
            const data = JSON.parse(frame.data);
            if (frame.event === "chunk") handlers.onChunk?.(data.text);
            else if (frame.event === "fail") handlers.onFail?.(data);
            else if (frame.event === "done") handlers.onDone?.();
          } catch {
            handlers.onFail?.({ code: "parse_error", message: "Malformed chat event from server." });
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return; // intentional cancellation, not a real failure
      handlers.onFail?.({ code: "stream_read_failed", message: "Lost the chat connection mid-stream." });
    }
  })();

  return () => controller.abort();
}


/* -------------------------------- history (GET) ------------------------------- */

export async function fetchHistory(): Promise<import("./types").HistoryItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/diagrams`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteHistory(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/diagrams`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  return res.ok;
}

export async function fetchChatHistory(ref: RepoRef): Promise<ChatMessage[]> {
  const res = await fetch(`${repoUrl(`${API_BASE_URL}/api/chat`, ref)}/history`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) return [];
  return res.json();
}