import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/auth.js";
import { chatRouter } from "./routes/chat.js";
import { diagramsRouter } from "./routes/diagrams.js";
import { generateRouter } from "./routes/generate.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { repoRouter } from "./routes/repo.js";

const app = express();

app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use("/api/health", healthRouter);
app.use("/api/repo", repoRouter);
app.use("/api/generate", generateRouter);
app.use("/api/chat", requireAuth, chatRouter);
app.use("/api/diagrams", requireAuth, diagramsRouter);
app.use("/api/me", meRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`✅ codeatlas-backend listening on http://localhost:${env.PORT}`);
});