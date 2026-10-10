import { ApiError } from "../middleware/errorHandler.js";
import type { DiagramGraph } from "../types/graph.js";
import type { ContextSummary } from "./contextSummary.js";
import { groq, GROQ_MODEL } from "./groqClient.js";

const SYSTEM_PROMPT = `You are writing a short, factual walkthrough of a codebase's architecture for a developer who is about to explore it.
You will be given the repository's real stats and a diagram graph that has ALREADY been finalized — do not contradict it, do not invent components it doesn't contain, and do not invent file counts different from the ones given.

Write in Markdown with this shape:
## Overview
One short paragraph: what the repo is, primary language(s), rough size.

## How it fits together
2-4 short paragraphs walking through the graph's nodes and edges in a sensible order (entry point first if one exists), explaining what connects to what and why, based on the edges you were given.

## Component map
One bullet per node: "**label**: detail — role description."

Do not use tables or code blocks. Keep the whole thing under ~350 words. Do not add a "Conclusion" or "Summary" section. Do not use any node, path, or number that wasn't given to you.`;

function buildPrompt(summary: ContextSummary, graph: DiagramGraph): string {
  const lines: string[] = [];
  lines.push(`REPOSITORY: ${summary.repoFullName}`);
  if (summary.description) lines.push(`DESCRIPTION: ${summary.description}`);
  lines.push(`FILES: ${summary.fileCount}, DIRECTORIES: ${summary.dirCount}`);
  lines.push(`PRIMARY LANGUAGE: ${summary.primaryLanguage}`);
  if (summary.languages.length > 0) {
    lines.push(`LANGUAGES: ${summary.languages.map((l) => `${l.name} ${l.share}%`).join(", ")}`);
  }
  if (summary.stack.length > 0) lines.push(`STACK: ${summary.stack.join(", ")}`);
  if (summary.testFileCount > 0) lines.push(`TEST FILES: ${summary.testFileCount}`);
  if (summary.docFileCount > 0) lines.push(`DOC FILES: ${summary.docFileCount}`);

  lines.push(`\nFINAL GROUPS: ${graph.groups.map((g) => g.title).join(", ")}`);
  lines.push(`\nFINAL NODES:`);
  for (const n of graph.nodes) {
    lines.push(`- id=${n.id} label="${n.label}" role=${n.role} path=${n.path} detail="${n.detail}" fileCount=${n.fileCount}`);
  }
  lines.push(`\nFINAL EDGES:`);
  for (const e of graph.edges) {
    lines.push(`- ${e.from} -> ${e.to}${e.label ? ` (${e.label})` : ""}`);
  }

  return lines.join("\n");
}

/**
 * Streams the explanation text. `onChunk` is called with each incremental
 * piece of text as it arrives from Groq — the route handler forwards these
 * straight onto the SSE connection.
 */
export async function streamExplanation(
  summary: ContextSummary,
  graph: DiagramGraph,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let stream;
  try {
    stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(summary, graph) },
      ],
      temperature: 0.2,
      stream: true,
    });
  } catch (err) {
    throw new ApiError(502, "groq_request_failed", "Couldn't reach Groq to generate the walkthrough.");
  }

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const piece = chunk.choices[0]?.delta?.content;
    if (piece) onChunk(piece);
  }
}
