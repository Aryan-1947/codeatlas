// Compiles the validated graph AST into Mermaid flowchart source and renders
// it to SVG. The compiled source is theme-independent: nodes are tagged with
// role classes, and the actual role colors are injected as CSS at render time
// for the active light/dark palette. GitHub links are attached post-render by
// matching node ids back through a lookup map, so nothing user-controlled
// ever becomes markup.

import mermaid from "mermaid";
import type { DiagramGraph, GraphNode, NodeRole } from "./types";

export interface DiagramPalette {
  bg: string;
  text: string;
  textSoft: string;
  line: string;
  clusterBg: string;
  clusterLine: string;
  roles: Record<NodeRole, { fill: string; stroke: string; text: string }>;
}

const OUTLINE = "#141414";

export const LIGHT_PALETTE: DiagramPalette = {
  bg: "#ffffff",
  text: "#141414",
  textSoft: "#3d3a33",
  line: "#141414",
  clusterBg: "#faf6ec",
  clusterLine: "#141414",
  roles: {
    entry: { fill: "#7a5cff", stroke: OUTLINE, text: "#ffffff" },
    client: { fill: "#e9e2ff", stroke: OUTLINE, text: "#141414" },
    api: { fill: "#cdefdf", stroke: OUTLINE, text: "#141414" },
    service: { fill: "#f1ecdd", stroke: OUTLINE, text: "#141414" },
    auth: { fill: "#ffd3dd", stroke: OUTLINE, text: "#141414" },
    data: { fill: "#ffe9a8", stroke: OUTLINE, text: "#141414" },
    infra: { fill: "#cfe6ff", stroke: OUTLINE, text: "#141414" },
    test: { fill: "#d6f5b9", stroke: OUTLINE, text: "#141414" },
    docs: { fill: "#ffe1c9", stroke: OUTLINE, text: "#141414" },
    asset: { fill: "#f9e8ff", stroke: OUTLINE, text: "#141414" },
  },
};

const DARK_BASE = "#4b4b55";
const DARK_CLUSTER = "#2f2f34";
const DARK_STROKE = "#141414";
const DARK_TEXT = "#f5f5f5";

export const DARK_PALETTE: DiagramPalette = {
  bg: "#2b2b30",
  text: DARK_TEXT,
  textSoft: "#b7b7bf",
  line: "#161616",
  clusterBg: DARK_CLUSTER,
  clusterLine: "#161616",
  roles: {
    entry: { fill: "#8b5cf6", stroke: DARK_STROKE, text: "#ffffff" },
    client: { fill: DARK_BASE, stroke: DARK_STROKE, text: DARK_TEXT },
    api: { fill: DARK_BASE, stroke: DARK_STROKE, text: DARK_TEXT },
    service: { fill: DARK_BASE, stroke: DARK_STROKE, text: DARK_TEXT },
    auth: { fill: DARK_BASE, stroke: DARK_STROKE, text: DARK_TEXT },
    data: { fill: DARK_BASE, stroke: DARK_STROKE, text: DARK_TEXT },
    infra: { fill: "#162347", stroke: DARK_STROKE, text: "#dbeafe" },
    test: { fill: "#176534", stroke: DARK_STROKE, text: "#dcfce7" },
    docs: { fill: "#7c2d12", stroke: DARK_STROKE, text: "#ffedd5" },
    asset: { fill: "#7c2d12", stroke: DARK_STROKE, text: "#ffedd5" },
  },
};

/* ------------------------------ text escaping ------------------------------ */

function esc(text: string): string {
  return text
    .replace(/&/g, "#38;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/"/g, "#quot;")
    .replace(/\(/g, "#40;")
    .replace(/\)/g, "#41;")
    .replace(/\[/g, "#91;")
    .replace(/\]/g, "#93;")
    .replace(/\{/g, "#123;")
    .replace(/\}/g, "#125;")
    .replace(/\|/g, "#124;");
}

/** Mermaid ids must be [A-Za-z0-9_]; repo-path-derived ids (".github", etc.)
 * aren't, so every id emitted into Mermaid source goes through this first.
 * Exported so callers building the id->GitHub-URL lookup map (consumed by
 * linkifySvg) key it the same way — otherwise sanitized ids in the rendered
 * SVG would no longer match map keys built from the raw node.id. */
export function sanitizeId(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(safe) ? safe : `n_${safe}`;
}

function nodeShape(node: GraphNode, label: string): string {
  const id = sanitizeId(node.id);
  switch (node.role) {
    case "entry":
      return `${id}(["${label}"])`;
    case "data":
      return `${id}[("${label}")]`;
    case "api":
      return `${id}[["${label}"]]`;
    case "client":
      return `${id}["${label}"]`;
    default:
      return `${id}["${label}"]`;
  }
}

function shortDetail(node: GraphNode): string {
  if (node.role === "entry") return node.path;
  const parts = node.detail.split("·").map((p) => p.trim());
  return parts.length >= 2 ? `${parts[0]} · ${parts[parts.length - 1]}` : node.detail;
}

