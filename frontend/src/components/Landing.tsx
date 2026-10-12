// Landing page: hero + repository input, featured examples (stars fetched live
// when possible), how-it-works, feature grid, and a history section that's
// signed-in only — guests see a sign-in nudge instead of any history.

import {
  ArrowRight,
  Braces,
  Clock3,
  FileCode2,
  FolderTree,
  Link2,
  Lock,
  Mail,
  MousePointerClick,
  Network,
  ScanSearch,
  Star,
  Trash2,
  UserRound,
  Workflow,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { parseRepoInput } from "../lib/github";
import {
  formatStars,
  navigateTo,
  requestSignIn,
  timeAgo,
  useUser,
} from "../lib/store";
import { fetchHistory, deleteHistory } from "../lib/api";
import type { HistoryItem } from "../lib/types";
import { GithubMark } from "./icons";

function LinkedinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const EXAMPLES = [
  { fullName: "fastapi/fastapi", blurb: "Modern Python web framework for building APIs", fallbackStars: 85000, chip: "bg-lavend" },
  { fullName: "streamlit/streamlit", blurb: "A faster way to build and share data apps", fallbackStars: 42000, chip: "bg-mint" },
  { fullName: "pallets/flask", blurb: "The Python micro framework for web apps", fallbackStars: 70000, chip: "bg-amber-soft" },
  { fullName: "axios/axios", blurb: "Promise based HTTP client for browser & node", fallbackStars: 108000, chip: "bg-sky" },
];
const GUEST_ALLOWED_REPOS = new Set(EXAMPLES.map((e) => e.fullName.toLowerCase()));

function ExampleCard({
  fullName,
  blurb,
  chip,
  fallbackStars,
  delay,
}: {
  fullName: string;
  blurb: string;
  chip: string;
  fallbackStars: number;
  delay: number;
}) {
  const [owner, repo] = fullName.split("/");

  return (
    <button
      onClick={() => navigateTo({ owner, repo })}
      className="brut-press rise-in group flex w-full items-center gap-3.5 rounded-xl border-2 border-line bg-surface p-4 text-left shadow-card"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-line ${chip} text-[#141414]`}
      >
        <GithubMark size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[13px] font-bold text-ink">{fullName}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-muted">{blurb}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-md border-2 border-line bg-banana px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#141414]">
        <Star size={11} fill="currentColor" />
        {formatStars(fallbackStars)}
      </span>
      <ArrowRight size={15} strokeWidth={2.6} className="shrink-0 text-ink transition group-hover:translate-x-0.5" />
    </button>
  );
}

function RepoSearch() {
  const user = useUser();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ref = parseRepoInput(value);
    if (!ref) {
      setError("Enter a repository as owner/repo or paste a full GitHub URL.");
      return;
    }
    const key = `${ref.owner}/${ref.repo}`.toLowerCase();
    if (!user && !GUEST_ALLOWED_REPOS.has(key)) {
      setError(null);
      requestSignIn();
      return;
    }
    setError(null);
    navigateTo(ref);
  };

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={`flex items-center gap-2 rounded-xl border-2 bg-surface p-2 shadow-card ${
          error ? "border-rose" : "border-line"
        }`}
      >
        <span className="pl-2 text-ink">
          <Link2 size={17} strokeWidth={2.5} />
        </span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          autoComplete="off"
          placeholder="github.com/anthropics/claude-code"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-ink outline-none placeholder:text-muted/70"
        />
        <span className="kbd hidden sm:block">enter</span>
        <button
          type="submit"
          className="brut-press-sm flex shrink-0 items-center gap-2 rounded-lg border-2 border-line bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm"
        >
          <Workflow size={15} strokeWidth={2.5} />
          Diagram
        </button>
      </div>
      {error && <p className="mt-2.5 pl-1 text-xs font-bold text-rose">{error}</p>}
      <p className="mt-3 text-center text-xs font-medium text-muted">
        Paste <code className="rounded border-2 border-line bg-banana px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#141414]">owner/repo</code>{" "}
        or a full GitHub URL.
      </p>
    </form>
  );
}

const STEPS = [
  {
    icon: ScanSearch,
    title: "Read the tree",
    body: "CodeAtlas pulls the repository's file tree, manifests and README through the GitHub API without cloning anything.",
    chip: "bg-lavend",
  },
  {
    icon: Network,
    title: "Map the architecture",
    body: "An LLM reviews the real directory structure, manifests and language mix to pick out entry points, services, data and auth layers, then wires them into a component graph.",
    chip: "bg-mint",
  },
  {
    icon: MousePointerClick,
    title: "Explore interactively",
    body: "The diagram renders as a living map. Click any component to open the real file or directory on GitHub.",
    chip: "bg-amber-soft",
  },
];

