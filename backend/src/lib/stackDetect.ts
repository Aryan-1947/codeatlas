// Reads real dependency names out of real manifest files, and checks for
// real structural files (Dockerfile, workflow configs, etc). This is literal
// extraction from content the repo actually contains, not architectural
// guessing — so unlike the old role-classification regexes, it stays as
// deterministic code rather than moving to the LLM.

import type { TreeEntry } from "../types/github.js";

const FRAMEWORK_SIGNALS: { match: RegExp; label: string }[] = [
  { match: /"next"\s*:/, label: "Next.js" },
  { match: /"nuxt"\s*:/, label: "Nuxt" },
  { match: /"react"\s*:/, label: "React" },
  { match: /"vue"\s*:/, label: "Vue" },
  { match: /"svelte"\s*:/, label: "Svelte" },
  { match: /"@angular\/core"\s*:/, label: "Angular" },
  { match: /"express"\s*:/, label: "Express" },
  { match: /"fastify"\s*:/, label: "Fastify" },
  { match: /"@nestjs\/core"\s*:/, label: "NestJS" },
  { match: /"hono"\s*:/, label: "Hono" },
  { match: /"vite"\s*:/, label: "Vite" },
  { match: /"tailwindcss"\s*:/, label: "Tailwind CSS" },
  { match: /"prisma"|"@prisma\/client"\s*:/, label: "Prisma" },
  { match: /"mongoose"\s*:/, label: "Mongoose" },
  { match: /"redis"\s*:/, label: "Redis" },
  { match: /"graphql"\s*:/, label: "GraphQL" },
  { match: /"trpc"|"@trpc\/server"\s*:/, label: "tRPC" },
  { match: /"electron"\s*:/, label: "Electron" },
  { match: /"openai"\s*:/, label: "OpenAI SDK" },
  { match: /"groq-sdk"\s*:/, label: "Groq SDK" },
  { match: /fastapi/i, label: "FastAPI" },
  { match: /django/i, label: "Django" },
  { match: /flask/i, label: "Flask" },
  { match: /sqlalchemy/i, label: "SQLAlchemy" },
  { match: /pydantic/i, label: "Pydantic" },
  { match: /celery/i, label: "Celery" },
  { match: /pytest/i, label: "pytest" },
  { match: /rails/i, label: "Rails" },
  { match: /spring-boot|org\.springframework/i, label: "Spring" },
  { match: /laravel/i, label: "Laravel" },
  { match: /actix/i, label: "Actix" },
  { match: /tokio/i, label: "Tokio" },
  { match: /gin-gonic/i, label: "Gin" },
  { match: /gorilla\/mux/i, label: "Gorilla Mux" },
  { match: /flutter/i, label: "Flutter" },
  { match: /phoenix/i, label: "Phoenix" },
];

const STRUCTURAL_SIGNALS: [RegExp, string][] = [
  [/^dockerfile$|(^|\/)dockerfile/, "Docker"],
  [/(^|\/)docker-compose\.(yml|yaml)$/, "Docker Compose"],
  [/\.github\/workflows\/[^/]+\.(yml|yaml)$/, "GitHub Actions"],
  [/(^|\/)vercel\.json$/, "Vercel"],
  [/(^|\/)kubernetes\/|(^|\/)k8s\//, "Kubernetes"],
  [/(^|\/)terraform\/|\.tf$/, "Terraform"],
  [/(^|\/)wrangler\.(toml|json)$/, "Cloudflare Workers"],
  [/(^|\/)prisma\/schema\.prisma$/, "Prisma"],
  [/(^|\/)supabase\//, "Supabase"],
  [/(^|\/)nginx\.conf$/, "Nginx"],
];

export function detectStack(manifests: Record<string, string>, tree: TreeEntry[]): string[] {
  const manifestText = Object.entries(manifests)
    .map(([k, v]) => `${k}\n${v}`)
    .join("\n");

  const found: string[] = [];
  for (const sig of FRAMEWORK_SIGNALS) {
    if (sig.match.test(manifestText) && !found.includes(sig.label)) found.push(sig.label);
  }

  const paths = tree.filter((t) => t.type === "blob").map((t) => t.path.toLowerCase());
  for (const [re, label] of STRUCTURAL_SIGNALS) {
    if (paths.some((p) => re.test(p)) && !found.includes(label)) found.push(label);
  }

  return found.slice(0, 10);
}
