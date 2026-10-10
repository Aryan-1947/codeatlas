// Generation orchestration: the actual fetching, analysis, graph generation
// (Groq), and explanation (Groq) all happen on the backend now — this hook
// just drives the real SSE stream and assembles the result into the same
// DiagramArtifact shape the rest of the UI already expects, so FileExplorer,
// MermaidCanvas, etc. needed no changes. The 12h local cache is consulted
// only for guests (isAuthenticated === false): signed-in users always hit
// the backend so their diagrams/history in Neon stay authoritative and in
// sync across devices. Guests still benefit from an instant revisit on the
// 4 example repos without an account.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { setToken } from "../lib/authToken";
import { type BackendError, streamGenerate } from "../lib/api";
import { compileMermaid } from "../lib/mermaid";
import { readCache, requestSignIn, writeCache } from "../lib/store";
import type { ApiError, DiagramArtifact, DiagramGraph, GenStage, RepoRef } from "../lib/types";


export interface GenerateState {
  stage: GenStage;
  error: ApiError | null;
  artifact: DiagramArtifact | null;
  explained: string;
  streaming: boolean;
  fromCache: boolean;
  filesScanned: number;
  /** Non-fatal issues the backend self-healed while validating the graph. */
  warnings: string[];
}

const INITIAL: GenerateState = {
  stage: "idle",
  error: null,
  artifact: null,
  explained: "",
  streaming: false,
  fromCache: false,
  filesScanned: 0,
  warnings: [],
};

export const STAGE_LABELS: Record<Exclude<GenStage, "idle" | "done" | "error">, string> = {
  fetching: "Fetching repository",
  analyzing: "Analyzing file tree",
  graph: "Generating diagram (Groq)",
  explaining: "Writing walkthrough (Groq)",
};

/** Maps the backend's free-form error code to the ErrorView's known kinds,
 * while always preserving the backend's real message text. */
function toApiError(err: BackendError): ApiError {
  const kindByCode: Record<string, ApiError["kind"]> = {
    not_found: "not_found",
    rate_limit: "rate_limit",
    forbidden: "forbidden",
    unauthorized: "forbidden",
    network_error: "network",
    connection_error: "network",
  };
  return { kind: kindByCode[err.code] ?? "unknown", message: err.message };
}

export function useGenerate(ref: RepoRef | null) {
  const [state, setState] = useState<GenerateState>(INITIAL);
  const { isLoading: authLoading, isAuthenticated, getAccessTokenSilently } = useAuth0();
  const cancelRef = useRef<(() => void) | null>(null);
  const runId = useRef(0);

  // Partial pieces accumulated as SSE events arrive, assembled into a
  // DiagramArtifact once everything's in.
  const partial = useRef<{
    repo: DiagramArtifact["repo"] | null;
    stats: DiagramArtifact["stats"] | null;
    tree: DiagramArtifact["tree"];
    truncated: boolean;
    graph: DiagramGraph | null;
    explanation: string;
  }>({ repo: null, stats: null, tree: undefined, truncated: false, graph: null, explanation: "" });

  const run = useCallback(
    (forceRefresh = false) => {
      if (!ref) return;
      const id = ++runId.current;
      const stale = () => runId.current !== id;

      cancelRef.current?.();
      partial.current = { repo: null, stats: null, tree: undefined, truncated: false, graph: null, explanation: "" };
      setState({ ...INITIAL, stage: "fetching" });

      const key = `${ref.owner}/${ref.repo}`;

      if (!forceRefresh && !isAuthenticated) {
        const cached = readCache(key);
        if (cached) {
          const mermaid = compileMermaid(cached.graph);
          setState((s) => ({
            ...s,
            artifact: { ...cached, mermaid },
            explained: cached.explanation,
            fromCache: true,
            stage: "done",
          }));
          return;
        }
      }


      const startStream = async () => {
        if (isAuthenticated) {
          try {
            const res: any = await getAccessTokenSilently({ detailedResponse: true });
            setToken(res.access_token, Date.now() + res.expires_in * 1000);
          } catch {
            /* request proceeds without a token */
          }
        }
        if (stale()) return;


      cancelRef.current = streamGenerate(ref, {
        onStage: (stage) => {
          if (stale()) return;
          setState((s) => ({ ...s, stage: stage as GenStage }));
        },

        onContext: ({ repo, tree, truncated, stats }) => {
          if (stale()) return;
          partial.current.repo = repo;
          partial.current.tree = tree;
          partial.current.truncated = truncated;
          partial.current.stats = stats;
          setState((s) => ({ ...s, filesScanned: stats.fileCount }));
        },

        onGraph: ({ graph, warnings }) => {
          if (stale()) return;
          partial.current.graph = graph;
          setState((s) => ({ ...s, warnings }));
        },

        onExplanationChunk: (text) => {
          if (stale()) return;
          partial.current.explanation += text;
          setState((s) => ({ ...s, explained: partial.current.explanation, streaming: true }));
        },

        onDone: () => {
          if (stale()) return;
          const { repo, stats, tree, truncated, graph, explanation } = partial.current;
          if (!repo || !stats || !graph) {
            setState((s) => ({
              ...s,
              stage: "error",
              error: { kind: "unknown", message: "The backend finished without sending complete data." },
            }));
            return;
          }

          const artifact: DiagramArtifact = {
            version: 1,
            repo,
            stats,
            graph,
            mermaid: compileMermaid(graph),
            explanation,
            createdAt: Date.now(),
            tree,
          };
          void truncated; // surfaced via artifact.tree presence + stats; no separate field needed client-side

          writeCache(key, artifact);

          setState((s) => ({ ...s, artifact, streaming: false, stage: "done" }));
        },

        onFail: (err) => {
          if (stale()) return;
          if (err.code === "unauthorized") requestSignIn();
          setState((s) => ({ ...s, stage: "error", error: toApiError(err) }));
        },
      });
    };
    startStream();
    },
    [ref, isAuthenticated, getAccessTokenSilently],
  );

  useEffect(() => {
    if (authLoading) return;
    run();
    return () => {
      runId.current++;
      cancelRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref?.owner, ref?.repo, authLoading]);

  // Streaming never truly "pauses" mid-explanation here (chunks arrive and
  // apply immediately), so skipStreaming just jumps state to done using
  // whatever's been assembled so far — matches the old API surface
  // DiagramPage.tsx already expects.
  const skipStreaming = useCallback(() => {
    setState((s) => (s.artifact ? { ...s, streaming: false, stage: "done" } : s));
  }, []);

  return { state, regenerate: () => run(true), skipStreaming };
}
