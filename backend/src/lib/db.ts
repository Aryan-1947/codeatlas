// Single shared Postgres connection pool (Neon). Everything that touches
// the database — saved diagrams, chat history, LLM cache, usage counters —
// goes through this pool rather than opening its own connection.

import { Pool } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires TLS; matches sslmode=require
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}