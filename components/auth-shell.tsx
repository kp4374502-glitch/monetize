import * as React from "react";
import Image from "next/image";

/** Centered wrapper for Clerk's sign-in/sign-up widgets with the brand headline (amber accent word). */
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
    <main className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col items-center justify-start gap-5 px-4 py-5 sm:justify-center sm:gap-8 sm:py-12">
      <div className="text-center">
        {/* Compact on phones so the form starts near the top; 64px from sm up. */}
        <Image
          src="/logo.png"
          alt=""
          width={64}
          height={64}
          priority
          className="mx-auto mb-2 h-12 w-12 object-contain sm:mb-4 sm:h-16 sm:w-16"
        />
        <h1 className="text-3xl font-medium tracking-[-0.045em] sm:text-4xl">
          {title} <span className="text-gold-light">{accent}</span>
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary sm:mt-2 sm:text-base">{subtitle}</p>
      </div>
      {children}
    </main>
  );
}
