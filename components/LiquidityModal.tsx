"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addLiquidity,
  getPoolSnapshot,
  withdrawLiquidity,
  type PoolSnapshot,
} from "@/lib/raydium";
import { recordLiquidityAdded, recordLiquidityRemoved } from "@/lib/portfolio";

interface LiquidityModalProps {
  poolId: string;
  mode: "add" | "withdraw";
  onClose: () => void;
  /** Called after a successful add/withdraw so the parent can refresh. */
  onSuccess: () => void;
}

export default function LiquidityModal({ poolId, mode, onClose, onSuccess }: LiquidityModalProps) {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);

  // Withdraw mode: percent of the position to remove (0-100).
  const [percent, setPercent] = useState(50);
  // Add mode: amount of the base token to deposit.
  const [depositAmount, setDepositAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!wallet.publicKey) return;
    setLoadingSnapshot(true);
    getPoolSnapshot(wallet, connection, poolId)
      .then((snap) => {
        if (!cancelled) setSnapshot(snap);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Could not load this pool's live data.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSnapshot(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId, wallet.publicKey]);

  // --- Withdraw preview: assets to be received for the selected % ---
  const lpSupplyNum = snapshot ? Number(snapshot.lpSupply.toString()) : 0;
  const userLpNum = snapshot ? Number(snapshot.userLpAmount.toString()) : 0;
  const userShare = lpSupplyNum > 0 ? userLpNum / lpSupplyNum : 0;
  const shareToWithdraw = userShare * (percent / 100);
  const baseToReceive = snapshot ? shareToWithdraw * snapshot.baseReserve : 0;
  const quoteToReceive = snapshot ? shareToWithdraw * snapshot.quoteReserve : 0;

  // --- Add preview: matching quote amount for the entered base amount ---
  const price =
    snapshot && snapshot.baseReserve > 0 ? snapshot.quoteReserve / snapshot.baseReserve : 0;
  const matchingQuoteAmount = Number(depositAmount || 0) * price;

  async function handleConfirm() {
    if (!wallet.connected || !wallet.publicKey) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!snapshot) return;

    setSubmitting(true);
    try {
      if (mode === "withdraw") {
        if (percent <= 0) {
          toast.error("Choose a percentage greater than 0");
          return;
        }
        await withdrawLiquidity({
          wallet,
          connection,
          poolId,
          percentToWithdraw: percent,
        });
        recordLiquidityRemoved(wallet.publicKey.toBase58(), {
          poolId,
          percentWithdrawn: percent,
          receivedQuoteValue: quoteToReceive + baseToReceive * price,
        });
        toast.success("Liquidity withdrawn");
      } else {
        const amount = Number(depositAmount);
        if (!amount || amount <= 0) {
          toast.error("Enter an amount to deposit");
          return;
        }
        await addLiquidity({
          wallet,
          connection,
          poolId,
          baseAmount: amount,
        });
        recordLiquidityAdded(wallet.publicKey.toBase58(), {
          poolId,
          addedQuoteValue: amount * price + matchingQuoteAmount,
          baseSymbol: snapshot.baseSymbol,
          quoteSymbol: snapshot.quoteSymbol,
        });
        toast.success("Liquidity added");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      const rejected =
        typeof err?.message === "string" && /reject|declin|cancel/i.test(err.message);
      toast.error(
        rejected ? "Transaction was cancelled in your wallet." : err?.message || "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-tide-gradient text-[10px] font-bold text-background">
              {(snapshot?.quoteSymbol || "?").slice(0, 1)}
            </div>
            <div className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-moonlight text-[10px] font-bold text-background">
              {(snapshot?.baseSymbol || "?").slice(0, 1)}
            </div>
            <span className="font-semibold text-foreground">
              {snapshot ? `${snapshot.quoteSymbol}/${snapshot.baseSymbol}` : "Loading..."}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingSnapshot ? (
          <p className="py-8 text-center text-sm text-muted">Loading pool data...</p>
        ) : mode === "withdraw" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Amount</span>
              <span className="font-mono text-sm font-semibold text-tide">{percent}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="w-full accent-tide"
            />

            <div>
              <p className="mb-1.5 text-sm text-muted">Assets to be received:</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-moonlight text-[9px] font-bold text-background">
                  {(snapshot?.baseSymbol || "?").slice(0, 1)}
                </div>
                <span>
                  {baseToReceive.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                  {snapshot?.baseSymbol} /{" "}
                  {quoteToReceive.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                  {snapshot?.quoteSymbol}
                </span>
              </div>
            </div>

            <Button
              size="lg"
              variant="gradient"
              className="w-full"
              disabled={submitting}
              onClick={handleConfirm}
            >
              {submitting ? "Withdrawing..." : "Okay"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm text-muted">Amount of {snapshot?.baseSymbol} to deposit</p>
              <input
                type="number"
                min={0}
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-background/40 p-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-tide"
              />
            </div>

            <div>
              <p className="mb-1.5 text-sm text-muted">You will also deposit (auto-matched):</p>
              <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
                {matchingQuoteAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                {snapshot?.quoteSymbol}
              </div>
            </div>

            <Button
              size="lg"
              variant="gradient"
              className="w-full"
              disabled={submitting}
              onClick={handleConfirm}
            >
              {submitting ? "Depositing..." : "Okay"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
