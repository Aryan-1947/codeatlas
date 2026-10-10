import { Router } from "express";
import { query } from "../lib/db.js";

export const diagramsRouter = Router();

interface DiagramHistoryRow {
  full_name: string;
  description: string | null;
  stars: number;
  language: string | null;
  updated_at: string;
}

diagramsRouter.get("/", async (req, res) => {
  const userId = req.auth?.payload?.sub;
  if (!userId) {
    res.status(401).json({ error: { code: "unauthorized", message: "Sign in to see your history." } });
    return;
  }

  const rows = await query<DiagramHistoryRow>(
    `SELECT full_name, description, stars, language, updated_at
     FROM diagrams
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 12`,
    [userId],
  );

  res.json(
    rows.map((row) => ({
      fullName: row.full_name,
      description: row.description,
      stars: row.stars,
      language: row.language,
      createdAt: new Date(row.updated_at).getTime(),
    })),
  );
});


diagramsRouter.delete("/:owner/:repo", async (req, res) => {
    const userId = req.auth?.payload?.sub;
    if (!userId) {
      res.status(401).json({ error: { code: "unauthorized", message: "Sign in required." } });
      return;
    }
  
    const fullName = `${req.params.owner}/${req.params.repo}`.toLowerCase();
    await query(`DELETE FROM diagrams WHERE user_id = $1 AND full_name = $2`, [userId, fullName]);
    res.status(204).end();
  });
  
  diagramsRouter.delete("/", async (req, res) => {
    const userId = req.auth?.payload?.sub;
    if (!userId) {
      res.status(401).json({ error: { code: "unauthorized", message: "Sign in required." } });
      return;
    }
  
    await query(`DELETE FROM diagrams WHERE user_id = $1`, [userId]);
    res.status(204).end();
  });