// Diagram route: runs the generation pipeline, shows staged progress, then
// presents the streamed walkthrough beside the interactive canvas with the
// file explorer tab and the "Ask a question" chat drawer on top.

import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Check,
  ExternalLink,
  FastForward,
  FileText,
  FolderTree,
  GitBranch,
  History,
  Loader2,
  Network,
  MessageCircleQuestion,
  RefreshCw,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useGenerate } from "../hooks/useGenerate";
import { formatStars, navigateHome, useTheme } from "../lib/store";
import type { RepoRef } from "../lib/types";
import FileExplorer from "./FileExplorer";
import { GithubMark } from "./icons";
import MermaidCanvas from "./MermaidCanvas";
import RepoChat from "./RepoChat";

const PIPELINE = [
  { key: "fetching", label: "Fetch repository" },
  { key: "analyzing", label: "Analyze file tree" },
  { key: "graph", label: "Generate diagram" },
  { key: "explaining", label: "Write walkthrough" },
] as const;

type PipelineKey = (typeof PIPELINE)[number]["key"];

function stageIndex(stage: string): number {
  const order: PipelineKey[] = PIPELINE.map((p) => p.key);
  const i = order.indexOf(stage as PipelineKey);
  return stage === "done" ? order.length : i === -1 ? 0 : i;
}

/* ---------------------------- markdown-lite ---------------------------- */

