"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, useUser } from "@clerk/nextjs";
import { Laptop, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { browserLabel, deviceTitle, locationLabel, sortSessions } from "@/lib/auth/devices";

type User = NonNullable<ReturnType<typeof useUser>["user"]>;
type DeviceSession = Awaited<ReturnType<User["getSessions"]>>[number];

const when = (d: Date) => d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * "Devices" tab inside Manage account: every device currently signed in to this account, with a
 * Sign out button on each one except the device you're using (use the menu's Sign out for that).
 * Clerk scopes getSessions()/revoke() to the signed-in user, so this can only ever touch your own sessions.
 */
export function DevicesPanel() {
  const { user } = useUser();
  const { session: current } = useSession();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // a session id, or "all"

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setSessions(await user.getSessions());
    } catch {
      setError("Couldn't load your devices. Try again in a moment.");
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut(targets: DeviceSession[], key: string) {
    setBusy(key);
    setError(null);
    try {
      for (const s of targets) await s.revoke();
    } catch {
      setError("Couldn't sign that device out. Try again.");
    } finally {
      setBusy(null);
      await load();
    }
  }

  if (sessions === null) {
    return <p className="text-sm text-text-secondary">{error ?? "Loading your devices…"}</p>;
  }

  const ordered = sortSessions(sessions, current?.id);
  const others = ordered.filter((s) => s.id !== current?.id);

  return (
    <div className="space-y-4" data-testid="devices-panel">
      <div>
        <h2 className="text-lg font-bold">Devices</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Everywhere you're signed in. Sign out any device you don't want staying logged in.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-400" data-testid="devices-error">
          {error}
        </p>
      )}

      <ul className="space-y-2.5">
        {ordered.map((s) => {
          const isCurrent = s.id === current?.id;
          const a = s.latestActivity;
          const Icon = a.isMobile ? Smartphone : Laptop;
          const details = [browserLabel(a), locationLabel(a)].filter(Boolean).join(" · ");
          return (
            <li
              key={s.id}
              data-testid="device-row"
              className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle p-3.5"
            >
              <Icon className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {deviceTitle(a)}
                  {isCurrent && <Badge status="active">This device</Badge>}
                </p>
                {details && <p className="mt-0.5 text-text-secondary">{details}</p>}
                <p className="mt-0.5 text-xs text-text-secondary">Last active {when(s.lastActiveAt)}</p>
              </div>
              {!isCurrent && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => signOut([s], s.id)}
                  data-testid="device-sign-out"
                >
                  {busy === s.id ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 1 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            if (confirm(`Sign out of all ${others.length} other devices? This device stays signed in.`)) void signOut(others, "all");
          }}
          data-testid="devices-sign-out-all"
        >
          {busy === "all" ? "Signing out…" : "Sign out all other devices"}
        </Button>
      )}
      {others.length === 0 && <p className="text-sm text-text-secondary">This is the only device signed in.</p>}
    </div>
  );
}
