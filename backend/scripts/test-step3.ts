import { buildContextSummary } from "../src/services/contextSummary.js";
import { buildGraphJsonSchema, LlmGraphSchema } from "../src/schemas/graph.js";
import type { RepoContext } from "../src/types/github.js";

const fakeContext: RepoContext = {
  repo: {
    owner: "acme",
    repo: "widget-api",
    fullName: "acme/widget-api",
    description: "A widget API",
    stars: 42,
    language: "TypeScript",
    defaultBranch: "main",
    isPrivate: false,
    htmlUrl: "https://github.com/acme/widget-api",
    topics: [],
    sizeKb: 500,
    pushedAt: "",
    commitSha: "abc123",
  },
  truncated: false,
  manifests: {
    "package.json": JSON.stringify({ dependencies: { express: "^4.0.0", react: "^18.0.0" } }),
  },
  readme: "# Widget API\nThis service serves widgets.",
  tree: [
    { path: "src", type: "tree" },
    { path: "src/index.ts", type: "blob", size: 200 },
    { path: "src/routes", type: "tree" },
    { path: "src/routes/widgets.ts", type: "blob", size: 900 },
    { path: "src/routes/health.ts", type: "blob", size: 100 },
    { path: "src/services", type: "tree" },
    { path: "src/services/db.ts", type: "blob", size: 700 },
    { path: "tests", type: "tree" },
    { path: "tests/widgets.test.ts", type: "blob", size: 400 },
    { path: "package.json", type: "blob", size: 300 },
    { path: "tsconfig.json", type: "blob", size: 150 },
  ],
};

console.log("=== buildContextSummary ===");
const summary = buildContextSummary(fakeContext);
console.log(JSON.stringify(summary, null, 2));

console.assert(summary.candidates.length > 0, "FAIL: expected candidates to be non-empty");
console.assert(
  summary.entryCandidatePaths.includes("src/index.ts"),
  "FAIL: expected src/index.ts to be detected as an entry candidate",
);
console.assert(summary.stack.includes("Express"), "FAIL: expected Express to be detected from package.json");
console.assert(summary.stack.includes("React"), "FAIL: expected React to be detected from package.json");
console.assert(summary.languages[0]?.name === "TypeScript", "FAIL: expected TypeScript as primary language");

console.log("\n=== buildGraphJsonSchema shape ===");
const candidatePaths = summary.candidates.map((c) => c.path);
const jsonSchema = buildGraphJsonSchema(candidatePaths);
console.assert(
  (jsonSchema.schema.properties.nodes.items.properties.path as any).enum.length === candidatePaths.length,
  "FAIL: path enum should match candidate count",
);
console.log("path enum:", (jsonSchema.schema.properties.nodes.items.properties.path as any).enum);

console.log("\n=== LlmGraphSchema: valid payload ===");
const validPayload = {
  groups: [{ id: "core", title: "Core" }],
  nodes: [
    {
      id: "n0",
      label: "Entry",
      role: "entry",
      group: "core",
      path: "src/index.ts",
      isDirectory: false,
      detail: "boots the server",
    },
    {
      id: "n1",
      label: "Routes",
      role: "api",
      group: "core",
      path: "src/routes",
      isDirectory: true,
      detail: "2 files, request handlers",
    },
  ],
  edges: [{ from: "n0", to: "n1", label: "dispatches", dashed: false }],
};
const validResult = LlmGraphSchema.safeParse(validPayload);
console.assert(validResult.success, "FAIL: expected valid payload to parse");
console.log("valid payload parsed:", validResult.success);

console.log("\n=== LlmGraphSchema: invalid role should be rejected ===");
const invalidPayload = { ...validPayload, nodes: [{ ...validPayload.nodes[0], role: "not_a_real_role" }] };
const invalidResult = LlmGraphSchema.safeParse(invalidPayload);
console.assert(!invalidResult.success, "FAIL: expected invalid role to be rejected");
console.log("invalid role correctly rejected:", !invalidResult.success);

console.log("\n✅ All assertions passed (no 'FAIL:' lines above means success)");

console.log("\n=== Tiny/flat repo (reproduces the octocat/Hello-World case) ===");
const tinyContext: RepoContext = {
  repo: { ...fakeContext.repo, fullName: "acme/tiny", description: "Just a couple files" },
  truncated: false,
  manifests: {},
  readme: "# Tiny\nA minimal repo.",
  tree: [
    { path: "README.md", type: "blob", size: 50 },
    { path: "index.js", type: "blob", size: 120 },
  ],
};
const tinySummary = buildContextSummary(tinyContext);
console.log("tiny repo candidates:", tinySummary.candidates.map((c) => c.path));
console.assert(
  tinySummary.candidates.length > 0,
  "FAIL: a flat 2-file repo should still produce at least one candidate (this was the octocat/Hello-World bug)",
);

console.log("\n✅ Tiny-repo fallback verified");
