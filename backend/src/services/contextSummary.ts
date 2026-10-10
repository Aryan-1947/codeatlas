// Turns a (potentially huge) RepoContext into a small, factual summary that
// fits comfortably in a prompt. Every number here is counted from the real
// tree — nothing is estimated or invented. The LLM's job (in generateGraph)
// is to judge which of these real candidates matter and how they relate,
// not to guess at facts we can just compute.

import { computeLanguages, extOf, languageOf, type LanguageShare } from "../lib/languageDetect.js";
import { detectStack } from "../lib/stackDetect.js";
import type { RepoContext, TreeEntry } from "../types/github.js";

const MAX_DIR_CANDIDATES = 14;
const MAX_ENTRY_CANDIDATES = 3;
const MAX_SAMPLE_FILES = 5;
const MANIFEST_EXCERPT_CHARS = 800;
const README_EXCERPT_CHARS = 1500;

export interface PathCandidate {
  path: string;
  isDirectory: boolean;
  fileCount: number;
  dominantLanguage: string | null;
  sampleFiles: string[];
}

export interface ContextSummary {
  repoFullName: string;
  description: string | null;
  primaryLanguage: string;
  languages: LanguageShare[];
  stack: string[];
  fileCount: number;
  dirCount: number;
  totalKb: number;      
  testFileCount: number;
  docFileCount: number;
  truncated: boolean;
  /** Every path the LLM is allowed to use as a node — see schemas/graph.ts. */
  candidates: PathCandidate[];
  entryCandidatePaths: string[];
  manifestExcerpts: Record<string, string>;
  readmeExcerpt: string | null;
}

const ENTRY_NAME =
  /^(main|index|app|server|cli|manage|run|mod)(\.(ts|tsx|js|jsx|mjs|py|go|rs|rb|php|java|kt|cs|cpp|c|swift|dart|ex|exs|lua|sh))?$/i;

function baseOf(path: string): string {
  return (path.split("/").pop() ?? "").toLowerCase();
}

