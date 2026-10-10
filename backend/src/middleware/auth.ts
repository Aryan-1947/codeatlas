// Verifies the Auth0-issued JWT on every request to a protected route.
// If the token is missing, expired, or signed for a different audience,
// this throws before the route handler ever runs.

import { auth } from "express-oauth2-jwt-bearer";
import { env } from "../config/env.js";

export const requireAuth = auth({
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}`,
  audience: env.AUTH0_AUDIENCE,
});