import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../lib/db.js";

export const meRouter = Router();

const ProfileSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
});

meRouter.post("/", requireAuth, async (req, res) => {
  const sub = (req as any).auth?.payload?.sub as string | undefined;
  if (!sub) {
    res.status(401).json({ error: { code: "unauthorized", message: "Missing user identity." } });
    return;
  }
  const parsed = ProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "invalid_body", message: "Invalid profile payload." } });
    return;
  }
  await query(
    `INSERT INTO users (id, email, name, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET email = COALESCE($2, users.email), name = COALESCE($3, users.name)`,
    [sub, parsed.data.email ?? null, parsed.data.name ?? null],
  );
  res.json({ ok: true });
});