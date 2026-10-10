// GitHub REST client. Runs server-side using an optional server-owned token
// (env.GITHUB_TOKEN), so no visitor is ever rate-limited by someone else's
// usage, and no token ever reaches the browser.
//
// Large-repo handling: GitHub's single recursive tree call gets truncated
// past ~100k entries / 7MB. Instead of rejecting those repos outright, we
// fall back to walking top-level directories individually and aggregating,
// capped at MAX_TOTAL_FILES, so even a huge monorepo still yields a real
// (if partial) picture — the caller is told via `truncated: true`.

import { env } from "../config/env.js";
import { ApiError } from "../middleware/errorHandler.js";
import type { RepoInfo, RepoRef, RepoTreeResult, TreeEntry } from "../types/github.js";

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";

const NOISE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", "coverage",
  "vendor", "__pycache__", ".venv", "venv", "target", ".turbo", ".cache",
]);

const MAX_TOTAL_FILES = 8000;
const MAX_SUBDIR_FILES = 3000;

export const ROOT_MANIFESTS = [
  "package.json", "requirements.txt", "pyproject.toml", "Pipfile", "setup.py",
  "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
  "Gemfile", "composer.json", "Dockerfile", "docker-compose.yml",
  "docker-compose.yaml", "mix.exs", "pubspec.yaml",
];

/* --------------------------------- fetch helpers -------------------------------- */

function headers(userToken?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "codeatlas-backend",
  };
  const token = userToken ?? env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function githubFetch(path: string, userToken?: string): Promise<Response> {
  try {
    return await fetch(`${GITHUB_API}${path}`, { headers: headers(userToken) });
  } catch {
    throw new ApiError(502, "network_error", "Network error while contacting GitHub.");
  }
}

// Node's bundled fetch types return `unknown` from res.json() (stricter than
// the DOM lib's `any`). We validate shape downstream with zod once Step 3
// consumes this data; here we just need a typed handle to read fields off.
async function readJson(res: Response): Promise<Record<string, any>> {
  return (await res.json()) as Record<string, any>;
}

async function throwForStatus(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  const remaining = res.headers.get("x-ratelimit-remaining");

  if (res.status === 404) {
    throw new ApiError(
      404,
      "not_found",
      "Repository not found. If it's private, this backend can't read it yet.",
    );
  }
  if (res.status === 403 || res.status === 429) {
    if (remaining === "0" || /rate limit/i.test(body)) {
      throw new ApiError(
        429,
        "rate_limit",
        env.GITHUB_TOKEN
          ? "GitHub API rate limit reached for our server token. Try again shortly."
          : "GitHub API rate limit reached. Set GITHUB_TOKEN in backend/.env to raise it.",
      );
    }
    throw new ApiError(403, "forbidden", "GitHub refused the request.");
  }
  throw new ApiError(502, "github_error", `GitHub request failed (${res.status}).`);
}

/* --------------------------------- repo metadata --------------------------------- */

export async function fetchRepoInfo(ref: RepoRef, userToken?: string): Promise<RepoInfo> {
  const res = await githubFetch(`/repos/${ref.owner}/${ref.repo}`, userToken);
  if (!res.ok) await throwForStatus(res);
  const d = await readJson(res);

  const branch: string = d.default_branch ?? "main";

  // Resolve the exact commit the default branch points at right now — this
  // becomes the cache key in Step 6, so a stale diagram never gets served
  // silently after the repo has moved on.
  const branchRes = await githubFetch(
    `/repos/${ref.owner}/${ref.repo}/branches/${encodeURIComponent(branch)}`,
    userToken,
  );
  const commitSha: string = branchRes.ok ? ((await readJson(branchRes))?.commit?.sha ?? "") : "";

  return {
    owner: d.owner?.login ?? ref.owner,
    repo: d.name ?? ref.repo,
    fullName: d.full_name ?? `${ref.owner}/${ref.repo}`,
    description: d.description ?? null,
    stars: d.stargazers_count ?? 0,
    language: d.language ?? null,
    defaultBranch: branch,
    isPrivate: Boolean(d.private),
    htmlUrl: d.html_url ?? `https://github.com/${ref.owner}/${ref.repo}`,
    topics: Array.isArray(d.topics) ? d.topics.slice(0, 6) : [],
    sizeKb: d.size ?? 0,
    pushedAt: d.pushed_at ?? "",
    commitSha,
  };
}

