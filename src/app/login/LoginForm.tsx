"use client";

import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

type Mode = "signin" | "setup";

async function post(url: string, body: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [setupToken, setSetupToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState<string>();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes("NotAllowed") || msg.includes("timed out") ? "Passkey prompt was closed. Try again." : msg);
    } finally {
      setBusy(false);
    }
  }

  const signIn = () =>
    run(async () => {
      const optionsJSON = await post("/api/auth/login/options");
      const response = await startAuthentication({ optionsJSON });
      await post("/api/auth/login/verify", { response });
      window.location.assign("/");
    });

  const register = () =>
    run(async () => {
      const optionsJSON = await post("/api/auth/register/options", { setupToken });
      const response = await startRegistration({ optionsJSON });
      await post("/api/auth/register/verify", { response, setupToken, label: navigator.platform });
      window.location.assign("/");
    });

  const emailLink = () =>
    run(async () => {
      await post("/api/auth/magic");
      setNotice("Check your Outlook inbox for a sign-in link. It expires in 15 minutes.");
    });

  return (
    <div className="mt-8">
      {mode === "signin" ? (
        <button
          onClick={signIn}
          disabled={busy}
          className="w-full rounded-md bg-dawn px-4 py-2.5 font-medium text-ink hover:bg-dawn/90 disabled:opacity-60"
        >
          {busy ? "Waiting for passkey…" : "Sign in with passkey"}
        </button>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm text-muted" htmlFor="setup">
            Setup code (SETUP_TOKEN from your environment)
          </label>
          <input
            id="setup"
            type="password"
            autoComplete="off"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-text"
          />
          <button
            onClick={register}
            disabled={busy || !setupToken}
            className="w-full rounded-md bg-dawn px-4 py-2.5 font-medium text-ink hover:bg-dawn/90 disabled:opacity-60"
          >
            {busy ? "Waiting for passkey…" : "Create passkey"}
          </button>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-loss">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-gain">{notice}</p>}

      <div className="mt-10 space-y-2 text-sm">
        <button onClick={emailLink} disabled={busy} className="block text-muted hover:text-text">
          Lost your device? Email me a sign-in link
        </button>
        <button onClick={() => setMode(mode === "signin" ? "setup" : "signin")} className="block text-faint hover:text-text">
          {mode === "signin" ? "First time here? Set up a passkey" : "Back to sign in"}
        </button>
      </div>
    </div>
  );
}
