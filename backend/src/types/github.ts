export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  topics: string[];
  sizeKb: number;
  pushedAt: string;
  /** The commit SHA the tree was read at — used as the cache key in Step 6. */
  commitSha: string;
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface RepoTreeResult {
  entries: TreeEntry[];
  /**
   * True if we could not read the entire tree (repo too large even for the
   * chunked directory-by-directory fallback) and analysis will be based on
   * a partial view. False means we have the complete tree.
   */
  truncated: boolean;
}

export interface RepoContext {
  repo: RepoInfo;
  tree: TreeEntry[];
  truncated: boolean;
  /** Root manifest filename -> file content, for files that exist. */
  manifests: Record<string, string>;
  readme: string | null;
}
