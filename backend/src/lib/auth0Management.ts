// Fetches a signed-in user's linked GitHub access token from Auth0's
// Management API, for reading their private repos. Nothing here is ever
// written to our own database — the token is used in memory for a single
// GitHub API call and then discarded.
//
// Requires AUTH0_M2M_CLIENT_ID / AUTH0_M2M_CLIENT_SECRET (an Auth0
// Machine-to-Machine app authorized for the Management API with the
// read:user_idp_tokens scope). If unset, this quietly returns null
// everywhere — private repos just behave like they do today.

import { env } from "../config/env.js";

interface CachedMgmtToken {
  token: string;
  expiresAt: number;
}

let cached: CachedMgmtToken | null = null;

async function getManagementToken(): Promise<string | null> {
  if (!env.AUTH0_M2M_CLIENT_ID || !env.AUTH0_M2M_CLIENT_SECRET) return null;
  if (cached && cached.expiresAt > Date.now() + 10_000) return cached.token;

  const res = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: env.AUTH0_M2M_CLIENT_ID,
      client_secret: env.AUTH0_M2M_CLIENT_SECRET,
      audience: `https://${env.AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

/** Returns the GitHub access token linked to this Auth0 user, or null if
 * they never signed in with GitHub (or the M2M app isn't configured). */
export async function getGithubTokenForUser(auth0UserId: string): Promise<string | null> {
  const mgmtToken = await getManagementToken();
  if (!mgmtToken) return null;

  const res = await fetch(`https://${env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0UserId)}`, {
    headers: { Authorization: `Bearer ${mgmtToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { identities?: { provider: string; access_token?: string }[] };
  return data.identities?.find((i) => i.provider === "github")?.access_token ?? null;
}