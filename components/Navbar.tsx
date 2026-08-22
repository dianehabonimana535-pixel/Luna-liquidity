"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Moon, Droplets, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const WalletMultiButtonDynamic = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const links = [
  { href: "/", label: "Home" },
  { href: "/create-pool", label: "Create Pool" },
  { href: "/manage", label: "Manage Liquidity" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-display text-base font-semibold">
          <Moon className="h-5 w-5 text-moonlight" />
          Luna <span className="text-tide">Liquidity</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground",
                pathname === link.href && "bg-card text-foreground"
              )}
            >
              {link.label === "Create Pool" && <Droplets className="h-3.5 w-3.5" />}
              {link.label === "Manage Liquidity" && <Waves className="h-3.5 w-3.5" />}
              {link.label}
            </Link>
          ))}
        </nav>

        <WalletMultiButtonDynamic className="!h-9 !rounded-xl !bg-tide-gradient !text-xs !font-semibold !text-background" />
      </div>

      <nav className="flex gap-1 border-t border-border/60 px-4 py-2 md:hidden">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-center text-xs text-muted",
              pathname === link.href && "bg-card text-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
