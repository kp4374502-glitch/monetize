import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monetize",
  description: "Multi-tenant clipping campaign platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="bg-bg-primary text-text-primary min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
