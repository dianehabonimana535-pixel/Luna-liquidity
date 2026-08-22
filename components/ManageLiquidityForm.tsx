"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { PublicKey } from "@solana/web3.js";
import { Waves, Plus, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { addLiquidity, withdrawLiquidity } from "@/lib/raydium";
import { cn } from "@/lib/utils";

type Mode = "add" | "withdraw";

export default function ManageLiquidityForm() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [mode, setMode] = useState<Mode>("add");
  const [poolId, setPoolId] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [withdrawPercent, setWithdrawPercent] = useState(50);
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);

  function validatePoolId(): string | null {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(poolId.trim());
      return null;
    } catch {
      return "Enter a valid pool ID";
    }
  }

  async function handleSubmit() {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error("Connect your wallet first");
      return;
    }
    const poolError = validatePoolId();
    if (poolError) {
      toast.error(poolError);
      return;
    }
    if (mode === "add" && (!Number(baseAmount) || Number(baseAmount) <= 0)) {
      toast.error("Enter the amount you want to deposit");
      return;
    }

    setLoading(true);
    setSignature(null);
    try {
      if (mode === "add") {
        const res = await addLiquidity({
          wallet,
          connection,
          poolId: poolId.trim(),
          baseAmount: Number(baseAmount),
        });
        setSignature(res.signature);
        toast.success("Liquidity added");
      } else {
        const res = await withdrawLiquidity({
          wallet,
          connection,
          poolId: poolId.trim(),
          percentToWithdraw: withdrawPercent,
        });
        setSignature(res.signature);
        toast.success("Liquidity withdrawn");
      }
    } catch (err: any) {
      console.error(err);
      const rejected =
        typeof err?.message === "string" && /reject|declin|cancel/i.test(err.message);
      toast.error(
        rejected ? "Transaction was cancelled in your wallet." : err?.message || "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves className="h-5 w-5 text-tide" /> Manage Liquidity
        </CardTitle>
        <CardDescription>
          Add more liquidity to an existing Raydium pool, or withdraw part of
          your position back to your wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-1">
          <button
            onClick={() => setMode("add")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
              mode === "add" ? "bg-tide-gradient text-background" : "text-muted"
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
          <button
            onClick={() => setMode("withdraw")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors",
              mode === "withdraw" ? "bg-tide-gradient text-background" : "text-muted"
            )}
          >
            <Minus className="h-3.5 w-3.5" /> Withdraw
          </button>
        </div>

        <div className="space-y-1.5">
          <Label>Pool ID</Label>
          <Input
            placeholder="The pool's address"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
          />
        </div>

        {mode === "add" ? (
          <div className="space-y-1.5">
            <Label>Amount of token to deposit</Label>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 10000"
              value={baseAmount}
              onChange={(e) => setBaseAmount(e.target.value)}
            />
            <p className="text-xs text-muted">
              Raydium automatically matches the corresponding SOL amount
              based on the pool&apos;s current price.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Percent of your position to withdraw</Label>
              <span className="font-mono text-sm font-semibold text-tide">
                {withdrawPercent}%
              </span>
            </div>
            {/* Tide gauge slider: replaces a generic range input look, in
                keeping with the moon/tide visual metaphor for this app. */}
            <input
              type="range"
              min={1}
              max={100}
              value={withdrawPercent}
              onChange={(e) => setWithdrawPercent(Number(e.target.value))}
              className="w-full accent-tide"
            />
            <div className="tide-gauge">
              <div
                className="tide-gauge-fill"
                style={{ width: `${withdrawPercent}%` }}
              />
            </div>
          </div>
        )}

        <Button
          size="lg"
          variant="gradient"
          className="w-full"
          disabled={loading || !wallet.connected}
          onClick={handleSubmit}
        >
          {!wallet.connected
            ? "Connect wallet to continue"
            : loading
            ? mode === "add"
              ? "Adding liquidity..."
              : "Withdrawing..."
            : mode === "add"
            ? "Add liquidity"
            : "Withdraw liquidity"}
        </Button>

        {signature && (
          <div className="rounded-xl border border-border bg-background/40 p-3 text-center text-xs text-muted">
            Transaction confirmed: <span className="font-mono text-tide">{signature.slice(0, 12)}...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
