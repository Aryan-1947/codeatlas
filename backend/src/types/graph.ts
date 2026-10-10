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

export const NODE_ROLES: NodeRole[] = [
  "entry", "client", "api", "service", "data", "auth", "infra", "test", "docs", "asset",
];

export interface GraphNode {
  id: string;
  label: string;
  role: NodeRole;
  group: string;
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

export interface GenerateGraphResult {
  graph: DiagramGraph;
  /** Non-fatal issues that were self-healed (dropped edge, coerced group, etc). */
  warnings: string[];
}
