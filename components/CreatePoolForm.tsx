"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";
import { Droplets, ExternalLink, Copy, Plus, Lock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  createPool,
  fetchFeeTiers,
  formatFeeTierPercent,
  NATIVE_SOL_MINT,
  USDC_MINT,
  type FeeTierOption,
} from "@/lib/raydium";
import { solscanAddressUrl } from "@/lib/network";
import { cn, shortenAddress } from "@/lib/utils";

type QuotePreset = "SOL" | "USDC" | "custom";

const QUOTE_PRESETS: { key: QuotePreset; label: string; mint: string; decimals: number }[] = [
  { key: "SOL", label: "SOL", mint: NATIVE_SOL_MINT, decimals: 9 },
  { key: "USDC", label: "USDC", mint: USDC_MINT, decimals: 6 },
];

export default function CreatePoolForm() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [poolTypeConfirmed, setPoolTypeConfirmed] = useState(false);

  const [baseMint, setBaseMint] = useState("");
  const [baseDecimals, setBaseDecimals] = useState("9");
  const [baseAmount, setBaseAmount] = useState("");

  const [quotePreset, setQuotePreset] = useState<QuotePreset>("SOL");
  const [customQuoteMint, setCustomQuoteMint] = useState("");
  const [customQuoteDecimals, setCustomQuoteDecimals] = useState("6");
  const [quoteAmount, setQuoteAmount] = useState("");

  const [feeTiers, setFeeTiers] = useState<FeeTierOption[]>([]);
  const [selectedFeeTierId, setSelectedFeeTierId] = useState<string>("");
  const [loadingFeeTiers, setLoadingFeeTiers] = useState(false);

  const [startMode, setStartMode] = useState<"now" | "custom">("now");
  const [customStart, setCustomStart] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ poolId: string; signature: string } | null>(
    null
  );

  useEffect(() => {
    if (!poolTypeConfirmed || !wallet.connected) return;
    setLoadingFeeTiers(true);
    fetchFeeTiers(wallet, connection)
      .then((tiers) => {
        setFeeTiers(tiers);
        if (tiers.length > 0) setSelectedFeeTierId(tiers[0].id);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Could not load fee tiers from Raydium.");
      })
      .finally(() => setLoadingFeeTiers(false));
  }, [poolTypeConfirmed, wallet.connected]);

  const quoteMint =
    quotePreset === "custom"
      ? customQuoteMint.trim()
      : QUOTE_PRESETS.find((p) => p.key === quotePreset)?.mint ?? "";
  const quoteDecimals =
    quotePreset === "custom"
      ? Number(customQuoteDecimals)
      : QUOTE_PRESETS.find((p) => p.key === quotePreset)?.decimals ?? 9;

  function validate(): string | null {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(baseMint.trim());
    } catch {
      return "Enter a valid base token mint address";
    }
    const bDecimals = Number(baseDecimals);
    if (!Number.isInteger(bDecimals) || bDecimals < 0 || bDecimals > 9) {
      return "Base token decimals must be a whole number between 0 and 9";
    }
    if (!Number(baseAmount) || Number(baseAmount) <= 0) {
      return "Enter the base token amount to deposit";
    }
    try {
      // eslint-disable-next-line no-new
      new PublicKey(quoteMint);
    } catch {
      return "Enter a valid quote token mint address";
    }
    if (!Number(quoteAmount) || Number(quoteAmount) <= 0) {
      return "Enter the quote token amount to deposit";
    }
    if (!selectedFeeTierId) {
      return "Select a fee tier";
    }
    if (startMode === "custom" && !customStart) {
      return "Pick a start date and time, or choose Start Now";
    }
    return null;
  }

  async function handleCreatePool() {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error("Connect your wallet first");
      return;
    }
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const poolResult = await createPool({
        wallet,
        connection,
        baseMintAddress: baseMint.trim(),
        baseDecimals: Number(baseDecimals),
        baseAmount: Number(baseAmount),
        quoteMintAddress: quoteMint,
        quoteDecimals,
        quoteAmount: Number(quoteAmount),
        feeTierId: selectedFeeTierId,
        startTime: startMode === "custom" ? new Date(customStart) : null,
      });
      setResult(poolResult);
      toast.success("Liquidity pool created on Raydium!");
    } catch (err: any) {
      console.error(err);
      const rejected =
        typeof err?.message === "string" && /reject|declin|cancel/i.test(err.message);
      toast.error(
        rejected
          ? "Transaction was cancelled in your wallet."
          : err?.message || "Failed to create the pool. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  if (result) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 pt-8 text-center">
          <h2 className="font-display text-2xl font-semibold text-tide">Pool is live</h2>
          <p className="text-sm text-muted">
            Your pool is now real and public on Raydium. It will appear on
            raydium.io, Jupiter, and DEX Screener shortly.
          </p>
          <button
            onClick={() => copy(result.poolId)}
            className="w-full space-y-1.5 rounded-xl border border-border bg-background/40 p-4 text-left"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted">
              Pool ID <Copy className="h-3 w-3" />
            </span>
            <p className="break-all font-mono text-sm text-foreground">
              {shortenAddress(result.poolId, 8)}
            </p>
          </button>
          <Button asChild variant="outline" className="w-full">
            <a href={solscanAddressUrl(result.poolId)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> View pool on Solscan
            </a>
          </Button>
          <Button
            variant="gradient"
            className="w-full"
            onClick={() => {
              setResult(null);
              setPoolTypeConfirmed(false);
            }}
          >
            Create another pool
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!poolTypeConfirmed) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>I want to...</CardTitle>
          <CardDescription>Select a pool type to create a pool for any token pair.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-tide bg-tide/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-foreground">Create pool</span>
            </div>

            <button
              disabled
              className="mb-2 flex w-full cursor-not-allowed items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3 text-left opacity-50"
            >
              <div>
                <p className="text-sm font-medium">Concentrated Liquidity</p>
                <p className="text-xs text-muted">Custom ranges, increased capital efficiency</p>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted">
                Coming soon
              </span>
            </button>

            <div className="mb-2 flex w-full items-start justify-between gap-3 rounded-lg border border-tide bg-tide/10 p-3 text-left">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-tide">
                  <Sparkles className="h-3.5 w-3.5" /> Standard AMM
                </p>
                <p className="text-xs text-muted">Newest CPMM, cheaper, supports Token-2022</p>
              </div>
            </div>

            <button
              disabled
              className="flex w-full cursor-not-allowed items-start justify-between gap-3 rounded-lg border border-border bg-card/40 p-3 text-left opacity-50"
            >
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="h-3.5 w-3.5" /> Legacy AMM v4
                </p>
                <p className="text-xs text-muted">
                  Requires an OpenBook market, more expensive
                </p>
              </div>
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted">
                Not supported
              </span>
            </button>
          </div>

          <Button
            size="lg"
            variant="gradient"
            className="w-full"
            onClick={() => setPoolTypeConfirmed(true)}
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  const startingPrice =
    Number(baseAmount) > 0 && Number(quoteAmount) > 0
      ? (Number(quoteAmount) / Number(baseAmount)).toPrecision(6)
      : null;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-tide" /> Initial Liquidity
        </CardTitle>
        <CardDescription>
          Deposits real liquidity into a new Raydium Standard AMM (CPMM)
          pool. Once created, it&apos;s public and permanent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Base token</Label>
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <Input
              placeholder="Your token's mint address"
              value={baseMint}
              onChange={(e) => setBaseMint(e.target.value)}
              className="mb-2 border-none bg-transparent px-0 focus-visible:ring-0"
            />
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Amount, e.g. 500000"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
              />
              <Input
                type="number"
                min={0}
                max={9}
                title="Decimals"
                value={baseDecimals}
                onChange={(e) => setBaseDecimals(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-tide-gradient">
            <Plus className="h-4 w-4 text-background" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Quote token</Label>
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 flex gap-2">
              {QUOTE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setQuotePreset(p.key)}
                  className={cn(
                    "rounded-lg border px-3 py-1 text-xs font-medium",
                    quotePreset === p.key
                      ? "border-tide bg-tide/10 text-tide"
                      : "border-border text-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => setQuotePreset("custom")}
                className={cn(
                  "rounded-lg border px-3 py-1 text-xs font-medium",
                  quotePreset === "custom"
                    ? "border-tide bg-tide/10 text-tide"
                    : "border-border text-muted"
                )}
              >
                Custom
              </button>
            </div>

            {quotePreset === "custom" && (
              <div className="mb-2 flex gap-2">
                <Input
                  placeholder="Quote token mint address"
                  value={customQuoteMint}
                  onChange={(e) => setCustomQuoteMint(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  max={9}
                  title="Decimals"
                  value={customQuoteDecimals}
                  onChange={(e) => setCustomQuoteDecimals(e.target.value)}
                  className="w-20"
                />
              </div>
            )}

            <Input
              type="number"
              min={0}
              step="0.000001"
              placeholder="Amount, e.g. 2.5"
              value={quoteAmount}
              onChange={(e) => setQuoteAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Initial price</Label>
          <div className="rounded-xl border border-border bg-background/40 p-3 text-right font-mono text-sm text-muted">
            {startingPrice
              ? `1 base = ${startingPrice} quote`
              : "Enter both amounts above"}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Fee tier</Label>
          {loadingFeeTiers ? (
            <p className="text-xs text-muted">Loading fee tiers from Raydium...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {feeTiers.map((tier) => (
                <button
                  key={tier.id}
                  onClick={() => setSelectedFeeTierId(tier.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm",
                    selectedFeeTierId === tier.id
                      ? "border-tide bg-tide/10 text-tide"
                      : "border-border text-muted"
                  )}
                >
                  {formatFeeTierPercent(tier.tradeFeeRate)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Start time</Label>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-1">
            <button
              onClick={() => setStartMode("now")}
              className={cn(
                "rounded-lg py-2 text-sm font-medium",
                startMode === "now" ? "bg-tide-gradient text-background" : "text-muted"
              )}
            >
              Start Now
            </button>
            <button
              onClick={() => setStartMode("custom")}
              className={cn(
                "rounded-lg py-2 text-sm font-medium",
                startMode === "custom" ? "bg-tide-gradient text-background" : "text-muted"
              )}
            >
              Custom
            </button>
          </div>
          {startMode === "custom" && (
            <Input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          )}
        </div>

        <p className="rounded-lg bg-tide/5 p-3 text-xs text-muted">
          Note: a creation fee of roughly 0.2 SOL (Raydium-side rent, separate
          from this site) is required for new pools. Review the amounts
          carefully - once confirmed on-chain, the pool is public and
          permanent.
        </p>

        <Button
          size="lg"
          variant="gradient"
          className="w-full"
          disabled={loading || !wallet.connected}
          onClick={handleCreatePool}
        >
          {!wallet.connected
            ? "Connect wallet to continue"
            : loading
            ? "Initializing pool..."
            : "Initialize Liquidity Pool"}
        </Button>
      </CardContent>
    </Card>
  );
}
