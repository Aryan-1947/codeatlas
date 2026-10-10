// Repository file explorer: an added feature on top of the classic layout.
// Renders the real git tree as a collapsible file browser; every row links
// out to the matching file or directory on GitHub.

import { ChevronRight, FileCode2, FileText, File as FileIcon, FolderClosed, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { githubFileLink } from "../lib/github";
import type { DiagramArtifact, TreeEntry } from "../lib/types";

interface FsNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  children: FsNode[];
}

const NOISE = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage", "__pycache__", ".venv", "venv", "target"]);

function buildTree(entries: TreeEntry[]): FsNode[] {
  const root: FsNode = { name: "", path: "", isDir: true, size: 0, children: [] };
  const dirs = new Map<string, FsNode>([["", root]]);

  for (const e of entries) {
    const parts = e.path.split("/");
    if (parts.some((p) => NOISE.has(p))) continue;
    let parent = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      if (!isLast || e.type === "tree") {
        let dir = dirs.get(acc);
        if (!dir) {
          dir = { name: parts[i], path: acc, isDir: true, size: 0, children: [] };
          dirs.set(acc, dir);
          parent.children.push(dir);
        }
        parent = dir;
      } else {
        parent.children.push({ name: parts[i], path: acc, isDir: false, size: e.size ?? 0, children: [] });
      }
    }
  }
  const sort = (nodes: FsNode[]) => {
    nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "mdx", "rst", "txt", "adoc"].includes(ext)) return <FileText size={13} className="shrink-0 text-amber" />;
  if (["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "rb", "php", "c", "cpp", "cs", "swift", "vue", "svelte", "css", "html", "json", "yml", "yaml", "toml", "sql", "sh"].includes(ext))
    return <FileCode2 size={13} className="shrink-0 text-accent" />;
  return <FileIcon size={13} className="shrink-0 text-muted" />;
}

function Row({
  node,
  depth,
  artifact,
  highlight,
}: {
  node: FsNode;
  depth: number;
  artifact: DiagramArtifact;
  highlight: Set<string>;
}) {
  const [open, setOpen] = useState(depth < 1 && node.children.length < 60);
  const inDiagram = highlight.has(node.path);
  const url = githubFileLink(artifact.repo, node.path, node.isDir);

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-1 rounded-md py-[3px] pr-2 text-left text-[12.5px] transition ${
          inDiagram ? "border-2 border-line bg-lavend shadow-sm dark:bg-accent-soft" : "border-2 border-transparent hover:bg-sunken"
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {node.isDir ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted transition hover:text-ink"
            aria-label={open ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-ink-2 transition group-hover:text-ink"
        >
          {node.isDir ? (
            open ? <FolderOpen size={13} className="shrink-0 text-accent" /> : <FolderClosed size={13} className="shrink-0 text-accent" />
          ) : (
            fileIcon(node.name)
          )}
          <span className={`truncate font-mono ${inDiagram ? "font-semibold text-accent" : ""}`}>{node.name}</span>
          {!node.isDir && node.size > 0 && (
            <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-muted group-hover:inline">
              {node.size >= 1024 ? `${(node.size / 1024).toFixed(0)}k` : `${node.size}b`}
            </span>
          )}
        </a>
      </div>
      {node.isDir && open && (
        <div>
          {node.children.slice(0, 300).map((child) => (
            <Row key={child.path} node={child} depth={depth + 1} artifact={artifact} highlight={highlight} />
          ))}
          {node.children.length > 300 && (
            <p className="py-1 pl-8 font-mono text-[10.5px] text-muted">…{node.children.length - 300} more entries</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer({
  artifact,
  tree,
}: {
  artifact: DiagramArtifact;
  tree: TreeEntry[];
}) {
  const forest = useMemo(() => buildTree(tree), [tree]);
  const highlight = useMemo(() => new Set(artifact.graph.nodes.map((n) => n.path)), [artifact]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b-2 border-line bg-surface px-3.5 py-2.5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted">
          explorer
        </span>
        <span className="font-mono text-[10.5px] font-semibold text-muted">{artifact.stats.fileCount} files</span>
      </div>
      <p className="border-b-2 border-line bg-lavend px-3.5 py-2 text-[11px] font-semibold leading-snug text-[#2b1e63] dark:bg-accent-soft dark:text-accent">
        Rows framed in lavender are part of the diagram. Open them to inspect the code.
      </p>
      <div className="nice-scroll flex-1 overflow-auto px-1 py-1.5">
        {forest.map((node) => (
          <Row key={node.path} node={node} depth={0} artifact={artifact} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}
