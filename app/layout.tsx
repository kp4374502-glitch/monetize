import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// italic serif accent for emphasized words in marketing/auth headlines only
const serif = Playfair_Display({ subsets: ["latin"], style: ["italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Monetize",
  description: "Run paid clipping campaigns: creators submit, reviewers verify, payouts calculate themselves.",
};

/** Clerk widgets restyled from the default purple/white to the gold/black brand tokens. */
const clerkAppearance = {
  variables: {
    colorPrimary: "#f0c572",
    colorTextOnPrimaryBackground: "#000000",
    colorBackground: "#000000",
    colorText: "#ffffff",
    colorTextSecondary: "#a3a3a3",
    colorInputBackground: "#0a0a0a",
    colorInputText: "#ffffff",
    colorNeutral: "#ffffff",
    colorDanger: "#f87171",
    colorSuccess: "#4ade80",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: "!border !border-gold-border/30 !bg-bg-secondary !shadow-2xl !shadow-black/60",
    // AuthShell already renders the page headline; Clerk's own header would show the dashboard's
    // application name ("My Application") and repeat it.
    headerTitle: "!hidden",
    headerSubtitle: "!hidden",
    formButtonPrimary:
      "!rounded-full !bg-gold-gradient !font-semibold !text-black !shadow-none hover:!brightness-110 !normal-case",
    footerActionLink: "!text-gold-light hover:!text-gold-light/80",
    formFieldInput: "!border-subtle focus:!border-gold-border",
    identityPreviewEditButton: "!text-gold-light",
    socialButtonsBlockButton: "!border-subtle hover:!bg-white/5",
    userButtonPopoverCard: "!border !border-gold-border/30 !bg-bg-secondary",
  },
} as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className="dark">
        <body className={`${sans.variable} ${serif.variable} min-h-screen bg-bg-primary font-sans text-text-primary`}>
          <AppHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