function findEntryCandidates(tree: TreeEntry[]): string[] {
  const scored: { path: string; score: number }[] = [];
  for (const t of tree) {
    if (t.type !== "blob") continue;
    const base = baseOf(t.path);
    const depth = t.path.split("/").length;
    if (ENTRY_NAME.test(base)) {
      let score = 10 - depth * 2;
      if (/^src\//.test(t.path)) score += 2;
      if (/main\.(py|go|rs|java|cpp|c)$/.test(base)) score += 2;
      scored.push({ path: t.path, score });
    }
    if (/^(cmd\/[^/]+\/main\.go|manage\.py|wsgi\.py|asgi\.py)$/.test(t.path)) {
      scored.push({ path: t.path, score: 12 - depth });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRY_CANDIDATES)
    .map((s) => s.path);
}

interface DirBucket {
  path: string;
  fileCount: number;
  langCounts: Map<string, number>;
  sampleFiles: string[];
}

function bucketizeTopDirs(tree: TreeEntry[]): DirBucket[] {
  const buckets = new Map<string, DirBucket>();
  const ensure = (p: string) => {
    let b = buckets.get(p);
    if (!b) {
      b = { path: p, fileCount: 0, langCounts: new Map(), sampleFiles: [] };
      buckets.set(p, b);
    }
    return b;
  };

  // Roll every blob up into its top-level directory (depth-1 segment).
  // A repo dominated by one container dir (src/, app/, lib/...) gets rolled
  // up one level deeper instead, so the candidate list isn't just "src".
  const topLevelFileTotal = tree.filter((t) => t.type === "blob" && !t.path.includes("/")).length;
  const containers = ["src", "app", "lib", "packages", "server", "client", "backend", "frontend"];
  const totalBlobs = tree.filter((t) => t.type === "blob").length || 1;
  const dominantContainer = containers.find((c) => {
    const count = tree.filter((t) => t.type === "blob" && t.path.startsWith(`${c}/`)).length;
    return count > totalBlobs * 0.45;
  });

  for (const t of tree) {
    if (t.type !== "blob") continue;
    const parts = t.path.split("/");
    if (parts.length < 2) continue; // root-level file, not a directory candidate

    let dirPath: string;
    if (dominantContainer && parts[0] === dominantContainer && parts.length >= 3) {
      dirPath = `${parts[0]}/${parts[1]}`;
    } else {
      dirPath = parts[0];
    }

    const b = ensure(dirPath);
    b.fileCount += 1;
    const lang = languageOf(t.path);
    if (lang) b.langCounts.set(lang, (b.langCounts.get(lang) ?? 0) + 1);
    if (b.sampleFiles.length < MAX_SAMPLE_FILES) b.sampleFiles.push(t.path);
  }

  void topLevelFileTotal;
  return [...buckets.values()].sort((a, b) => b.fileCount - a.fileCount);
}

export function buildContextSummary(context: RepoContext): ContextSummary {
  const { repo, tree, truncated, manifests, readme } = context;

  const blobs = tree.filter((t) => t.type === "blob");
  const blobPaths = blobs.map((b) => b.path);
  const languages = computeLanguages(blobPaths);
  const stack = detectStack(manifests, tree);

  const testFileCount = blobs.filter((b) =>
    /(\.test\.|\.spec\.|_test\.|test_)/i.test(b.path.split("/").pop() ?? ""),
  ).length;
  const docFileCount = blobs.filter((b) => /\.(md|mdx|rst|adoc)$/i.test(b.path)).length;

  const dirBuckets = bucketizeTopDirs(tree).slice(0, MAX_DIR_CANDIDATES);
  const candidates: PathCandidate[] = dirBuckets.map((b) => {
    let dominant: string | null = null;
    let max = 0;
    for (const [lang, n] of b.langCounts) {
      if (n > max) {
        dominant = lang;
        max = n;
      }
    }
    return {
      path: b.path,
      isDirectory: true,
      fileCount: b.fileCount,
      dominantLanguage: dominant,
      sampleFiles: b.sampleFiles,
    };
  });

  const entryCandidatePaths = findEntryCandidates(tree);
  for (const path of entryCandidatePaths) {
    if (candidates.some((c) => c.path === path)) continue;
    candidates.push({
      path,
      isDirectory: false,
      fileCount: 1,
      dominantLanguage: languageOf(path),
      sampleFiles: [],
    });
  }

  // A root-config candidate when there's meaningful root tooling — one real
  // file stands in for "project configuration" as a node.
  const rootConfigs = blobs.filter(
    (t) =>
      !t.path.includes("/") &&
      (Object.keys(manifests).includes(t.path) ||
        /\.(json|ya?ml|toml|cfg|ini|config\.(js|ts|mjs))$/i.test(t.path)),
  );
  if (rootConfigs.length >= 2) {
    const rep = rootConfigs[0];
    candidates.push({
      path: rep.path,
      isDirectory: false,
      fileCount: rootConfigs.length,
      dominantLanguage: languageOf(rep.path),
      sampleFiles: rootConfigs.slice(0, MAX_SAMPLE_FILES).map((f) => f.path),
    });
  }

  // Root-level fallback: some repos (tiny ones, or ones with everything at
  // the top level and no subdirectories) yield zero directory candidates.
  // Rather than failing outright, fall back to individual root-level files
  // so even a minimal repo still gets a real (if small) diagram.
  if (candidates.length === 0) {
    const rootBlobs = blobs.filter((b) => !b.path.includes("/")).slice(0, 8);
    for (const b of rootBlobs) {
      candidates.push({
        path: b.path,
        isDirectory: false,
        fileCount: 1,
        dominantLanguage: languageOf(b.path),
        sampleFiles: [],
      });
    }
  }

  const manifestExcerpts: Record<string, string> = {};
  for (const [name, text] of Object.entries(manifests)) {
    manifestExcerpts[name] = text.slice(0, MANIFEST_EXCERPT_CHARS);
  }

  return {
    repoFullName: repo.fullName,
    description: repo.description,
    primaryLanguage: languages[0]?.name ?? repo.language ?? "Unknown",
    languages,
    stack,
    fileCount: blobs.length,
    dirCount: tree.filter((t) => t.type === "tree").length,
    totalKb: Math.round(blobs.reduce((s, b) => s + (b.size ?? 0), 0) / 1024), 
    testFileCount,
    docFileCount,
    truncated,
    candidates: candidates.slice(0, MAX_DIR_CANDIDATES + MAX_ENTRY_CANDIDATES + 1),
    entryCandidatePaths,
    manifestExcerpts,
    readmeExcerpt: readme ? readme.slice(0, README_EXCERPT_CHARS) : null,
  };
}

export { extOf };
