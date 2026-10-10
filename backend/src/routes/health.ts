import { Router } from "express";
import { env } from "../config/env.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "codeatlas-backend",
    env: env.NODE_ENV,
    time: new Date().toISOString(),
  });
});
