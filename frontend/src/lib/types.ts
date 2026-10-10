// Shared domain types for the diagram pipeline.

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
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export type NodeRole =
  | "entry"
  | "client"
  | "api"
  | "service"
  | "data"
  | "auth"
  | "infra"
  | "test"
  | "docs"
  | "asset";

export interface GraphNode {
  id: string;
  label: string;
  role: NodeRole;
  group: string;
  /** Repo path used to build the GitHub link (file or directory). */
  path: string;
  isDirectory: boolean;
  /** One factual line, e.g. "43 files · TypeScript · request handlers" */
  detail: string;
  fileCount: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface GraphGroup {
  id: string;
  title: string;
}

export interface DiagramGraph {
  groups: GraphGroup[];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface RepoStats {
  fileCount: number;
  dirCount: number;
  totalKb: number;
  languages: { name: string; share: number }[];
  primaryLanguage: string;
  stack: string[]; // detected frameworks / platforms
  testFiles: number;
  docFiles: number;
}

export interface DiagramArtifact {
  version: 1;
  repo: RepoInfo;
  stats: RepoStats;
  graph: DiagramGraph;
  mermaid: string;
  explanation: string;
  createdAt: number;
  /** Raw git tree, kept for the file explorer. */
  tree?: TreeEntry[];
}

export type GenStage =
  | "idle"
  | "fetching"
  | "analyzing"
  | "graph"
  | "explaining"
  | "done"
  | "error";

export interface HistoryItem {
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  createdAt: number;
}

export interface ApiError {
  kind: "not_found" | "rate_limit" | "network" | "forbidden" | "unknown";
  message: string;
}