/** Compile the graph AST into theme-independent Mermaid flowchart source. */
export function compileMermaid(graph: DiagramGraph): string {
  const lines: string[] = ["flowchart TD"];

  for (const group of graph.groups) {
    const members = graph.nodes.filter((n) => n.group === group.id);
    if (members.length === 0) continue;
    lines.push(`  subgraph g_${sanitizeId(group.id)}["${esc(group.title)}"]`);
    lines.push("    direction TB");
    for (const node of members) {
      const label = `${esc(node.label)}<br/><span class="sub">${esc(shortDetail(node))}</span>`;
      lines.push(`    ${nodeShape(node, label)}`);
    }
    lines.push("  end");
  }

  for (const edge of graph.edges) {
    const arrow = edge.dashed ? "-.->" : "-->";
    const mid = edge.label ? `|"${esc(edge.label)}"|` : "";
    lines.push(`  ${sanitizeId(edge.from)} ${arrow}${mid} ${sanitizeId(edge.to)}`);
  }

  const roles = new Set<NodeRole>(graph.nodes.map((n) => n.role));
  for (const role of roles) {
    const ids = graph.nodes.filter((n) => n.role === role).map((n) => n.id);
    if (ids.length > 0) {
      for (const id of ids) {
        lines.push(`  class ${sanitizeId(id)} role_${role}`);
      }
    }
  }
  return lines.join("\n");
}

/* --------------------------------- render ---------------------------------- */

function themeCSS(p: DiagramPalette): string {
  const parts: string[] = [];
  for (const [role, c] of Object.entries(p.roles)) {
    parts.push(
      `.node.role_${role} > rect, .node.role_${role} > polygon, .node.role_${role} > circle, .node.role_${role} > path, .node.role_${role} path { fill:${c.fill}; stroke:${c.stroke}; stroke-width:2px; }`,
      `.node.role_${role} .nodeLabel, .node.role_${role} foreignObject div, .node.role_${role} foreignObject span { color:${c.text}; fill:${c.text}; }`,
      `.node.role_${role} rect, .node.role_${role} polygon, .node.role_${role} circle { rx: 6px; ry: 6px; }`,
    );
  }
  parts.push(
    `.node .nodeLabel { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-weight: 700; font-size: 13.5px; }`,
    `.nodeLabel .sub, .node .sub { font-weight: 500; font-size: 11px; opacity: 0.8; }`,
    `.edgeLabel, .edgeLabel p, .edgeLabel span { font-family: "JetBrains Mono", monospace; font-weight: 600; font-size: 10.5px; color:${p.textSoft}; fill:${p.textSoft}; background-color: transparent !important; }`,
    `.edgeLabel rect { fill: ${p.bg} !important; opacity: 0.92; }`,
    `.cluster rect { rx: 8px; ry: 8px; fill: ${p.clusterBg}; stroke: ${p.clusterLine}; stroke-width: 2px; }`,
    `.cluster-label, .cluster-label span, .cluster-label p { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color:${p.textSoft}; fill:${p.textSoft}; }`,
    `.edgePaths path, .flowchart-link { stroke: ${p.line}; stroke-width: 2px; }`,
    `marker path, marker polygon, .marker, .arrowMarkerPath { fill: ${p.line}; stroke: ${p.line}; }`,
  );
  return parts.join("\n");
}

let renderSeq = 0;

/**
 * Render Mermaid `source` to SVG markup for the given color mode.
 * The caller injects the returned string into the DOM.
 */
export async function renderDiagram(source: string, dark: boolean): Promise<string> {
  const p = dark ? DARK_PALETTE : LIGHT_PALETTE;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: p.bg,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      fontSize: "14px",
      primaryColor: p.roles.service.fill,
      primaryTextColor: p.text,
      primaryBorderColor: p.roles.service.stroke,
      lineColor: p.line,
      secondaryColor: p.clusterBg,
      tertiaryColor: p.clusterBg,
      clusterBkg: p.clusterBg,
      clusterBorder: p.clusterLine,
      edgeLabelBackground: p.bg,
      titleColor: p.text,
      nodeTextColor: p.text,
    },
    themeCSS: themeCSS(p),
    flowchart: {
      htmlLabels: true,
      curve: "basis",
      nodeSpacing: 42,
      rankSpacing: 52,
      padding: 12,
      useMaxWidth: false,
    },
  });

  const id = `gd-mmd-${++renderSeq}-${Date.now()}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}

/**
 * Attach GitHub links to a rendered SVG: each node's click opens the mapped
 * URL in a new tab. Mermaid node ids look like "flowchart-n3-17".
 */
export function linkifySvg(container: HTMLElement, links: Map<string, string>) {
  const nodes = container.querySelectorAll<SVGGElement>("g.node");
  nodes.forEach((g) => {
    const raw = g.getAttribute("id") ?? "";
    const m = raw.match(/flowchart-([A-Za-z0-9_]+)-\d+/);
    const id = m?.[1];
    if (!id) return;
    const url = links.get(id);
    if (!url) return;
    g.setAttribute("data-gd-target", url);
    if (!g.querySelector("title")) {
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `Open on GitHub: ${url}`;
      g.prepend(title);
    }
    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}