const FEATURES = [
  {
    icon: Workflow,
    title: "Architecture-first diagrams",
    body: "A system-level map of how a codebase fits together. It maps layers and data flow, not just folders drawn as boxes.",
  },
  {
    icon: MousePointerClick,
    title: "Click-through to source",
    body: "Every node links to the exact file or directory on GitHub, so the diagram doubles as a navigation layer.",
  },
  {
    icon: Zap,
    title: "Streams as it thinks",
    body: "The walkthrough writes itself as the graph is assembled, so you see the reasoning arrive live.",
  },
  {
    icon: Lock,
    title: "Private per account",
    body: "Sign in and your diagrams and history live under your email only. Other accounts here will never see them.",
  },
  {
    icon: FolderTree,
    title: "Explorer + Repo chat",
    body: "A full file tree sits beside the diagram, and an ask-me-anything panel answers questions about the codebase.",
  },
  {
    icon: Clock3,
    title: "Synced history, instant previews",
    body: "Signed in, your diagrams and history are saved to your account. As a guest, the example repos cache locally so revisiting one is instant.",
  },
];

export default function Landing() {
  const user = useUser();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    fetchHistory().then((items) => {
      if (!cancelled) setHistory(items);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <div className="min-h-screen">
      {/* ------------------------------- hero ------------------------------- */}
      <section className="bg-doodle bg-fixed relative overflow-hidden border-b-2 border-line">
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="badge-neon rise-in rise-1 inline-flex items-center gap-2 rounded-full border-2 border-line bg-mint px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#0e4f3a] shadow-sm">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#0e8f6b]" />
              repository → diagram
            </p>
            <h1 className="rise-in rise-2 mt-6 leading-[1.02] tracking-tight" style={{fontSize: "clamp(2.4rem, 7.5vw, 4.5rem)", fontFamily: "'Playfair Display', serif", fontWeight: 900}}>
              <span className="hero-line block">Navigate any</span>
              <span className="hero-line block">codebase like</span>
              <span className="hero-accent block text-accent" style={{fontStyle: "italic"}}>a map.</span>
            </h1>
            <p className="rise-in rise-3 mx-auto mt-5 max-w-lg text-[15px] font-medium leading-relaxed text-ink-2 sm:text-base">
              Turn any GitHub repository into an interactive architecture diagram for visualization in seconds.
            </p>
            <div className="rise-in rise-4 mt-8">
              <RepoSearch />
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- examples ------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">try one</p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Example repositories</h2>
          </div>
          <p className="hidden font-mono text-[11px] font-medium text-muted sm:block">a few repos to try first</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EXAMPLES.map((ex, i) => (
            <ExampleCard
              key={ex.fullName}
              fullName={ex.fullName}
              blurb={ex.blurb}
              chip={ex.chip}
              fallbackStars={ex.fallbackStars}
              delay={i * 60}
            />
          ))}
        </div>

        {/* History (signed-in users only) */}
<div className="mt-12">
  {user ? (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-line bg-peach text-[#7a3806] shadow-sm">
            <Clock3 size={14} strokeWidth={2.5} />
          </span>
          <h3 className="font-display text-base font-bold tracking-tight">
            {user.name.split(" ")[0]}'s diagrams
          </h3>
        </div>
        {history.length > 0 && (
          <button
            onClick={async () => {
              const prev = history;
              setHistory([]); // optimistic
              const ok = await deleteHistory();
              if (!ok) setHistory(prev); // roll back on failure
            }}
            className="brut-press-sm flex items-center gap-1.5 rounded-md border-2 border-line bg-rose-soft px-2.5 py-1.5 text-xs font-bold text-rose shadow-sm"
          >
            <Trash2 size={12} strokeWidth={2.5} />
            Clear
          </button>
        )}
      </div>

      {history.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {history.slice(0, 6).map((h) => {
            const [owner, repo] = h.fullName.split("/");
            return (
              <button
                key={h.fullName}
                onClick={() => navigateTo({ owner, repo })}
                className="brut-press group flex items-center gap-3 rounded-xl border-2 border-line bg-surface px-3.5 py-3 text-left shadow-card"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-line bg-sky text-[#0d2f52]">
                  <FileCode2 size={15} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-bold text-ink">{h.fullName}</span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium text-muted">
                    {h.language ?? "Code"} · {formatStars(h.stars)} stars · {timeAgo(h.createdAt)}
                  </span>
                </span>
                <ArrowRight size={14} strokeWidth={2.6} className="shrink-0 text-ink transition group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-line bg-surface px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-muted">
            No diagrams yet, {user.name.split(" ")[0]}. Your generated maps will land here, private to this account.
          </p>
        </div>
      )}
    </>
  ) : (
    <button
      onClick={requestSignIn}
      className="brut-press-sm flex w-full items-center gap-3 rounded-xl border-2 border-line bg-lavend px-4 py-3 text-left shadow-sm"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-line bg-surface text-accent">
        <UserRound size={16} strokeWidth={2.4} />
      </span>
      <span className="flex-1 text-[13px] font-semibold text-[#2b1e63]">
        You're browsing as a guest - you can diagram the examples above.{" "}
        <span className="font-bold underline underline-offset-2">Sign in with your email</span> to diagram
        any repo and keep a private history.
      </span>
      <ArrowRight size={15} strokeWidth={2.6} className="shrink-0 text-[#2b1e63]" />
    </button>
  )}
</div>
      </section>

      {/* ---------------------------- how it works ---------------------------- */}
      <section className="border-y-2 border-line bg-white dark:bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">pipeline</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="brut-card relative rounded-xl border-2 border-line bg-paper p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 border-line ${step.chip} text-[#141414] shadow-sm`}>
                    <step.icon size={17} strokeWidth={2.4} />
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-line bg-accent font-mono text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-[15px] font-bold">{step.title}</h3>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-2">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------ features ------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">capabilities</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Built for reading code</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const chips = ["bg-lavend", "bg-mint", "bg-amber-soft", "bg-rose-soft", "bg-sky", "bg-peach"];
            return (
              <div
                key={f.title}
                className="brut-card rounded-xl border-2 border-line bg-surface p-5 shadow-card"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 border-line ${chips[i % chips.length]} text-[#141414] shadow-sm`}
                >
                  <f.icon size={17} strokeWidth={2.4} />
                </span>
                <h3 className="mt-4 font-display text-[15px] font-bold">{f.title}</h3>
                <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-2">{f.body}</p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-14 overflow-hidden rounded-xl border-2 border-line bg-surface shadow-pop">
          <div className="flex flex-col items-start justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-9">
            <div>
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-muted">
                <Braces size={13} strokeWidth={2.5} />
                ready when you are
              </div>
              <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">
                Point it at a repository. Get the map.
              </h3>
            </div>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="brut-press flex items-center gap-2 rounded-lg border-2 border-line bg-accent px-5 py-3 text-sm font-bold text-white shadow-card"
            >
              Diagram a repo
              <ArrowRight size={15} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </section>

            {/* ------------------------------- footer ------------------------------- */}
            <footer className="border-t-2 border-line bg-white dark:bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-7 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-line bg-accent text-white">
              <Workflow size={13} strokeWidth={2.6} />
            </span>
            <span className="font-heavy text-[15px]">CodeAtlas</span>
            <span className="font-mono text-xs font-medium text-muted">© {new Date().getFullYear()}</span>
          </div>
          <p className="flex flex-col items-center justify-center gap-2 text-center font-mono text-[11px] font-medium text-muted sm:flex-row">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
  Diagrams, walkthroughs and repo chat for any GitHub codebase
</p>
          <div className="flex items-center gap-2.5">
          <a
              href="https://github.com/Aryan-1947"
              target="_blank"
              rel="noopener noreferrer"
              className="brut-press-sm flex h-8 w-8 items-center justify-center rounded-md border-2 border-line bg-surface text-ink shadow-sm transition-colors hover:bg-[#181717] hover:text-white dark:hover:bg-white dark:hover:text-[#181717]"
              aria-label="GitHub"
            >
              <GithubMark size={14} />
            </a>
            <a
              href="https://www.linkedin.com/in/aryan-shekhawat-bb26902b8/"
              target="_blank"
              rel="noopener noreferrer"
              className="brut-press-sm flex h-8 w-8 items-center justify-center rounded-md border-2 border-line bg-surface text-ink shadow-sm transition-colors hover:bg-[#0A66C2] hover:text-white"
              aria-label="LinkedIn"
            >
              <LinkedinIcon size={13} />
            </a>
            <a
              href="mailto:aryanshekhawat1947@gmail.com"
              className="brut-press-sm flex h-8 w-8 items-center justify-center rounded-md border-2 border-line bg-surface text-ink shadow-sm transition-colors hover:bg-[#EA4335] hover:text-white"
              aria-label="Email"
            >
              <Mail size={14} strokeWidth={2.4} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
