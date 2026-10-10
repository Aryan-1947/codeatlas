import { ApiError } from "../middleware/errorHandler.js";
import { buildGraphJsonSchema, LlmGraphSchema, type LlmGraph } from "../schemas/graph.js";
import type { DiagramGraph, GenerateGraphResult, GraphEdge, GraphNode } from "../types/graph.js";
import type { ContextSummary, PathCandidate } from "./contextSummary.js";
import { groq, GROQ_MODEL } from "./groqClient.js";

const SYSTEM_PROMPT = `You are a senior software architect producing an architecture diagram for a codebase.
You will be given real, measured facts about a repository: its directory structure, file counts, detected languages, detected frameworks, manifest excerpts, and a README excerpt.

Your job:
1. Decide which of the given PATH CANDIDATES are worth showing as components. Most repos warrant 4-12; a very small or simple repo may honestly only have 1-3 real components — do not pad the diagram with candidates that don't add architectural meaning just to hit a higher count.
2. Assign each a role that best matches what that directory/file actually does.
3. Group related components together.
4. Draw edges showing how components depend on / call / are guarded by one another, based on what their names, sample files, and languages suggest.
5. Write a short, factual "detail" line for each node using the real file counts and languages you were given — do not invent numbers.

Hard constraints:
- Every node's "path" MUST be exactly one of the given PATH CANDIDATES. Do not alter, combine, or invent a path.
- If a candidate is clearly not architecturally significant (e.g. a stray config), you may omit it — you are not required to use every candidate.
- Prefer including a node with role "entry" if an entry-point candidate was given.
- "detail" must stay under ~120 characters and must not restate numbers you weren't given. Only mention file types or languages that appear in the given data. Never guess what a folder contains (for example, never call docs HTML or generated unless that was given).
- Edge "from"/"to" values must reference node "id" values you defined in this same response.`;

function formatCandidate(c: PathCandidate): string {
  const kind = c.isDirectory ? "directory" : "file";
  const lang = c.dominantLanguage ? `, mostly ${c.dominantLanguage}` : "";
  const samples = c.sampleFiles.length > 0 ? ` — e.g. ${c.sampleFiles.join(", ")}` : "";
  return `- ${c.path} (${kind}, ${c.fileCount} file${c.fileCount === 1 ? "" : "s"}${lang})${samples}`;
}

function buildUserPrompt(summary: ContextSummary): string {
  const lines: string[] = [];
  lines.push(`REPOSITORY: ${summary.repoFullName}`);
  if (summary.description) lines.push(`DESCRIPTION: ${summary.description}`);
  lines.push(
    `SIZE: ${summary.fileCount} files, ${summary.dirCount} directories${summary.truncated ? " (large repo — this is a representative subset, not literally every file)" : ""}`,
  );
  lines.push(`PRIMARY LANGUAGE: ${summary.primaryLanguage}`);
  if (summary.languages.length > 0) {
    lines.push(`LANGUAGE BREAKDOWN: ${summary.languages.map((l) => `${l.name} ${l.share}%`).join(", ")}`);
  }
  if (summary.stack.length > 0) {
    lines.push(`DETECTED STACK (parsed from real manifests/config files): ${summary.stack.join(", ")}`);
  }
  if (summary.testFileCount > 0) lines.push(`TEST FILES: ${summary.testFileCount}`);
  if (summary.docFileCount > 0) lines.push(`DOC FILES: ${summary.docFileCount}`);

  if (summary.entryCandidatePaths.length > 0) {
    lines.push(`\nLIKELY ENTRY POINT(S): ${summary.entryCandidatePaths.join(", ")}`);
  }

  lines.push(`\nPATH CANDIDATES (you may only use these exact paths as node "path" values):`);
  for (const c of summary.candidates) lines.push(formatCandidate(c));

  if (Object.keys(summary.manifestExcerpts).length > 0) {
    lines.push(`\nMANIFEST EXCERPTS:`);
    for (const [name, text] of Object.entries(summary.manifestExcerpts)) {
      lines.push(`--- ${name} ---\n${text}`);
    }
  }

  if (summary.readmeExcerpt) {
    lines.push(`\nREADME EXCERPT:\n${summary.readmeExcerpt}`);
  }

  return lines.join("\n");
}

async function callGroqForGraph(
  summary: ContextSummary,
  candidatePaths: string[],
  repairNote?: string,
): Promise<unknown> {
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(summary) },
  ];
  if (repairNote) {
    messages.push({ role: "user", content: repairNote });
  }

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: buildGraphJsonSchema(candidatePaths),
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new ApiError(502, "groq_empty_response", "Groq returned an empty response.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(502, "groq_invalid_json", "Groq returned malformed JSON.");
  }
}