function renderInline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-accent">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function MarkdownLite({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2.5">
      {lines.map((line, i) => {
        const isLast = i === lines.length - 1;
        const cls = streaming && isLast ? "stream-caret" : "";
        if (line.startsWith("## ")) {
          return (
            <h3 key={i} className={`pt-3 font-display text-[15px] font-bold tracking-tight text-ink ${cls}`}>
              {renderInline(line.slice(3), `h${i}`)}
            </h3>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2.5 text-[13.5px] font-medium leading-relaxed text-ink-2">
              <span className="mt-[8px] h-2 w-2 shrink-0 rounded-[3px] border border-line bg-accent" />
              <p className={cls}>{renderInline(line.slice(2), `li${i}`)}</p>
            </div>
          );
        }
        if (!line.trim()) return null;
        return (
          <p key={i} className={`text-[13.5px] font-medium leading-relaxed text-ink-2 ${cls}`}>
            {renderInline(line, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------ loading view ------------------------------ */

function LoadingView({ refName, stage, filesScanned }: { refName: string; stage: string; filesScanned: number }) {
  const current = stageIndex(stage);
  return (
    <div className="bg-doodle relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border-2 border-line bg-surface p-6 shadow-pop z-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-line bg-accent text-white shadow-sm">
            <Loader2 size={18} strokeWidth={2.5} className="spin-slow" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-bold text-ink">{refName}</p>
            <p className="text-xs font-medium text-muted">Generating architecture diagram</p>
          </div>
        </div>

        <div className="mt-6 space-y-1.5">
          {PIPELINE.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div
                key={step.key}
                className={`flex items-center gap-3 rounded-lg border-2 px-2.5 py-2 transition ${
                  active ? "border-line bg-lavend shadow-sm" : "border-transparent"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border-2 border-line text-[10px] font-mono font-bold ${
                    done
                      ? "bg-teal text-white dark:bg-teal-soft dark:text-teal"
                      : active
                        ? "bg-accent text-white"
                        : "bg-surface text-muted"
                  }`}
                >
                  {done ? <Check size={11} strokeWidth={3.5} /> : active ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" /> : i + 1}
                </span>
                <span className={`text-[13px] ${active ? "font-bold text-[#2b1e63]" : done ? "font-semibold text-ink-2" : "font-medium text-muted"}`}>
                  {step.label}
                </span>
                {active && step.key === "analyzing" && filesScanned > 0 && (
                  <span className="ml-auto font-mono text-[11px] font-bold text-muted">{filesScanned} files</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-center font-mono text-[11px] font-medium text-muted">
        Reading the tree via the GitHub API. This usually takes a few seconds
      </p>
    </div>
  );
}

/* ------------------------------- error view ------------------------------- */

function ErrorView({ kind, message, retry }: { kind: string; message: string; retry: () => void }) {
  return (
    <div className="bg-doodle relative mx-auto flex min-h-[calc(100vh-3.5rem)] w-full flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-xl border-2 border-line bg-surface p-7 text-center shadow-pop z-10">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border-2 border-line bg-rose-soft text-rose shadow-sm">
          {kind === "rate_limit" ? <History size={20} strokeWidth={2.4} /> : kind === "not_found" ? <FolderTree size={20} strokeWidth={2.4} /> : <AlertTriangle size={20} strokeWidth={2.4} />}
        </span>
        <h2 className="mt-4 font-display text-lg font-bold">
          {kind === "not_found" ? "Repository not found" : kind === "rate_limit" ? "Rate limit reached" : "Generation failed"}
        </h2>
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-ink-2">{message}</p>
        <div className="mt-5 flex justify-center gap-2.5">
          <button
            onClick={navigateHome}
            className="brut-press-sm rounded-lg border-2 border-line bg-surface px-4 py-2 text-sm font-bold text-ink shadow-sm"
          >
            Back home
          </button>
          {kind !== "not_found" && (
            <button
              onClick={retry}
              className="brut-press-sm rounded-lg border-2 border-line bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ stat chip row ----------------------------- */

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-line bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-2 shadow-sm">
      <span className="text-muted">{label}</span>
      <span className="font-bold text-ink">{value}</span>
    </span>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function DiagramPage({ repoRef }: { repoRef: RepoRef }) {
  const { state, regenerate, skipStreaming } = useGenerate(repoRef);
  const [theme] = useTheme();
  const [tab, setTab] = useState<"overview" | "files">("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"diagram" | "text">("diagram");
  const [demoMode, setDemoMode] = useState<"mounted" | "swap">("mounted");

  // Re-mount the canvas when the repository changes so stale SVG never lingers.
  useEffect(() => {
    setDemoMode("swap");
    const t = requestAnimationFrame(() => setDemoMode("mounted"));
    return () => cancelAnimationFrame(t);
  }, [state.artifact?.repo.fullName]);

  const artifact = state.artifact;
  const isLoading = !artifact && state.stage !== "error";

  const canExplore = useMemo(() => Boolean(artifact?.tree && artifact.tree.length > 0), [artifact]);

  if (isLoading) {
    return <LoadingView refName={`${repoRef.owner}/${repoRef.repo}`} stage={state.stage} filesScanned={state.filesScanned} />;
  }
  if (!artifact || state.stage === "error") {
    return (
      <ErrorView
        kind={state.error?.kind ?? "unknown"}
        message={state.error?.message ?? "Something went wrong."}
        retry={regenerate}
      />
    );
  }

  const { repo, stats } = artifact;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* repo bar */}
      <div className="border-b-2 border-line bg-surface">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3 sm:px-6">
          <button
            onClick={navigateHome}
            className="brut-press-sm flex items-center gap-1.5 rounded-lg border-2 border-line bg-surface px-2.5 py-1.5 text-[13px] font-bold text-ink shadow-sm"
          >
            <ArrowLeft size={14} strokeWidth={2.6} />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <GithubMark size={16} className="shrink-0 text-ink" />
            <span className="truncate font-mono text-sm font-bold">
              <span className="font-medium text-muted">{repo.owner} /</span> {repo.repo}
            </span>
            {repo.isPrivate && (
              <span className="rounded border-2 border-line bg-amber-soft px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wide text-amber">
                private
              </span>
            )}
            {state.fromCache && (
              <span className="rounded border-2 border-line bg-mint px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wide text-[#0e4f3a]">
                cached
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1 rounded-md border-2 border-line bg-banana px-2 py-0.5 font-mono text-[11px] font-bold text-[#141414] sm:flex">
              <Star size={11} fill="currentColor" /> {formatStars(repo.stars)}
            </span>
            <span className="hidden items-center gap-1.5 rounded-md border-2 border-line bg-surface px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-2 shadow-sm md:flex">
              <GitBranch size={11} strokeWidth={2.6} /> {repo.defaultBranch}
            </span>
            <button
              onClick={() => {
                setChatOpen((v) => !v);
                setMobileView("diagram");
              }}
              className={`brut-press-sm flex items-center gap-1.5 rounded-lg border-2 border-line px-2.5 py-1.5 text-xs font-bold shadow-sm ${
                chatOpen ? "bg-accent text-white" : "bg-banana text-[#141414]"
              }`}
              title="Ask questions about this repository"
            >
              <MessageCircleQuestion size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">Ask</span>
            </button>
            <button
              onClick={regenerate}
              className="brut-press-sm flex items-center gap-1.5 rounded-lg border-2 border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink shadow-sm"
              title="Regenerate diagram (bypasses cache)"
            >
              <RefreshCw size={13} strokeWidth={2.6} />
              <span className="hidden lg:inline">Regenerate</span>
            </button>
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="brut-press-sm flex items-center gap-1.5 rounded-lg border-2 border-line bg-accent px-2.5 py-1.5 text-xs font-bold text-white shadow-sm"
            >
              <ExternalLink size={13} strokeWidth={2.6} />
              <span className="hidden lg:inline">Open repo</span>
            </a>
          </div>
        </div>
      </div>

            {/* mobile view switcher (hidden on desktop) */}
            <div className="flex border-b-2 border-line bg-surface lg:hidden">
        <button
          onClick={() => setMobileView("diagram")}
          className={`flex flex-1 items-center justify-center gap-2 border-b-[3px] py-2.5 text-[13px] font-bold transition ${
            mobileView === "diagram" ? "border-accent text-accent" : "border-transparent text-muted"
          }`}
        >
          <Network size={14} strokeWidth={2.5} />
          Diagram
        </button>
        <button
          onClick={() => {
            setMobileView("text");
            setChatOpen(false);
          }}
          className={`flex flex-1 items-center justify-center gap-2 border-b-[3px] py-2.5 text-[13px] font-bold transition ${
            mobileView === "text" ? "border-accent text-accent" : "border-transparent text-muted"
          }`}
        >
          <BookOpenText size={14} strokeWidth={2.5} />
          Walkthrough
        </button>
      </div>

      {/* main split */}
      <div className="grid w-full flex-1 min-h-0 gap-0 overflow-hidden max-lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[420px_1fr] lg:divide-x-2 lg:divide-line">
        {/* left: walkthrough / explorer */}
        <aside className={`min-h-0 flex-col border-b-2 border-line bg-paper lg:flex lg:h-full lg:border-b-0 ${mobileView === "text" ? "flex" : "hidden"}`}>
          <div className="flex items-center gap-1 border-b-2 border-line bg-surface px-3 pt-2.5">
            <button
              onClick={() => setTab("overview")}
              className={`flex items-center gap-2 rounded-t-md border-b-[3px] px-3 pb-2 pt-1 text-[13px] font-bold transition ${
                tab === "overview"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <BookOpenText size={14} strokeWidth={2.5} />
              Walkthrough
              {state.streaming && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
            {canExplore && (
              <button
                onClick={() => setTab("files")}
                className={`flex items-center gap-2 rounded-t-md border-b-[3px] px-3 pb-2 pt-1 text-[13px] font-bold transition ${
                  tab === "files"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <FolderTree size={14} strokeWidth={2.5} />
                Explorer
              </button>
            )}
            {state.streaming && (
              <button
                onClick={skipStreaming}
                className="brut-press-sm mb-1 ml-auto flex items-center gap-1 rounded-md border-2 border-line bg-surface px-2 py-1 text-[11px] font-bold text-ink shadow-sm"
              >
                <FastForward size={12} strokeWidth={2.5} />
                Skip
              </button>
            )}
          </div>

          {tab === "overview" ? (
            <div className="nice-scroll flex-1 overflow-y-auto px-5 py-4">
              {repo.description && (
                <p className="mb-4 flex gap-2 rounded-lg border-2 border-line bg-surface p-3.5 text-[13px] font-medium leading-relaxed text-ink-2 shadow-card">
                  <FileText size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-accent" />
                  {repo.description}
                </p>
              )}
              <div className="mb-4 flex flex-wrap gap-1.5">
                <StatChip label="files" value={`${stats.fileCount}`} />
                <StatChip label="dirs" value={`${stats.dirCount}`} />
                <StatChip label="primary" value={stats.primaryLanguage} />
                {stats.testFiles > 0 && <StatChip label="tests" value={`${stats.testFiles}`} />}
                {stats.stack.slice(0, 3).map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center rounded-md border-2 border-line bg-lavend px-2.5 py-1 font-mono text-[11px] font-bold text-[#2b1e63] shadow-sm dark:bg-accent-soft dark:text-accent"
                  >
                    {s}
                  </span>
                ))}
              </div>
              <MarkdownLite text={state.explained} streaming={state.streaming} />
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              {artifact.tree && <FileExplorer artifact={artifact} tree={artifact.tree} />}
            </div>
          )}
        </aside>

        {/* right: diagram canvas + chat drawer */}
        <main className={`relative h-full min-h-0 overflow-hidden lg:block ${mobileView === "diagram" ? "block" : "hidden"}`}>
          {demoMode === "mounted" && <MermaidCanvas key={mobileView} artifact={artifact} dark={theme === "dark"} />}

          {/* floating ask button (canvas corner) */}
          <button
            onClick={() => setChatOpen(true)}
            className={`brut-press-sm absolute right-3 top-14 z-10 flex items-center gap-1.5 rounded-lg border-2 border-line bg-banana px-2.5 py-1.5 text-xs font-bold text-[#141414] shadow-card ${
              chatOpen ? "hidden" : ""
            }`}
            title="Ask questions about this repository"
          >
            <MessageCircleQuestion size={14} strokeWidth={2.6} />
            Ask
          </button>

          <RepoChat artifact={artifact} open={chatOpen} onClose={() => setChatOpen(false)} />
        </main>
      </div>
    </div>
  );
}
