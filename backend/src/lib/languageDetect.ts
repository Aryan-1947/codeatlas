// Pure fact extraction: counts extensions across the real tree. No inference,
// no LLM — this is the kind of thing that should never be "guessed."

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", pyi: "Python",
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin",
  rb: "Ruby", php: "PHP", cs: "C#", cpp: "C++", cc: "C++", cxx: "C++",
  c: "C", h: "C/C++", hpp: "C/C++", swift: "Swift", scala: "Scala",
  dart: "Dart", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell",
  lua: "Lua", r: "R", jl: "Julia", vue: "Vue", svelte: "Svelte",
  css: "CSS", scss: "CSS", less: "CSS", html: "HTML", sh: "Shell", bash: "Shell",
  sql: "SQL", tf: "Terraform", groovy: "Groovy", pl: "Perl", zig: "Zig",
};

export function extOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : "";
}

export function languageOf(path: string): string | null {
  return LANGUAGE_BY_EXT[extOf(path)] ?? null;
}

export interface LanguageShare {
  name: string;
  share: number;
}

/** Real percentage breakdown by file count, computed from actual paths. */
export function computeLanguages(blobPaths: string[]): LanguageShare[] {
  const counts = new Map<string, number>();
  for (const path of blobPaths) {
    const lang = languageOf(path);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, n]) => ({ name, share: Math.round((n / total) * 100) }));
}
