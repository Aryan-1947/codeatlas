// Plain substring matching over real tree paths. This is retrieval, not
// generation — it exists so chat can answer "where is X handled?" for
// something outside the ~12 graph nodes without ever inventing a path.

import type { TreeEntry } from "../types/github.js";

const STOP = new Set([
  "the", "a", "an", "is", "are", "how", "what", "where", "does", "do", "this", "that",
  "in", "of", "to", "for", "and", "or", "it", "its", "on", "with", "repo", "repository",
  "project", "code", "codebase", "work", "works", "working", "handled", "used", "there",
  "i", "you", "we", "can", "file", "files", "find", "show", "me", "about",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const MAX_RESULTS = 12;
const MIN_MATCH_LEN = 3;

/** Splits a path into lowercase word fragments: by separators and camelCase. */
function pathWords(path: string): string[] {
  return path
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= MIN_MATCH_LEN);
}

function wordsMatch(a: string, b: string): boolean {
  if (a.length < MIN_MATCH_LEN || b.length < MIN_MATCH_LEN) return a === b;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export function searchTreePaths(question: string, tree: TreeEntry[]): string[] {
  const tokens = tokenize(question);
  if (tokens.length === 0) return [];

  const blobs = tree.filter((t) => t.type === "blob");
  const scored = blobs
    .map((t) => {
      const words = pathWords(t.path);
      const score = tokens.reduce(
        (s, tok) => s + (words.some((w) => wordsMatch(w, tok)) ? 1 : 0),
        0,
      );
      return { path: t.path, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_RESULTS).map((s) => s.path);
}
