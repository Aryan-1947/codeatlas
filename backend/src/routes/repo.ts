import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { RepoRefParamsSchema } from "../lib/repoRefSchema.js";
import { buildRepoContext } from "../services/repoContext.js";

export const repoRouter = Router();

repoRouter.get(
  "/:owner/:repo",
  asyncHandler(async (req, res) => {
    const parsed = RepoRefParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_repo_ref", "Repository must look like owner/repo.");
    }
    const context = await buildRepoContext(parsed.data);
    res.json(context);
  }),
);
