import { Connection, clusterApiUrl } from "@solana/web3.js";

export const SOLANA_NETWORK = "mainnet-beta";
export const NETWORK_LABEL = "Mainnet";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL && process.env.NEXT_PUBLIC_SOLANA_RPC_URL.length > 0
    ? process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    : clusterApiUrl(SOLANA_NETWORK);

export function getConnection(): Connection {
  return new Connection(RPC_ENDPOINT, "confirmed");
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}`;
}

export function solscanAddressUrl(address: string): string {
  return `https://solscan.io/token/${address}`;
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export const SITE_URL = "https://luna-liquidity.vercel.app";
