import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The brand mark (public/logo.png — no text in the image) plus the "Monetize" wordmark. */
export function LogoMark({ size = 36, className, priority = false }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)} aria-label="Monetize home">
      <LogoMark size={36} priority />
      <span className="text-lg font-extrabold tracking-tight">Monetize</span>
    </Link>
  );
}
