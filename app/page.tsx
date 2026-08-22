import Link from "next/link";
import { ArrowRight, Droplets, Waves, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import TideLine from "@/components/TideLine";

export default function Home() {
  return (
    <section className="relative overflow-hidden">
      <TideLine />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 pb-24 pt-20 text-center md:pt-28">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tide" />
          Live on Solana Mainnet via Raydium
        </div>

        <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          The moon pulls the tides.
          <br />
          <span className="bg-tide-gradient bg-clip-text text-transparent">
            You control the liquidity.
          </span>
        </h1>

        <p className="max-w-xl text-balance text-base text-muted sm:text-lg">
          Create a real, public Raydium liquidity pool for your Solana token,
          or add and withdraw liquidity from an existing pool - straight from
          your wallet, no middleman.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" variant="gradient">
            <Link href="/create-pool">
              Create a pool <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/manage">Manage existing liquidity</Link>
          </Button>
        </div>

        <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: Droplets, label: "Real Raydium pools", desc: "Not isolated or custom" },
            { icon: ShieldCheck, label: "Non-custodial", desc: "We never touch your keys" },
            { icon: Waves, label: "Add or withdraw", desc: "Full liquidity control" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/40 px-4 py-5"
            >
              <f.icon className="h-5 w-5 text-tide" />
              <p className="text-sm font-semibold">{f.label}</p>
              <p className="text-xs text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
