import * as React from "react";
import { LogoMark } from "@/components/logo";

/** Centered wrapper for Clerk's sign-in/sign-up widgets with the brand headline (italic serif accent). */
export function AuthShell({
  title,
  accent,
  subtitle,
  children,
}: {
  title: string;
  accent: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-center gap-8 px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,rgba(240,197,114,0.14),transparent_70%)]"
      />
      <div className="text-center">
        <LogoMark size={64} priority className="mx-auto mb-4 drop-shadow-[0_0_22px_rgba(240,197,114,0.3)]" />
        <h1 className="text-4xl font-extrabold tracking-tight">
          {title} <span className="font-serif font-medium italic text-gold-light">{accent}</span>
        </h1>
        <p className="mt-2 text-text-secondary">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}
