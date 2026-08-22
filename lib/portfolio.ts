"use client";

// ---------------------------------------------------------------------------
// Lightweight, wallet-scoped position ledger, stored in the browser's
// localStorage. This app has no backend/database, so this is what powers
// the "Token Lives" (open positions) and "History" (closed positions)
// sections of the Portfolio page for pools created/managed through this
// app on this device.
//
// Important limitation: this only tracks activity that happened through
// this app, in this browser. It is not a full on-chain indexer - if you
// add/remove liquidity from a different device or a different app, it
// won't show up here. Values are expressed in "quote token" units (e.g.
// SOL), not real USD, since there's no reliable price feed for arbitrary
// devnet tokens.
// ---------------------------------------------------------------------------

export interface PortfolioPosition {
  poolId: string;
  baseSymbol: string;
  quoteSymbol: string;
  /** Total ever deposited into this position, in quote-token units. */
  initialQuoteValue: number;
  /** Total ever withdrawn from this position so far, in quote-token units. */
  removedQuoteValue: number;
  /** 0-100. Reaches 0 once the position has been fully withdrawn. */
  remainingPercent: number;
  openedAt: number; // epoch ms
  closedAt: number | null;
}

function storageKey(walletAddress: string) {
  return `luna-liquidity:portfolio:${walletAddress}`;
}

export function loadPortfolio(walletAddress: string): PortfolioPosition[] {
  if (typeof window === "undefined" || !walletAddress) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(walletAddress));
    return raw ? (JSON.parse(raw) as PortfolioPosition[]) : [];
  } catch {
    return [];
  }
}

function savePortfolio(walletAddress: string, positions: PortfolioPosition[]) {
  if (typeof window === "undefined" || !walletAddress) return;
  try {
    window.localStorage.setItem(storageKey(walletAddress), JSON.stringify(positions));
  } catch {
    // Storage full or unavailable (e.g. private browsing) - fail silently,
    // on-chain funds are never affected by this.
  }
}

/** Call this right after a new pool is successfully created. */
export function recordPoolCreated(
  walletAddress: string,
  args: { poolId: string; baseSymbol: string; quoteSymbol: string; quoteAmount: number }
) {
  const positions = loadPortfolio(walletAddress);
  positions.unshift({
    poolId: args.poolId,
    baseSymbol: args.baseSymbol,
    quoteSymbol: args.quoteSymbol,
    initialQuoteValue: args.quoteAmount,
    removedQuoteValue: 0,
    remainingPercent: 100,
    openedAt: Date.now(),
    closedAt: null,
  });
  savePortfolio(walletAddress, positions);
}

/** Call this right after successfully adding liquidity to a pool. */
export function recordLiquidityAdded(
  walletAddress: string,
  args: {
    poolId: string;
    addedQuoteValue: number;
    baseSymbol: string;
    quoteSymbol: string;
  }
) {
  const positions = loadPortfolio(walletAddress);
  const existing = positions.find((p) => p.poolId === args.poolId && p.remainingPercent > 0);
  if (existing) {
    existing.initialQuoteValue += args.addedQuoteValue;
  } else {
    // Not a position we were already tracking (e.g. a pool found elsewhere)
    // - start tracking it from this deposit onward.
    positions.unshift({
      poolId: args.poolId,
      baseSymbol: args.baseSymbol,
      quoteSymbol: args.quoteSymbol,
      initialQuoteValue: args.addedQuoteValue,
      removedQuoteValue: 0,
      remainingPercent: 100,
      openedAt: Date.now(),
      closedAt: null,
    });
  }
  savePortfolio(walletAddress, positions);
}

/** Call this right after successfully withdrawing liquidity from a pool. */
export function recordLiquidityRemoved(
  walletAddress: string,
  args: { poolId: string; percentWithdrawn: number; receivedQuoteValue: number }
) {
  const positions = loadPortfolio(walletAddress);
  const existing = positions.find((p) => p.poolId === args.poolId && p.remainingPercent > 0);
  if (!existing) return;

  existing.removedQuoteValue += args.receivedQuoteValue;
  existing.remainingPercent = Math.max(
    0,
    existing.remainingPercent - (existing.remainingPercent * args.percentWithdrawn) / 100
  );
  if (existing.remainingPercent <= 0.01) {
    existing.remainingPercent = 0;
    existing.closedAt = Date.now();
  }
  savePortfolio(walletAddress, positions);
}

/** Positions that still have an open (non-zero) share. */
export function getOpenPositions(walletAddress: string): PortfolioPosition[] {
  return loadPortfolio(walletAddress).filter((p) => p.remainingPercent > 0);
}

/** Fully withdrawn positions, most recently closed first. */
export function getHistory(walletAddress: string): PortfolioPosition[] {
  return loadPortfolio(walletAddress)
    .filter((p) => p.remainingPercent === 0)
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
}
