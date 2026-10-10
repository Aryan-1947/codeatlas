// The user's own GitHub Personal Access Token, pasted in by them to read
// their private repos. Kept only in this browser's localStorage — never
// sent anywhere except as a header on a generate request, and never stored
// on our backend or database.

const KEY = "gd-github-token-v1";

export function getGithubToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setGithubToken(token: string) {
  try {
    localStorage.setItem(KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function clearGithubToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}