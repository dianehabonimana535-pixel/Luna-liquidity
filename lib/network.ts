import { Connection, clusterApiUrl } from "@solana/web3.js";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL && process.env.NEXT_PUBLIC_SOLANA_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    : clusterApiUrl("mainnet-beta");

/**
 * Which cluster this deployment actually talks to. Prefer an explicit
 * NEXT_PUBLIC_SOLANA_CLUSTER=devnet|mainnet env var; otherwise fall back to
 * sniffing the RPC URL itself (works for api.devnet.solana.com,
 * *.devnet.*, Helius/QuickNode/etc URLs that include "devnet").
 *
 * This matters a lot: Raydium's on-chain CPMM program has a DIFFERENT
 * address on devnet than on mainnet, and the Raydium API also has a
 * separate devnet host. Getting this wrong means every transaction fails
 * before it's even sent (wrong program = simulation failure, no fee
 * charged) - see lib/raydium.ts.
 */
export const SOLANA_CLUSTER: "mainnet" | "devnet" =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "devnet" ||
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet"
    ? process.env.NEXT_PUBLIC_SOLANA_CLUSTER
    : RPC_ENDPOINT.toLowerCase().includes("devnet")
    ? "devnet"
    : "mainnet";

export const SOLANA_NETWORK = SOLANA_CLUSTER === "devnet" ? "devnet" : "mainnet-beta";
export const NETWORK_LABEL = SOLANA_CLUSTER === "devnet" ? "Devnet" : "Mainnet";

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

/** Appends ?cluster=devnet to explorer/solscan links when needed, so the
 * links actually resolve to the network this app is really using. */
function withCluster(url: string): string {
  return SOLANA_CLUSTER === "devnet" ? `${url}?cluster=devnet` : url;
}

export function explorerAddressUrl(address: string): string {
  return withCluster(`https://explorer.solana.com/address/${address}`);
}

export function explorerTxUrl(signature: string): string {
  return withCluster(`https://explorer.solana.com/tx/${signature}`);
}

export function solscanAddressUrl(address: string): string {
  return withCluster(`https://solscan.io/account/${address}`);
}

export function solscanTxUrl(signature: string): string {
  return withCluster(`https://solscan.io/tx/${signature}`);
}

/** Dexscreener has no separate devnet site - this link only resolves for
 * pools that are actually live on mainnet. */
export function dexscreenerPoolUrl(poolId: string): string {
  return `https://dexscreener.com/solana/${poolId}`;
}

export const SITE_URL = "https://luna-liquidity.vercel.app";
