// Interactive diagram stage. Renders the compiled Mermaid source into SVG,
// wires node clicks to GitHub URLs, and provides pan/zoom, fit-to-view,
// fullscreen, code view, and PNG/SVG export.

import {
  Check,
  Code2,
  Copy,
  Download,
  Loader2,
  Maximize,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { githubFileLink } from "../lib/github";
import { linkifySvg, renderDiagram, sanitizeId } from "../lib/mermaid";
import type { DiagramArtifact } from "../lib/types";

interface ViewState {
  x: number;
  y: number;
  s: number;
}

interface Props {
  artifact: DiagramArtifact;
  dark: boolean;
}

export default function MermaidCanvas({ artifact, dark }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const codePanelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const svgBox = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, s: 1 });
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fsSupported = typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; active: boolean }>({
    px: 0, py: 0, vx: 0, vy: 0, active: false,
  });
  
  const moved = useRef(false);
  const links = useRef(new Map<string, string>());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const node of artifact.graph.nodes) {
      map.set(sanitizeId(node.id), githubFileLink(artifact.repo, node.path, node.isDirectory));
    }
    links.current = map;
  }, [artifact]);

  /* ------------------------------- rendering ------------------------------- */

  const applyLinks = useCallback(() => {
    const inner = innerRef.current;
    if (inner) linkifySvg(inner, links.current);
  }, []);

  useEffect(() => {
    let alive = true;
    setRendering(true);
    setRenderError(null);
    renderDiagram(artifact.mermaid, dark)
      .then((svg) => {
        if (!alive || !stageRef.current) return;
        stageRef.current.innerHTML = svg;
        const svgEl = stageRef.current.querySelector("svg");
        if (svgEl) {
          const vb = svgEl.viewBox.baseVal;
          svgBox.current = { w: vb.width || svgEl.width.baseVal.value, h: vb.height || svgEl.height.baseVal.value };
          svgEl.setAttribute("width", `${svgBox.current.w}`);
          svgEl.setAttribute("height", `${svgBox.current.h}`);
        }
        applyLinks();
        setRendering(false);
      })
      .catch((e) => {
        if (!alive) return;
        setRenderError(e instanceof Error ? e.message : "Failed to render the diagram.");
        setRendering(false);
      });
    return () => {
      alive = false;
    };
  }, [artifact.mermaid, dark, applyLinks]);

  const fitView = useCallback(() => {
    const host = hostRef.current;
    const { w, h } = svgBox.current;
    if (!host || !w || !h) return;
    const pad = 48;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // canvas hidden (other mobile tab)
    const s = Math.min((rect.width - pad) / w, (rect.height - pad) / h, 1.4);
    setView({
      s: Math.max(0.1, s),
      x: (rect.width - w * s) / 2,
      y: (rect.height - h * s) / 2,
    });
  }, []);

  useEffect(() => {
    if (!rendering && !renderError) {
      const t = requestAnimationFrame(fitView);
      return () => cancelAnimationFrame(t);
    }
  }, [rendering, renderError, fitView]);

  /* ------------------------------- pan / zoom ------------------------------ */

  const clamp = (s: number) => Math.min(3, Math.max(0.1, s));

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const s = clamp(v.s * factor);
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0016);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "mouse") pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      drag.current.active = false;
      return;
    }
    moved.current = false;
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, active: true };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const host = hostRef.current;
      if (host && pinch.current.dist > 0) {
        const rect = host.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, dist / pinch.current.dist);
      }
      pinch.current.dist = dist;
      return;
    }
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    if (!moved.current) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return; // still a click, not a drag
      moved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    setView((v) => ({ ...v, x: drag.current.vx + dx, y: drag.current.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current.active = false;
    moved.current = false;
  };

  const centerZoom = (factor: number) => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    zoomAt(rect.width / 2, rect.height / 2, factor);
  };

    /* ------------------- close code drawer on outside click ------------------ */

    useEffect(() => {
      if (!showCode) return;
      const onDown = (e: PointerEvent) => {
        const t = e.target as Node;
        if (codePanelRef.current?.contains(t)) return; // click inside drawer
        if (toolbarRef.current?.contains(t)) return; // toolbar (Code button toggles itself)
        setShowCode(false);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setShowCode(false);
      };
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey);
      };
    }, [showCode]);

  /* ------------------------------ fullscreen ------------------------------- */

  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(fitView, 60);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [fitView]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapperRef.current?.requestFullscreen();
  };

  /* -------------------------------- exports -------------------------------- */

  const copyMermaid = async () => {
    try {
      await navigator.clipboard.writeText(artifact.mermaid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const svgMarkup = (): string | null => {
    const svgEl = stageRef.current?.querySelector("svg");
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", `background:${dark ? "#18181b" : "#ffffff"}`);
    // Inline the computed fonts/colors so the export is self-contained.
    const styles = Array.from(document.querySelectorAll("style"))
      .map((s) => s.textContent ?? "")
      .join("\n");
    const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleEl.textContent = styles;
    clone.prepend(styleEl);
    return new XMLSerializer().serializeToString(clone);
  };

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const exportSvg = () => {
    const markup = svgMarkup();
    if (!markup) return;
    download(new Blob([markup], { type: "image/svg+xml" }), `${artifact.repo.repo}-diagram.svg`);
    setMenuOpen(false);
  };

  const exportPng = () => {
    const markup = svgMarkup();
    if (!markup) return;
    const { w, h } = svgBox.current;
    const scale = 2;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = dark ? "#18181b" : "#ffffff";  
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) download(blob, `${artifact.repo.repo}-diagram.png`);
      }, "image/png");
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(markup)));
    setMenuOpen(false);
  };

  /* --------------------------------- render --------------------------------- */

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={hostRef}
        className="bg-blueprint mermaid-stage relative h-full w-full cursor-grab overflow-hidden bg-surface active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={innerRef} className="absolute left-0 top-0 origin-top-left">
          <div
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
            className="origin-top-left will-change-transform"
          >
            <div ref={stageRef} />
          </div>
        </div>

        {rendering && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface/80">
            <Loader2 size={22} strokeWidth={2.5} className="spin-slow text-accent" />
            <p className="font-mono text-xs font-bold text-muted">rendering diagram…</p>
          </div>
        )}
        {renderError && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-lg border-2 border-line bg-rose-soft p-4 text-sm font-semibold text-rose shadow-card">
              {renderError}
            </div>
          </div>
        )}
      </div>

      {/* Top-left toolbar */}
      <div ref={toolbarRef} className="absolute left-3 top-3 flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border-2 border-line bg-surface p-1 shadow-card">
          <button
            onClick={copyMermaid}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-ink transition hover:bg-sunken"
            title="Copy Mermaid source"
          >
            {copied ? <Check size={14} strokeWidth={2.8} className="text-teal" /> : <Copy size={14} strokeWidth={2.4} />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
          </button>
          <span className="h-4 w-0.5 bg-line" />
          <button
            onClick={() => setShowCode((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
              showCode ? "bg-lavend text-[#2b1e63]" : "text-ink hover:bg-sunken"
            }`}
            title="View Mermaid source"
          >
            <Code2 size={14} strokeWidth={2.4} />
            <span className="hidden sm:inline">Code</span>
          </button>
          <span className="h-4 w-0.5 bg-line" />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-ink transition hover:bg-sunken"
              title="Export diagram"
            >
              <Download size={14} strokeWidth={2.4} />
              <span className="hidden sm:inline">Export</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-lg border-2 border-line bg-surface py-1 shadow-pop">
                  <button
                    onClick={exportPng}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-ink transition hover:bg-mint hover:text-[#0e4f3a]"
                  >
                    <Download size={13} strokeWidth={2.4} /> PNG image (2x)
                  </button>
                  <button
                    onClick={exportSvg}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-ink transition hover:bg-mint hover:text-[#0e4f3a]"
                  >
                    <Download size={13} strokeWidth={2.4} /> SVG vector
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Top-right fullscreen */}
      {fsSupported && (
        <button
          onClick={toggleFullscreen}
          className="brut-press-sm absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border-2 border-line bg-surface text-ink shadow-card"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={14} strokeWidth={2.5} /> : <Maximize2 size={14} strokeWidth={2.5} />}
        </button>
      )}

      {/* Bottom-right zoom cluster */}
      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border-2 border-line bg-surface p-1 shadow-card">
        <button
          onClick={() => centerZoom(1 / 1.25)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition hover:bg-sunken"
          title="Zoom out"
        >
          <ZoomOut size={14} strokeWidth={2.4} />
        </button>
        <span className="w-11 text-center font-mono text-[11px] font-bold text-ink">{Math.round(view.s * 100)}%</span>
        <button
          onClick={() => centerZoom(1.25)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition hover:bg-sunken"
          title="Zoom in"
        >
          <ZoomIn size={14} strokeWidth={2.4} />
        </button>
        <span className="h-4 w-0.5 bg-line" />
        <button
          onClick={fitView}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition hover:bg-sunken"
          title="Fit to view"
        >
          <Maximize size={14} strokeWidth={2.4} />
        </button>
        <button
          onClick={() => setView({ x: 0, y: 0, s: 1 })}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink transition hover:bg-sunken"
          title="Reset to 100%"
        >
          <RotateCcw size={13} strokeWidth={2.4} />
        </button>
      </div>

      {/* Bottom-left hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 font-mono text-[10.5px] font-semibold text-muted sm:flex">
        <span className="rounded border-2 border-line bg-surface px-1.5 py-0.5 font-bold text-ink">scroll</span> zoom
        <span className="mx-1">·</span>
        <span className="rounded border-2 border-line bg-surface px-1.5 py-0.5 font-bold text-ink">drag</span> pan
        <span className="mx-1">·</span>
        <span className="rounded border-2 border-line bg-surface px-1.5 py-0.5 font-bold text-ink">click node</span> open source
      </div>

      {/* Mermaid source drawer */}
      {showCode && (
        <div ref={codePanelRef} className="absolute inset-x-3 bottom-12 top-12 z-10 flex flex-col overflow-hidden rounded-lg border-2 border-line bg-surface shadow-pop sm:inset-x-auto sm:left-3 sm:w-[440px]">
          <div className="flex items-center justify-between border-b-2 border-line bg-lavend px-3.5 py-2.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#2b1e63]">
              mermaid source
            </span>
            <button
              onClick={copyMermaid}
              className="brut-press-sm flex items-center gap-1.5 rounded-md border-2 border-line bg-surface px-2 py-1 text-xs font-bold text-ink shadow-sm"
            >
              {copied ? <Check size={13} strokeWidth={2.8} className="text-teal" /> : <Copy size={13} strokeWidth={2.4} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="nice-scroll flex-1 overflow-auto p-3.5 font-mono text-[11.5px] font-medium leading-relaxed text-ink-2">
            {artifact.mermaid}
          </pre>
        </div>
      )}
    </div>
  );
}
