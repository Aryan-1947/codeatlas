// Local persistence: user profiles, per-account diagram cache and history,
// theme, plus a tiny hash-based router for fully static hosting.
//
// Accounts are local-first: a profile is just a name + email kept in this
// browser. Every account gets its own private namespace, so one signed-in
// user can never see another account's cached diagrams or history.

import { useEffect, useState } from "react";
import type { DiagramArtifact, HistoryItem, RepoRef } from "./types";

/* --------------------------------- router ---------------------------------- */

export type Route = { kind: "home" } | { kind: "diagram"; ref: RepoRef };

export function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const m = hash.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (m) return { kind: "diagram", ref: { owner: m[1], repo: m[2] } };
  return { kind: "home" };
}

export function navigateHome() {
  window.location.hash = "/";
}

export function navigateTo(ref: RepoRef) {
  window.location.hash = `/${ref.owner}/${ref.repo}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

/* ---------------------------------- theme ---------------------------------- */

const THEME_EVENT = "gd:theme-changed";

export function getTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.backgroundColor = theme === "dark" ? "#18181b" : "#faf6ec";
  try {
    localStorage.setItem("gd-theme", theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme(): ["light" | "dark", () => void] {
  const [theme, setTheme] = useState<"light" | "dark">(getTheme);

  useEffect(() => {
    const sync = () => setTheme(getTheme());
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = () => {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  };

  return [theme, toggle];
}

/* --------------------------------- accounts --------------------------------- */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  picture?: string;
  createdAt: number;
}

const USER_KEY = "gd-user-v1";
const USER_EVENT = "gd:user-changed";

/** Stable short id for an email (djb2 hash, base36). */
function accountId(email: string): string {
  let h = 5381;
  const normalized = email.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
  }
  return `u${h.toString(36)}`;
}

export function getUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as UserProfile;
    return u && u.id && u.email ? u : null;
  } catch {
    return null;
  }
}

export function signIn(name: string, email: string): UserProfile {
  const user: UserProfile = {
    id: accountId(email),
    name: name.trim() || email.split("@")[0],
    email: email.trim().toLowerCase(),
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(USER_EVENT));
  return user;
}

export function signOut() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(USER_EVENT));
}


/** Mirrors the real Auth0 user into the same local profile used for cache/history namespacing. */
export function syncAuthUser(authUser: { sub: string; name?: string; email?: string; picture?: string }) {
  const profile: UserProfile = {
    id: authUser.sub,
    name: authUser.name || authUser.email || "User",
    email: authUser.email || "",
    picture: authUser.picture,
    createdAt: Date.now(),
  };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(USER_EVENT));
}


export function useUser(): UserProfile | null {
  const [user, setUser] = useState<UserProfile | null>(getUser);
  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener(USER_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(USER_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return user;
}

/** Open the global sign-in dialog from anywhere. */
export function requestSignIn() {
  window.dispatchEvent(new Event("gd:open-auth"));
}

/* ---------------------------- per-account storage --------------------------- */

function ns(): string {
  return getUser()?.id ?? "guest";
}

const CACHE_PREFIX = "gd-cache-v2:";
const HISTORY_PREFIX = "gd-history-v2:";
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12h

export function readCache(key: string): DiagramArtifact | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + ns() + ":" + key.toLowerCase());
    if (!raw) return null;
    const artifact = JSON.parse(raw) as DiagramArtifact;
    if (artifact.version !== 1 || Date.now() - artifact.createdAt > CACHE_TTL) return null;
    return artifact;
  } catch {
    return null;
  }
}

export function writeCache(key: string, artifact: DiagramArtifact) {
  try {
    localStorage.setItem(CACHE_PREFIX + ns() + ":" + key.toLowerCase(), JSON.stringify(artifact));
  } catch {
    // Quota pressure: drop oldest cache entries for this account, retry once.
    try {
      const mine = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX + ns()));
      if (mine.length > 8) {
        mine.slice(0, mine.length - 8).forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(CACHE_PREFIX + ns() + ":" + key.toLowerCase(), JSON.stringify(artifact));
      }
    } catch {
      /* ignore */
    }
  }
}

/* --------------------------------- history ---------------------------------- */

export function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + ns());
    const list = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: HistoryItem) {
  try {
    const list = readHistory().filter((h) => h.fullName.toLowerCase() !== item.fullName.toLowerCase());
    list.unshift(item);
    localStorage.setItem(HISTORY_PREFIX + ns(), JSON.stringify(list.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_PREFIX + ns());
  } catch {
    /* ignore */
  }
}

/* -------------------------------- formatting -------------------------------- */

export function formatStars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
