// Durable, shared repo-context + graph cache backed by Postgres
// (table llm_cache). Replaces the old in-memory Map — this survives server
// restarts, so a diagram the browser already has cached locally (which
// never re-hits the backend) doesn't leave chat stuck on a 409.

import { query } from "./db.js";
import type { ContextSummary } from "../services/contextSummary.js";
import type { RepoContext } from "../types/github.js";
import type { DiagramGraph } from "../types/graph.js";

interface CacheEntry {
  context: RepoContext;
  summary: ContextSummary;
  graph: DiagramGraph;
  createdAt: number;
}

interface CacheRow {
  context: RepoContext;
  summary: ContextSummary;
  graph: DiagramGraph;
  created_at: string;
}

function keyParts(owner: string, repo: string): [string, string] {
  return [owner.toLowerCase(), repo.toLowerCase()];
}

export async function setRepoCache(
  owner: string,
  repo: string,
  entry: Omit<CacheEntry, "createdAt">,
): Promise<void> {
  const [o, r] = keyParts(owner, repo);
  await query(
    `INSERT INTO llm_cache (owner, repo, context, summary, graph, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (owner, repo)
     DO UPDATE SET context = $3, summary = $4, graph = $5, created_at = now()`,
    [o, r, JSON.stringify(entry.context), JSON.stringify(entry.summary), JSON.stringify(entry.graph)],
  );
}

export async function getRepoCache(owner: string, repo: string): Promise<CacheEntry | null> {
  const [o, r] = keyParts(owner, repo);
  const rows = await query<CacheRow>(
    `SELECT context, summary, graph, created_at FROM llm_cache WHERE owner = $1 AND repo = $2`,
    [o, r],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    context: row.context,
    summary: row.summary,
    graph: row.graph,
    createdAt: new Date(row.created_at).getTime(),
  };
}