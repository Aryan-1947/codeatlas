// Sign-in dialog: our own branded card. Google/GitHub hand off briefly to
// their own pages via Auth0 (unavoidable for any app, anywhere), then
// Header.tsx's useAuth0 effect picks up the session and syncs the user.

import { ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { GithubMark } from "./icons";

function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l6-6C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c2.8 0 5.3 1 7.3 2.7l6-6C34.1 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.6-4.8l-6.3-5.3C29.3 35.6 26.8 36 24 36c-5.2 0-9.6-2.6-11.3-6.8l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l6.3 5.3C41.6 35.3 44 30.1 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loginWithRedirect } = useAuth0();

  if (!open) return null;

  const social = (connection: string) => {
    onClose();
    loginWithRedirect({ authorizationParams: { connection } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border-2 border-line bg-surface p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-line bg-lavend text-ink shadow-sm">
              <UserRound size={17} strokeWidth={2.4} />
            </span>
            <div>
              <h2 className="font-display text-base font-bold tracking-tight">Sign in to CodeAtlas</h2>
              <p className="text-xs text-muted">Private history per account</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="brut-press-sm rounded-md border-2 border-line bg-surface p-1.5 text-ink shadow-sm"
            aria-label="Close"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            onClick={() => social("google-oauth2")}
            className="brut-press flex w-full items-center justify-center gap-2.5 rounded-lg border-2 border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink shadow-sm"
          >
            <GoogleMark size={16} />
            Continue with Google
          </button>

          <button
            onClick={() => social("github")}
            className="brut-press flex w-full items-center justify-center gap-2.5 rounded-lg border-2 border-line bg-paper px-4 py-2.5 text-sm font-bold text-ink shadow-sm"
          >
            <GithubMark size={16} />
            Continue with GitHub
          </button>

          <p className="flex gap-2 rounded-lg border-2 border-line bg-mint p-3 text-xs font-medium leading-relaxed text-[#0e4f3a]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            Your account is secured by Auth0. Diagrams and history stay private to your account — other accounts
            signed in here will never see them.
          </p>
        </div>
      </div>
    </div>
  );
}