/** Real fact lookup: fileCount, never taken from the model's output. */
function candidateMap(summary: ContextSummary): Map<string, PathCandidate> {
  return new Map(summary.candidates.map((c) => [c.path, c]));
}

function enrichAndValidate(
  llmGraph: LlmGraph,
  summary: ContextSummary,
): { graph: DiagramGraph; warnings: string[] } {
  const warnings: string[] = [];
  const candidates = candidateMap(summary);

  // Groups: keep as given, but make sure every referenced group id exists.
  const groupIds = new Set(llmGraph.groups.map((g) => g.id));
  const groups = [...llmGraph.groups];

  // Nodes: dedupe ids, coerce isDirectory/fileCount to real facts, drop any
  // node whose group id doesn't resolve (self-heal by attaching to a
  // synthesized "Other" group rather than dropping real content).
  const seenIds = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const n of llmGraph.nodes) {
    if (seenIds.has(n.id)) {
      warnings.push(`Dropped duplicate node id "${n.id}".`);
      continue;
    }
    const fact = candidates.get(n.path);
    if (!fact) {
      // Should be structurally impossible due to the enum constraint, but
      // never trust that blindly — defense in depth.
      warnings.push(`Dropped node "${n.id}" — path "${n.path}" was not a valid candidate.`);
      continue;
    }
    seenIds.add(n.id);

    let group = n.group;
    if (!groupIds.has(group)) {
      group = "other";
      if (!groupIds.has("other")) {
        groups.push({ id: "other", title: "Other" });
        groupIds.add("other");
      }
      warnings.push(`Node "${n.id}" referenced an unknown group — moved to "Other".`);
    }

    nodes.push({
      id: n.id,
      label: n.label,
      role: n.role as GraphNode["role"],
      group,
      path: fact.path,
      isDirectory: fact.isDirectory,
      detail: n.detail,
      fileCount: fact.fileCount,
    });
  }

  const usedGroupIds = new Set(nodes.map((n) => n.group));
  const finalGroups = groups.filter((g) => usedGroupIds.has(g.id));

  // Edges: keep only those referencing surviving nodes; dedupe (from,to).
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seenEdges = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const e of llmGraph.edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || e.from === e.to) continue;
    const key = `${e.from}->${e.to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({ from: e.from, to: e.to, label: e.label ?? undefined, dashed: e.dashed });
  }

  return { graph: { groups: finalGroups, nodes, edges }, warnings };
}

export async function generateGraph(summary: ContextSummary): Promise<GenerateGraphResult> {
  const candidatePaths = summary.candidates.map((c) => c.path);
  if (candidatePaths.length === 0) {
    throw new ApiError(
      422,
      "no_candidates",
      "Couldn't find enough real structure in this repository to diagram.",
    );
  }

  let llmGraph: LlmGraph;

  try {
    const first = await callGroqForGraph(summary, candidatePaths);
    const firstParsed = LlmGraphSchema.safeParse(first);
    if (!firstParsed.success) throw new Error(`schema_mismatch: ${firstParsed.error.message}`);
    llmGraph = firstParsed.data;
  } catch (firstErr) {
    // Groq rate-limiting itself: retrying instantly won't help, say so plainly.
    if ((firstErr as { status?: number })?.status === 429) {
      throw new ApiError(429, "rate_limit", "Groq is busy right now. Please try again in about a minute.");
    }

    // Anything else (the API rejected the generation as invalid JSON, our own
    // parse failed, or the schema didn't match): one repair attempt, telling
    // the model what went wrong, still under the same schema.
    const reason = firstErr instanceof Error ? firstErr.message : "invalid response";
    const repairNote = `Your previous response was invalid (${reason}). Resend a complete, corrected JSON object that strictly matches the required schema.`;

    try {
      const second = await callGroqForGraph(summary, candidatePaths, repairNote);
      const secondParsed = LlmGraphSchema.safeParse(second);
      if (!secondParsed.success) throw new Error(`schema_mismatch: ${secondParsed.error.message}`);
      llmGraph = secondParsed.data;
    } catch {
      throw new ApiError(
        502,
        "graph_generation_failed",
        "The model couldn't produce a valid diagram for this repository. Try again shortly.",
      );
    }
  }

  const { graph, warnings } = enrichAndValidate(llmGraph, summary);
  if (graph.nodes.length < 1) {
    throw new ApiError(
      502,
      "graph_too_small",
      "The generated diagram had too few valid components. Try again.",
    );
  }

  return { graph, warnings };
}