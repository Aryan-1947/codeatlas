import { ApiError } from "../middleware/errorHandler.js";
import type { RepoContext } from "../types/github.js";
import type { DiagramGraph } from "../types/graph.js";
import type { ContextSummary } from "./contextSummary.js";
import { groq, GROQ_MODEL } from "./groqClient.js";
import { searchTreePaths } from "./searchTree.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are answering developer questions about a specific codebase, grounded strictly in the facts given to you below: a finalized architecture graph, real repo stats, and (when relevant) a list of real file paths matched to the question by keyword search.

Rules:
- Only reference components, paths, roles, and numbers that appear in the given data. Never invent a file path, a file count, or a framework that wasn't given to you.
- If the given data doesn't contain the answer, say so plainly and suggest what the person could look at instead — do not guess.
- Reference real paths in backticks, e.g. \`src/routes\`.
- Keep answers concise: a few sentences, not an essay, unless the question genuinely needs more.
- Plain text only: never use tables, headings or code blocks. Use short paragraphs, and for lists use lines that start with "- ". You may use **bold** for emphasis.
- Use numbers exactly as given and say what each one measures (for example files inside one folder versus totals for the whole repo). Never point out a mismatch between numbers.
- Never guess file types, frameworks or tools that are not in the data.
- You may use the conversation history for context, but every factual claim must still trace back to the data given in this turn.`;

function buildGroundingBlock(
  context: RepoContext,
  summary: ContextSummary,
  graph: DiagramGraph,
  question: string,
): string {
  const lines: string[] = [];
  lines.push(`REPOSITORY: ${summary.repoFullName}`);
  if (summary.description) lines.push(`DESCRIPTION: ${summary.description}`);
  lines.push(`FILES: ${summary.fileCount}, DIRECTORIES: ${summary.dirCount}`);
  lines.push(`PRIMARY LANGUAGE: ${summary.primaryLanguage}`);
  if (summary.languages.length > 0) {
    lines.push(`LANGUAGES: ${summary.languages.map((l) => `${l.name} ${l.share}%`).join(", ")}`);
  }
  if (summary.stack.length > 0) lines.push(`STACK: ${summary.stack.join(", ")}`);
  if (summary.testFileCount > 0) lines.push(`TEST FILES (repo-wide total, detected by file name): ${summary.testFileCount}`);
  if (summary.docFileCount > 0) lines.push(`DOC FILES: ${summary.docFileCount}`);

  lines.push(`\nDIAGRAM NODES:`);
  for (const n of graph.nodes) {
    lines.push(`- "${n.label}" role=${n.role} path=${n.path} detail="${n.detail}" filesInsideThisFolder=${n.fileCount}`);
  }
  lines.push(`\nDIAGRAM EDGES:`);
  for (const e of graph.edges) {
    lines.push(`- ${e.from} -> ${e.to}${e.label ? ` (${e.label})` : ""}`);
  }

  const matches = searchTreePaths(question, context.tree);
  if (matches.length > 0) {
    lines.push(`\nFILES MATCHING THE QUESTION (keyword search over the real tree, not the diagram):`);
    for (const p of matches) lines.push(`- ${p}`);
  }

  return lines.join("\n");
}

export async function streamChatReply(
  question: string,
  history: ChatMessage[],
  context: RepoContext,
  summary: ContextSummary,
  graph: DiagramGraph,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const grounding = buildGroundingBlock(context, summary, graph, question);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `REPOSITORY DATA:\n${grounding}` },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

  let stream;
  try {
    stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.1,
      stream: true,
    });
  } catch {
    throw new ApiError(502, "groq_request_failed", "Couldn't reach Groq to answer that.");
  }

  let chunkCount = 0;
  for await (const chunk of stream) {
    if (signal?.aborted) {
      console.warn("[chat] stream aborted before completion — signal was already aborted.");
      break;
    }
    const piece = chunk.choices[0]?.delta?.content;
    if (piece) {
      chunkCount += 1;
      onChunk(piece);
    }
  }
  if (chunkCount === 0) {
    console.warn("[chat] Groq stream completed with zero content chunks — check prompt/response above.");
  }
}
