// Pure, client-only helpers. All actual GitHub API calls (metadata, tree,
// raw files, README) now happen on the backend, using a server-owned token
// — see backend/src/services/github.ts. Nothing here makes a network call.

import type { RepoInfo, RepoRef } from "./types";

function stripGit(name: string) {
  return name.replace(/\.git$/i, "");
}

/** Parse "owner/repo", plain GitHub URLs and diagram-style URLs into a ref. */
export function parseRepoInput(raw: string): RepoRef | null {
  const input = raw.trim();
  if (!input) return null;

  const short = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (short) return { owner: short[1], repo: stripGit(short[2]) };

  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: stripGit(parts[1]) };
  } catch {
    return null;
  }
}

export function githubFileLink(info: RepoInfo, path: string, isDir: boolean): string {
  const kind = isDir ? "tree" : "blob";
  return `https://github.com/${info.owner}/${info.repo}/${kind}/${info.defaultBranch}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
