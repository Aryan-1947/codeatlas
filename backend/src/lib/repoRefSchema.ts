import { z } from "zod";

// Matches GitHub's own username/repo-name character rules loosely — good
// enough to reject junk before it ever reaches a GitHub API call.
export const RepoRefParamsSchema = z.object({
  owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Invalid owner name"),
  repo: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/, "Invalid repository name"),
});
