"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { Minus, Plus, RefreshCw, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPoolSnapshot } from "@/lib/raydium";
import { getHistory, getOpenPositions, type PortfolioPosition } from "@/lib/portfolio";
import LiquidityModal from "@/components/LiquidityModal";

const PAGE_SIZE = 5;

interface LivePosition extends PortfolioPosition {
  /** Current value in quote-token units, refreshed from live pool data. */
  currentQuoteValue: number | null;
}

export default function PortfolioView() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [history, setHistory] = useState<PortfolioPosition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const [modal, setModal] = useState<{ poolId: string; mode: "add" | "withdraw" } | null>(null);

  const loadLedger = useCallback(() => {
    if (!wallet.publicKey) return;
    const address = wallet.publicKey.toBase58();
    setPositions(getOpenPositions(address).map((p) => ({ ...p, currentQuoteValue: null })));
    setHistory(getHistory(address));
  }, [wallet.publicKey]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    if (!wallet.publicKey) {
      setWalletBalance(null);
      return;
    }
    connection
      .getBalance(wallet.publicKey)
      .then((lamports) => setWalletBalance(lamports / 1e9))
      .catch(() => setWalletBalance(null));
  }, [wallet.publicKey, connection]);

  const refreshPositions = useCallback(async () => {
    if (!wallet.publicKey || positions.length === 0) return;
    setRefreshing(true);
    try {
      const updated = await Promise.all(
        positions.map(async (p) => {
          try {
            const snap = await getPoolSnapshot(wallet, connection, p.poolId);
            return { ...p, currentQuoteValue: snap.userValueInQuote };
          } catch {
            return { ...p, currentQuoteValue: null };
          }
        })
      );
      setPositions(updated);
    } catch (err) {
      console.error(err);
      toast.error("Could not refresh live pool data.");
    } finally {
      setRefreshing(false);
    }
  }, [wallet, connection, positions]);

  // Fetch live SOL balance + wallet balance whenever the wallet connects.
  useEffect(() => {
    if (positions.length > 0) {
      refreshPositions();
    }
    // Only run once per position-list change (e.g. right after a new one is
    // loaded from storage), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  const historyPageCount = Math.max(1, Math.ceil(history.length / PAGE_SIZE));
  const pagedHistory = history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE);

  function fmt(n: number | null, digits = 4) {
    if (n === null) return "...";
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  if (!wallet.connected) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="py-12 text-center text-sm text-muted">
          Connect your wallet to see your portfolio.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Wallet balance */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Wallet className="h-4 w-4 text-tide" /> Wallet balance
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">
          {walletBalance === null ? "..." : `${walletBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`}
        </span>
      </div>

      {/* Token Lives */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Token Lives</CardTitle>
            <CardDescription>Your open liquidity positions.</CardDescription>
          </div>
          <button
            onClick={refreshPositions}
            disabled={refreshing || positions.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-tide disabled:opacity-40"
            title="Refresh profit/loss"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </CardHeader>
        <CardContent className="space-y-2">
          {positions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No open positions tracked yet on this device. Create a pool or add liquidity to see it here.
            </p>
          ) : (
            positions.map((p) => {
              const pnl =
                p.currentQuoteValue !== null ? p.currentQuoteValue - p.initialQuoteValue : null;
              return (
                <div
                  key={p.poolId}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-tide-gradient text-[10px] font-bold text-background">
                        {p.quoteSymbol.slice(0, 1)}
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-moonlight text-[10px] font-bold text-background">
                        {p.baseSymbol.slice(0, 1)}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {p.quoteSymbol} - {p.baseSymbol}
                      </p>
                      <p className="text-xs text-muted">
                        {fmt(p.currentQuoteValue, 6)} {p.quoteSymbol}
                        {pnl !== null && (
                          <span className={pnl >= 0 ? "ml-1.5 text-tide" : "ml-1.5 text-rose-400"}>
                            {pnl >= 0 ? "+" : ""}
                            {fmt(pnl, 6)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModal({ poolId: p.poolId, mode: "withdraw" })}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted hover:text-foreground"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setModal({ poolId: p.poolId, mode: "add" })}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Positions you've fully withdrawn.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No closed positions yet.</p>
          ) : (
            <>
              {pagedHistory.map((p) => {
                const profit = p.removedQuoteValue - p.initialQuoteValue;
                return (
                  <div
                    key={`${p.poolId}-${p.closedAt}`}
                    className="grid grid-cols-4 items-center gap-2 rounded-xl border border-border bg-background/40 p-3 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {p.quoteSymbol} - {p.baseSymbol}
                    </span>
                    <div>
                      <p className="text-[10px] uppercase text-muted">Initial</p>
                      <p>{fmt(p.initialQuoteValue, 4)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted">Removed</p>
                      <p>{fmt(p.removedQuoteValue, 4)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-muted">Profit</p>
                      <p className={profit >= 0 ? "text-tide" : "text-rose-400"}>
                        {profit >= 0 ? "+" : ""}
                        {fmt(profit, 4)}
                      </p>
                    </div>
                  </div>
                );
              })}

              {historyPageCount > 1 && (
                <div className="flex justify-center gap-1.5 pt-2 text-xs">
                  {Array.from({ length: historyPageCount }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setHistoryPage(page)}
                      className={`h-6 w-6 rounded-md ${
                        page === historyPage ? "bg-tide-gradient text-background" : "text-muted"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {modal && (
        <LiquidityModal
          poolId={modal.poolId}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSuccess={() => {
            loadLedger();
          }}
        />
      )}
    </div>
  );
}
