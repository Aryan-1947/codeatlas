// Assembles everything a repo "context" needs: metadata, file tree, the
// root manifest files that exist, and a README excerpt. This is the exact
// bundle Step 3's Groq pipeline will consume to generate the diagram —
// built here so that piece is already correct and tested before an LLM
// call ever depends on it.

import { fetchReadme, fetchRepoInfo, fetchRepoTree, fetchRawFile, ROOT_MANIFESTS } from "./github.js";
import type { RepoContext, RepoRef } from "../types/github.js";

export async function buildRepoContext(ref: RepoRef, userToken?: string): Promise<RepoContext> {
  const info = await fetchRepoInfo(ref, userToken);
  const { entries, truncated } = await fetchRepoTree(info, userToken);

  const manifestEntries = await Promise.all(
    ROOT_MANIFESTS.map(async (name) => {
      const exists = entries.some((e) => e.type === "blob" && e.path === name);
      if (!exists) return [name, null] as const;
      return [name, await fetchRawFile(info, name, userToken)] as const;
    }),
  );
  const manifests: Record<string, string> = {};
  for (const [name, text] of manifestEntries) {
    if (text) manifests[name] = text;
  }

  const readme = await fetchReadme(info, entries, userToken);

  return { repo: info, tree: entries, truncated, manifests, readme };
}
