import { searchTreePaths } from "../src/services/searchTree.js";

const tree = [
  { path: "src/routes/widgets.ts", type: "blob" as const },
  { path: "src/routes/health.ts", type: "blob" as const },
  { path: "src/services/auth.ts", type: "blob" as const },
  { path: "src/services/db.ts", type: "blob" as const },
  { path: "README.md", type: "blob" as const },
];

console.log("=== searchTreePaths ===");

const authResults = searchTreePaths("how does authentication work?", tree);
console.log("auth query ->", authResults);
console.assert(
  authResults.includes("src/services/auth.ts"),
  "FAIL: expected auth.ts to match an authentication question",
);

const widgetResults = searchTreePaths("where are widgets handled", tree);
console.log("widgets query ->", widgetResults);
console.assert(
  widgetResults.includes("src/routes/widgets.ts"),
  "FAIL: expected widgets.ts to match a widgets question",
);

const noiseResults = searchTreePaths("what is the the and", tree);
console.log("stopword-only query ->", noiseResults);
console.assert(noiseResults.length === 0, "FAIL: expected no matches for an all-stopword question");

console.log("\n✅ searchTreePaths checks passed (no 'FAIL:' lines above)");
