import { LogIn, LogOut, Moon, Sun, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { navigateHome, signOut, syncAuthUser, useTheme, useUser } from "../lib/store";
import { clearToken, setToken } from "../lib/authToken";
import { clearGithubToken, getGithubToken, setGithubToken } from "../lib/githubToken";
import { API_BASE_URL } from "../lib/api";
import AuthDialog from "./AuthDialog";
import { GithubMark } from "./icons";

function GithubTokenButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => getGithubToken() ?? "");
  const [saved, setSaved] = useState(Boolean(getGithubToken()));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const save = () => {
    if (value.trim()) {
      setGithubToken(value.trim());
      setSaved(true);
    } else {
      clearGithubToken();
      setSaved(false);
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`brut-press-sm flex items-center gap-1.5 rounded-lg border-2 border-line px-2.5 py-1.5 text-[12px] font-bold shadow-sm ${
          saved ? "bg-mint text-[#0e4f3a]" : "bg-sky text-[#0d2f52]"
        }`}
        title="Paste a GitHub personal access token to diagram your private repos"
      >
        <GithubMark size={13} />
        <span className="hidden sm:inline">{saved ? "Token saved" : "Access token"}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border-2 border-line bg-surface shadow-pop">
          <div className="border-b-2 border-line bg-sunken px-3.5 py-2.5">
            <p className="text-[12px] font-bold text-ink">GitHub access token</p>
            <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-muted">
              Paste a token with "repo" scope to diagram your private repos. Stored only in this
              browser — never sent to our database.
            </p>
          </div>
          <div className="p-3">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type="password"
              placeholder="ghp_..."
              className="w-full rounded-md border-2 border-line bg-paper px-2.5 py-1.5 font-mono text-[12px] outline-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={save}
                className="brut-press-sm flex-1 rounded-md border-2 border-line bg-accent px-2.5 py-1.5 text-[12px] font-bold text-white shadow-sm"
              >
                Save
              </button>
              {saved && (
                <button
                  onClick={() => {
                    clearGithubToken();
                    setValue("");
                    setSaved(false);
                    setOpen(false);
                  }}
                  className="brut-press-sm rounded-md border-2 border-line bg-rose-soft px-2.5 py-1.5 text-[12px] font-bold text-rose shadow-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onSignOut }: { onSignOut: () => void }) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;
  const initial = (user.name || user.email)[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="brut-press-sm flex items-center gap-2 rounded-lg border-2 border-line bg-mint px-2 py-1 text-[#0e4f3a] shadow-sm"
        title={user.email}
      >
        {user.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-md border-2 border-line object-cover" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-line bg-accent font-display text-[11px] font-bold text-white">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[110px] truncate text-[13px] font-bold sm:block">{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border-2 border-line bg-surface shadow-pop">
          <div className="border-b-2 border-line bg-sunken px-3.5 py-2.5">
            <p className="truncate text-[13px] font-bold text-ink">{user.name}</p>
            <p className="truncate font-mono text-[11px] text-muted">{user.email}</p>
          </div>
          <p className="border-b-2 border-line px-3.5 py-2 text-[11px] font-medium leading-relaxed text-muted">
            History &amp; cached diagrams below this account are private to it.
          </p>
          <button
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-bold text-rose transition hover:bg-rose-soft"
          >
            <LogOut size={14} strokeWidth={2.5} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [theme, toggleTheme] = useTheme();
  const user = useUser();
  const { isAuthenticated, user: authUser, getAccessTokenSilently, logout } = useAuth0();
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated && authUser?.sub) {
      syncAuthUser({ sub: authUser.sub, name: authUser.name, email: authUser.email, picture: authUser.picture });
      getAccessTokenSilently({ detailedResponse: true })
        .then((res: any) => {
          setToken(res.access_token, Date.now() + res.expires_in * 1000);
          fetch(`${API_BASE_URL}/api/me`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${res.access_token}`,
            },
            body: JSON.stringify({ email: authUser.email, name: authUser.name }),
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }, [isAuthenticated, authUser, getAccessTokenSilently]);

  useEffect(() => {
    const openAuth = () => setAuthOpen(true);
    window.addEventListener("gd:open-auth", openAuth);
    return () => window.removeEventListener("gd:open-auth", openAuth);
  }, []);

  const handleSignOut = () => {
    signOut();
    clearToken();
    clearGithubToken();
    logout({ logoutParams: { returnTo: window.location.origin } });
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b-2 border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <button onClick={navigateHome} className="group flex items-center gap-2.5" aria-label="CodeAtlas home">
            <span className="brut-press-sm flex h-8 w-8 items-center justify-center rounded-lg border-2 border-line bg-accent text-white shadow-sm">
              <Workflow size={17} strokeWidth={2.4} />
            </span>
            <span className="font-heavy text-[17px] tracking-tight">
              CodeAtlas
              <sup className="ml-1.5 rounded-md border-2 border-line bg-banana px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-[#141414] shadow-sm">
                beta
              </sup>
            </span>
          </button>

          <div className="flex items-center gap-2">
            <GithubTokenButton />
            {user ? (
              <UserMenu onSignOut={handleSignOut} />
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="brut-press-sm flex items-center gap-2 rounded-lg border-2 border-line bg-accent px-3 py-1.5 text-[13px] font-bold text-white shadow-sm"
              >
                <LogIn size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="brut-press-sm flex h-9 w-9 items-center justify-center rounded-lg border-2 border-line bg-banana text-[#141414] shadow-sm"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} strokeWidth={2.5} /> : <Moon size={15} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </header>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}