/* ----------------------------------- tree walk ----------------------------------- */

interface RawTreeItem {
  path: string;
  type: string;
  size?: number;
  sha: string;
}

interface RawGitTree {
  tree: RawTreeItem[];
  truncated: boolean;
}

async function fetchTreeBySha(
  owner: string,
  repo: string,
  sha: string,
  recursive: boolean,
  userToken?: string,
): Promise<RawGitTree> {
  const res = await githubFetch(
    `/repos/${owner}/${repo}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`,
    userToken,
  );
  if (!res.ok) await throwForStatus(res);
  const d = await readJson(res);
  return { tree: Array.isArray(d.tree) ? d.tree : [], truncated: Boolean(d.truncated) };
}

function toEntries(raw: RawTreeItem[], prefix = ""): TreeEntry[] {
  const out: TreeEntry[] = [];
  for (const e of raw) {
    if (typeof e.path !== "string") continue;
    const path = prefix ? `${prefix}/${e.path}` : e.path;
    if (path.split("/").some((p) => NOISE_DIRS.has(p))) continue;
    out.push({ path, type: e.type === "tree" ? "tree" : "blob", size: e.size ?? 0 });
  }
  return out;
}

export async function fetchRepoTree(info: RepoInfo, userToken?: string): Promise<RepoTreeResult> {
  // Attempt 1: the whole repo in one recursive call — works for the vast
  // majority of repos.
  const whole = await fetchTreeBySha(info.owner, info.repo, info.defaultBranch, true, userToken);
  const entries = toEntries(whole.tree);
  const blobCount = entries.filter((e) => e.type === "blob").length;

  if (!whole.truncated && blobCount <= MAX_TOTAL_FILES) {
    return { entries, truncated: false };
  }

  // Attempt 2: too big for one call. List the top level, then walk each
  // top-level directory's subtree individually and aggregate, so a huge
  // monorepo still yields real, usable data instead of a flat rejection.
  const top = await fetchTreeBySha(info.owner, info.repo, info.defaultBranch, false, userToken);
  const topEntries = top.tree.filter((e) => !NOISE_DIRS.has(e.path));

  const aggregated: TreeEntry[] = [];
  let hitCap = false;

  for (const e of topEntries) {
    const blobsSoFar = aggregated.reduce((n, a) => n + (a.type === "blob" ? 1 : 0), 0);
    if (blobsSoFar >= MAX_TOTAL_FILES) {
      hitCap = true;
      break;
    }
    if (e.type === "blob") {
      aggregated.push({ path: e.path, type: "blob", size: e.size ?? 0 });
      continue;
    }
    if (e.type === "tree") {
      const sub = await fetchTreeBySha(info.owner, info.repo, e.sha, true, userToken);
      const subEntries = toEntries(sub.tree, e.path).slice(0, MAX_SUBDIR_FILES);
      aggregated.push(...subEntries);
      if (sub.truncated || subEntries.length >= MAX_SUBDIR_FILES) hitCap = true;
    }
  }

  return { entries: aggregated, truncated: hitCap };
}

/* ------------------------------------ raw files ----------------------------------- */

export async function fetchRawFile(info: RepoInfo, path: string, userToken?: string): Promise<string | null> {
  try {
    const url = `${GITHUB_RAW}/${info.owner}/${info.repo}/${info.defaultBranch}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const token = userToken ?? env.GITHUB_TOKEN;
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 60_000);
  } catch {
    return null;
  }
}

export async function fetchReadme(info: RepoInfo, tree: TreeEntry[], userToken?: string): Promise<string | null> {
  const readme = tree.find(
    (t) =>
      t.type === "blob" &&
      /^readme(\.\w+)?$/i.test(t.path.split("/").pop() ?? "") &&
      !t.path.includes("/"),
  );
  if (!readme) return null;
  const raw = await fetchRawFile(info, readme.path, userToken);
  return raw ? raw.slice(0, 4000) : null;
}
