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
  fetchTokenImage,
  fetchTokenMetadata,
  formatFeeTierPercent,
  getTokenBalance,
  NATIVE_SOL_MINT,
  USDC_MINT,
  type FeeTierOption,
} from "@/lib/raydium";
import { solscanAddressUrl } from "@/lib/network";
import { recordPoolCreated } from "@/lib/portfolio";
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
  const [baseSymbol, setBaseSymbol] = useState("");
  const [baseDecimals, setBaseDecimals] = useState("9");
  const [baseAmount, setBaseAmount] = useState("");
  const [baseBalance, setBaseBalance] = useState(0);
  const [symbolEditedManually, setSymbolEditedManually] = useState(false);
  const [decimalsEditedManually, setDecimalsEditedManually] = useState(false);
  const [detectingToken, setDetectingToken] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<{
    name: string;
    image: string | null;
  } | null>(null);

  const [quotePreset, setQuotePreset] = useState<QuotePreset>("SOL");
  const [customQuoteMint, setCustomQuoteMint] = useState("");
  const [customQuoteDecimals, setCustomQuoteDecimals] = useState("6");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteBalance, setQuoteBalance] = useState(0);

  const [initialPrice, setInitialPrice] = useState("");
  const [priceEditedManually, setPriceEditedManually] = useState(false);

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
  const quoteSymbol =
    quotePreset === "custom"
      ? "Token"
      : QUOTE_PRESETS.find((p) => p.key === quotePreset)?.label ?? "";

  // Pull wallet balances so the "Max" / "50%" quick-fill buttons work.
  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) return;
    try {
      // eslint-disable-next-line no-new
      new PublicKey(baseMint.trim());
    } catch {
      setBaseBalance(0);
      return;
    }
    getTokenBalance(connection, wallet.publicKey, baseMint.trim(), Number(baseDecimals) || 0)
      .then(setBaseBalance)
      .catch(() => setBaseBalance(0));
  }, [wallet.connected, wallet.publicKey, baseMint, baseDecimals, connection]);

  // Auto-detect the base token's symbol (and decimals) from its mint
  // address, using on-chain Metaplex metadata. Only fills fields the user
  // hasn't edited by hand, and is debounced so it doesn't fire on every
  // keystroke while typing/pasting the address.
  useEffect(() => {
    const trimmed = baseMint.trim();
    if (!trimmed) {
      setTokenPreview(null);
      return;
    }
    try {
      // eslint-disable-next-line no-new
      new PublicKey(trimmed);
    } catch {
      setTokenPreview(null);
      return;
    }

    const timeout = setTimeout(() => {
      setDetectingToken(true);
      fetchTokenMetadata(connection, trimmed)
        .then(async (info) => {
          if (!info) {
            setTokenPreview(null);
            return;
          }
          if (!symbolEditedManually) {
            setBaseSymbol(info.symbol || info.name || "");
          }
          if (!decimalsEditedManually) {
            setBaseDecimals(String(info.decimals));
          }
          // Show the name immediately; resolve the logo (which needs a
          // second, off-chain fetch) once it's ready.
          setTokenPreview({ name: info.name || info.symbol, image: null });
          if (info.uri) {
            const image = await fetchTokenImage(info.uri);
            setTokenPreview({ name: info.name || info.symbol, image });
          }
        })
        .catch(() => setTokenPreview(null))
        .finally(() => setDetectingToken(false));
    }, 500);

    return () => clearTimeout(timeout);
  }, [baseMint, connection, symbolEditedManually, decimalsEditedManually]);

  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey || !quoteMint) return;
    try {
      // eslint-disable-next-line no-new
      new PublicKey(quoteMint);
    } catch {
      setQuoteBalance(0);
      return;
    }
    getTokenBalance(connection, wallet.publicKey, quoteMint, quoteDecimals || 0)
      .then(setQuoteBalance)
      .catch(() => setQuoteBalance(0));
  }, [wallet.connected, wallet.publicKey, quoteMint, quoteDecimals, connection]);

  // Keep "Initial price" in sync with the two amounts, unless the user is
  // typing directly into the price field.
  useEffect(() => {
    if (priceEditedManually) return;
    const b = Number(baseAmount);
    const q = Number(quoteAmount);
    if (b > 0 && q > 0) {
      setInitialPrice((q / b).toPrecision(6));
    }
  }, [baseAmount, quoteAmount, priceEditedManually]);

  function handlePriceChange(value: string) {
    setInitialPrice(value);
    setPriceEditedManually(true);
    const price = Number(value);
    const b = Number(baseAmount);
    if (price > 0 && b > 0) {
      setQuoteAmount((price * b).toString());
    }
  }

  function fillBaseAmount(fraction: number) {
    if (baseBalance <= 0) return;
    setBaseAmount((baseBalance * fraction).toString());
  }

  function fillQuoteAmount(fraction: number) {
    if (quoteBalance <= 0) return;
    setPriceEditedManually(false);
    setQuoteAmount((quoteBalance * fraction).toString());
  }

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
      if (wallet.publicKey) {
        recordPoolCreated(wallet.publicKey.toBase58(), {
          poolId: poolResult.poolId,
          baseSymbol: baseSymbol || "Base",
          quoteSymbol: quoteSymbol || "Quote",
          quoteAmount: Number(quoteAmount),
        });
      }
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
      <CardContent className="space-y-4">
        <p className="text-sm font-medium text-foreground">Initial liquidity</p>

        {/* Base token */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Base token</span>
            <span className="flex items-center gap-2">
              <span>{baseBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
              <button
                onClick={() => fillBaseAmount(1)}
                className="rounded-md bg-card px-1.5 py-0.5 font-medium text-muted hover:text-tide"
              >
                Max
              </button>
              <button
                onClick={() => fillBaseAmount(0.5)}
                className="rounded-md bg-card px-1.5 py-0.5 font-medium text-muted hover:text-tide"
              >
                50%
              </button>
            </span>
          </div>
          <div className="divide-y divide-border/50 rounded-xl border border-border bg-background/40 p-3">
            {/* Symbol + decimals */}
            <div className="pb-2.5">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-tide">
                Token
              </span>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tide-gradient text-xs font-bold text-background">
                  {tokenPreview?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tokenPreview.image}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() =>
                        setTokenPreview((prev) => (prev ? { ...prev, image: null } : prev))
                      }
                    />
                  ) : (
                    (baseSymbol || "?").slice(0, 1).toUpperCase()
                  )}
                </div>
                <Input
                  placeholder={detectingToken ? "Detecting..." : "Symbol (e.g. LUNA)"}
                  value={baseSymbol}
                  onChange={(e) => {
                    setBaseSymbol(e.target.value);
                    setSymbolEditedManually(true);
                  }}
                  className="w-32 border-none bg-transparent px-0 text-base font-semibold text-foreground focus-visible:ring-0"
                />
                <Input
                  type="number"
                  min={0}
                  max={9}
                  title="Decimals"
                  value={baseDecimals}
                  onChange={(e) => {
                    setBaseDecimals(e.target.value);
                    setDecimalsEditedManually(true);
                  }}
                  className="ml-auto w-16 text-right text-xs text-muted"
                />
              </div>
            </div>

            {/* Contract address */}
            <div className="py-2.5">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-violet-400">
                Contract address
              </span>
              <Input
                placeholder="Your token's mint address"
                value={baseMint}
                onChange={(e) => {
                  setBaseMint(e.target.value);
                  setSymbolEditedManually(false);
                  setDecimalsEditedManually(false);
                }}
                className="border-none bg-transparent px-0 font-mono text-xs text-slate-300 focus-visible:ring-0"
              />
            </div>

            {/* Detected token name */}
            {tokenPreview?.name && (
              <div className="py-2.5">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                  Token name
                </span>
                <p className="truncate text-sm text-foreground">{tokenPreview.name}</p>
              </div>
            )}

            {/* Amount */}
            <div className="pt-2.5">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                Amount to deposit
              </span>
              <Input
                type="number"
                min={0}
                placeholder="Amount, e.g. 500000"
                value={baseAmount}
                onChange={(e) => {
                  setBaseAmount(e.target.value);
                  setPriceEditedManually(false);
                }}
                className="border-none bg-transparent px-0 text-right text-lg font-semibold text-foreground focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-tide-gradient">
            <Plus className="h-4 w-4 text-background" />
          </div>
        </div>

        {/* Quote token */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Quote token</span>
            <span className="flex items-center gap-2">
              <span>{quoteBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
              <button
                onClick={() => fillQuoteAmount(1)}
                className="rounded-md bg-card px-1.5 py-0.5 font-medium text-muted hover:text-tide"
              >
                Max
              </button>
              <button
                onClick={() => fillQuoteAmount(0.5)}
                className="rounded-md bg-card px-1.5 py-0.5 font-medium text-muted hover:text-tide"
              >
                50%
              </button>
            </span>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 flex gap-2">
              {QUOTE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setQuotePreset(p.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium",
                    quotePreset === p.key
                      ? "border-tide bg-tide/10 text-tide"
                      : "border-border text-muted"
                  )}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-card text-[9px]">
                    {p.label.slice(0, 1)}
                  </span>
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
              onChange={(e) => {
                setQuoteAmount(e.target.value);
                setPriceEditedManually(false);
              }}
              className="border-none bg-transparent px-0 text-right text-lg font-semibold focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Initial price */}
        <div className="space-y-1.5">
          <Label>Initial price</Label>
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <Input
              type="number"
              min={0}
              placeholder={`${quoteSymbol || "quote"}/${baseSymbol || "base"}`}
              value={initialPrice}
              onChange={(e) => handlePriceChange(e.target.value)}
              className="border-none bg-transparent px-0 text-right font-mono focus-visible:ring-0"
            />
          </div>
          {startingPrice && (
            <p className="text-xs text-muted">
              Current price:{" "}
              <span className="font-medium text-tide">
                1 {baseSymbol || "base"} ≈ {startingPrice} {quoteSymbol || "quote"}
              </span>
            </p>
          )}
        </div>

        {/* Fee tier */}
        <div className="space-y-1.5">
          <Label>Fee tier</Label>
          {loadingFeeTiers ? (
            <p className="text-xs text-muted">Loading fee tiers from Raydium...</p>
          ) : (
            <select
              value={selectedFeeTierId}
              onChange={(e) => setSelectedFeeTierId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background/40 p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-tide"
            >
              {feeTiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {formatFeeTierPercent(tier.tradeFeeRate)}
                </option>
              ))}
            </select>
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
