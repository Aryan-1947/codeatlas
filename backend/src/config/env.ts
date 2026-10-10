// Loads and validates process.env once at startup. If anything required is
// missing or malformed, the server refuses to start and says exactly why —
// no silent fallbacks, no undefined creeping into a request handler later.

import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required — see backend/.env.example"),
  // openai/gpt-oss-120b: Groq's current production-tier model, supports
  // strict JSON-schema output (used for graph generation). Do NOT default
  // to llama-3.3-70b-versatile — Groq shut it down on 2026-08-16.
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),

  // Optional: without it, GitHub calls run at the 60 req/hr anonymous limit.
  // Fine-grained token, "Public Repositories (read-only)" only.
  GITHUB_TOKEN: z.string().optional(),

  AUTH0_DOMAIN: z.string().min(1, "AUTH0_DOMAIN is required — see backend/.env.example"),
  AUTH0_AUDIENCE: z.string().min(1, "AUTH0_AUDIENCE is required — see backend/.env.example"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see backend/.env.example"),

  // Optional: enables private-repo access via each signed-in user's own
  // GitHub token (fetched from Auth0's Management API, never stored by us).
  // Without these set, private repos just keep returning the existing 404.
  AUTH0_M2M_CLIENT_ID: z.string().optional(),
  AUTH0_M2M_CLIENT_SECRET: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid or missing environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  console.error("\nDid you copy backend/.env.example to backend/.env and fill it in?");
  process.exit(1);
}

export const env = parsed.data;
