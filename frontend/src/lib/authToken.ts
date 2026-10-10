// Single place that holds the current Auth0 access token, no matter which
// login path produced it: Google/GitHub (via the SDK's redirect flow) or
// email/password (our own embedded form, which talks to Auth0's API
// directly). Everything that calls our backend reads the token from here.

const STORAGE_KEY = "gd-auth-token-v1";

let token: string | null = null;
let expiresAt = 0;

try {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt > Date.now()) {
      token = parsed.token;
      expiresAt = parsed.expiresAt;
    }
  }
} catch {
  /* ignore */
}

export function setToken(newToken: string, newExpiresAt: number) {
  token = newToken;
  expiresAt = newExpiresAt;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    /* ignore */
  }
}

export function getToken(): string | null {
  if (!token || Date.now() >= expiresAt) return null;
  return token;
}

export function clearToken() {
  token = null;
  expiresAt = 0;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}