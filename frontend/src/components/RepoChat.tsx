// "Ask a question" side chat for the diagram page. Answers now come from
// the backend's real /api/chat endpoint (Groq, grounded in the diagram and
// the real file tree) instead of the old keyword-matched canned replies.
// Clickable links under an answer are extracted client-side from backtick
// spans in the reply text, but only kept when they match a real path in
// artifact.tree — so a link is never shown unless it points at something
// that genuinely exists in this repo.

import { ArrowUpRight, LogIn, MessageCircleQuestion, Send, Workflow, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { type ChatMessage as BackendChatMessage, fetchChatHistory, streamChat } from "../lib/api";
import { githubFileLink } from "../lib/github";
import { requestSignIn, useUser } from "../lib/store";
import type { DiagramArtifact } from "../lib/types";

interface ChatLink {
  label: string;
  url: string;
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  text: string;
  links?: ChatLink[];
  pending?: boolean;
  failed?: boolean;
}

let msgId = 0;

function renderInline(text: string, keyBase: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={key} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="border border-line bg-sunken px-1 py-px font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

/** Pulls backtick-quoted spans out of a reply and keeps only the ones that
 * match a real path in the tree — never trusts the model's text at face
 * value for what counts as a link. */
function extractRealLinks(text: string, artifact: DiagramArtifact): ChatLink[] {
  const tree = artifact.tree ?? [];
  if (tree.length === 0) return [];
  const byPath = new Map(tree.map((t) => [t.path, t]));

  const seen = new Set<string>();
  const links: ChatLink[] = [];
  const matches = text.matchAll(/`([^`]+)`/g);
  for (const m of matches) {
    const candidate = m[1].trim();
    const entry = byPath.get(candidate);
    if (!entry || seen.has(candidate)) continue;
    seen.add(candidate);
    links.push({ label: candidate, url: githubFileLink(artifact.repo, candidate, entry.type === "tree") });
    if (links.length >= 5) break;
  }
  return links;
}

function greetingText(artifact: DiagramArtifact): string {
  const { repo, stats, graph } = artifact;
  return `I've mapped **${repo.fullName}**: ${stats.fileCount} files of mostly **${stats.primaryLanguage}**, split into ${graph.nodes.length} components. Ask me about the architecture, where things live, or how to run it.`;
}

function suggestedQuestions(artifact: DiagramArtifact): string[] {
  const base = [
    "What is the entry point?",
    "Which frameworks does it use?",
    artifact.graph.nodes.some((n) => n.role === "auth") ? "Where is authentication handled?" : "Are there any tests?",
    "How is the data layer organized?",
    "How do I run this project?",
    "What are the biggest components?",
  ];
  return base.slice(0, 6);
}

export default function RepoChat({
  artifact,
  open,
  onClose,
}: {
  artifact: DiagramArtifact;
  open: boolean;
  onClose: () => void;
}) {
  const user = useUser();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

    // Reset conversation when the repository changes, and cancel any
  // in-flight request from the previous repo. Then try to restore saved
  // history for this account + repo; if there's none (or the user isn't
  // signed in), fall back to the greeting.
  useEffect(() => {
    cancelRef.current?.();
    setMessages([{ id: ++msgId, role: "assistant", text: greetingText(artifact) }]);
    setBusy(false);
    setInput("");

    if (!user) return;
    let cancelled = false;
    fetchChatHistory({ owner: artifact.repo.owner, repo: artifact.repo.repo }).then((history) => {
      if (cancelled || history.length === 0) return;
      setMessages(
        history.map((m) => ({
          id: ++msgId,
          role: m.role,
          text: m.content,
          links: m.role === "assistant" ? extractRealLinks(m.content, artifact) : undefined,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.repo.fullName, user?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => () => cancelRef.current?.(), []);

  const ask = (raw: string) => {
    if (!user) {
      requestSignIn();
      return;
    }
    const question = raw.trim();
    if (!question || busy) return;

    const history: BackendChatMessage[] = messages
      .filter((m) => !m.failed)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((m) => [...m, { id: ++msgId, role: "user", text: question }]);
    setInput("");
    setBusy(true);

    const assistantId = ++msgId;
    setMessages((m) => [...m, { id: assistantId, role: "assistant", text: "", pending: true }]);

    cancelRef.current = streamChat(
      { owner: artifact.repo.owner, repo: artifact.repo.repo },
      question,
      history,
      {
        onChunk: (text) => {
          setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, text: msg.text + text } : msg)));
        },
        onDone: () => {
          setBusy(false);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, pending: false, links: extractRealLinks(msg.text, artifact) } : msg,
            ),
          );
        },
        onFail: (err) => {
          setBusy(false);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, pending: false, failed: true, text: msg.text || err.message }
                : msg,
            ),
          );
        },
      },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const suggestions = suggestedQuestions(artifact);
  const showSuggestions = messages.length <= 1 && !busy;

  return (
    <>
      {/* mobile backdrop */}
      {open && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside
        className="chat-drawer absolute bottom-0 right-0 top-0 z-30 flex w-[400px] max-w-full flex-col border-l-2 border-line bg-paper shadow-pop max-lg:fixed max-lg:h-full"
        data-open={open}
        aria-hidden={!open}
      >
        {/* header */}
        <div className="flex items-center gap-2.5 border-b-2 border-line bg-lavend px-4 py-3 text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-line bg-surface text-accent shadow-sm">
            <MessageCircleQuestion size={16} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold tracking-tight">
              Ask about {artifact.repo.repo}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">
               grounded in this repo's real file tree
            </p>
          </div>
          <button
            onClick={onClose}
            className="brut-press-sm rounded-md border-2 border-line bg-surface p-1.5 text-ink shadow-sm"
            aria-label="Close chat"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="nice-scroll flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg border-2 border-line bg-mint px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-[#0e4f3a] shadow-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-line bg-accent text-white shadow-sm">
                  <Workflow size={14} strokeWidth={2.4} />
                </span>
                <div className="max-w-[85%]">
                  <div
                    className={`rounded-lg border-2 px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                      msg.failed ? "border-rose bg-rose-soft text-rose" : "border-line bg-surface text-ink-2"
                    }`}
                  >
                    {msg.pending && !msg.text ? (
                      <span className="typing-dots flex gap-1 py-0.5">
                        <span /> <span /> <span />
                      </span>
                    ) : (
                      <span className={msg.pending ? "stream-caret" : ""}>{renderInline(msg.text, `m${msg.id}`)}</span>
                    )}
                  </div>
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {msg.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="brut-press-sm inline-flex items-center gap-1 rounded-md border-2 border-line bg-sky px-2 py-1 font-mono text-[10.5px] font-semibold text-[#0d2f52] shadow-sm"
                        >
                          {link.label}
                          <ArrowUpRight size={11} strokeWidth={2.5} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {showSuggestions && (
            <div className="space-y-1.5 pt-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">
                try asking
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="brut-press-sm rounded-md border-2 border-line bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-2 shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* input */}
{user ? (
  <form onSubmit={submit} className="border-t-2 border-line bg-surface p-3">
    <div className="flex items-center gap-2 rounded-lg border-2 border-line bg-paper p-1.5 shadow-sm focus-within:bg-surface">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Where is routing handled?"
        className="min-w-0 flex-1 bg-transparent px-2 text-[13px] font-medium text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={!input.trim() || busy}
        className="brut-press-sm flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 border-line bg-accent text-white shadow-sm disabled:opacity-40"
        aria-label="Send question"
      >
        <Send size={14} strokeWidth={2.5} />
      </button>
    </div>
    <p className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-wider text-muted">
      answers are generated · verify anything critical
    </p>
  </form>
) : (
  <div className="border-t-2 border-line bg-surface p-3">
    <button
      onClick={requestSignIn}
      className="brut-press flex w-full items-center justify-center gap-2 rounded-lg border-2 border-line bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm"
    >
      <LogIn size={15} strokeWidth={2.5} />
      Sign in to ask questions
    </button>
    <p className="mt-2 text-center font-mono text-[9.5px] uppercase tracking-wider text-muted">
      chat is available for signed-in accounts
    </p>
  </div>
)}
      </aside>
    </>
  );
}
