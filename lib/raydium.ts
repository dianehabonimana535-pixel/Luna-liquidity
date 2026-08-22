import { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Raydium,
  TxVersion,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  Percent,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";

// Native SOL "mint" address, offered as one of the quote token presets.
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function loadRaydium(wallet: WalletContextState, connection: Connection) {
  if (!wallet.publicKey || !wallet.signAllTransactions) {
    throw new Error("Wallet not connected");
  }
  return Raydium.load({
    connection,
    owner: wallet.publicKey,
    signAllTransactions: wallet.signAllTransactions,
  });
}

// ---------------------------------------------------------------------------
// Fee tiers - fetched live from Raydium's API, matching what raydium.io shows
// on its own "Create Pool" screen.
// ---------------------------------------------------------------------------

export interface FeeTierOption {
  id: string;
  index: number;
  tradeFeeRate: number; // e.g. 2500 = 0.25% (rate is in basis points of 1e6)
  createPoolFee: string; // lamports, as a string
}

export async function fetchFeeTiers(
  wallet: WalletContextState,
  connection: Connection
): Promise<FeeTierOption[]> {
  const raydium = await loadRaydium(wallet, connection);
  const configs = await raydium.api.getCpmmConfigs();
  return configs.map((c) => ({
    id: c.id,
    index: c.index,
    tradeFeeRate: c.tradeFeeRate,
    createPoolFee: c.createPoolFee,
  }));
}

export function formatFeeTierPercent(tradeFeeRate: number): string {
  // tradeFeeRate is expressed out of 1_000_000 (e.g. 2500 -> 0.25%)
  return `${(tradeFeeRate / 10000).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Create a new pool
// ---------------------------------------------------------------------------

export interface CreatePoolParams {
  wallet: WalletContextState;
  connection: Connection;
  baseMintAddress: string;
  baseDecimals: number;
  baseAmount: number;
  quoteMintAddress: string;
  quoteDecimals: number;
  quoteAmount: number;
  feeTierId: string;
  /** null = start immediately. A Date = schedule the pool to open then. */
  startTime: Date | null;
}

export interface CreatePoolResult {
  poolId: string;
  signature: string;
}

/**
 * Creates a real, public Raydium CPMM pool for any two tokens (defaults to
 * a project token against SOL, but either side can be any SPL mint). This
 * uses Raydium's own on-chain program -- the resulting pool is identical to
 * one created on raydium.io directly, and will appear there, on Jupiter,
 * DEX Screener, etc.
 */
export async function createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
  const {
    wallet,
    connection,
    baseMintAddress,
    baseDecimals,
    baseAmount,
    quoteMintAddress,
    quoteDecimals,
    quoteAmount,
    feeTierId,
    startTime,
  } = params;

  const raydium = await loadRaydium(wallet, connection);

  const feeConfigs = await raydium.api.getCpmmConfigs();
  const feeConfig = feeConfigs.find((c) => c.id === feeTierId) ?? feeConfigs[0];
  if (!feeConfig) {
    throw new Error("Could not load Raydium fee configuration. Please try again.");
  }

  const mintA = {
    address: baseMintAddress,
    decimals: baseDecimals,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  };
  const mintB = {
    address: quoteMintAddress,
    decimals: quoteDecimals,
    programId: TOKEN_PROGRAM_ID.toBase58(),
  };

  const mintAAmount = new BN(Math.round(baseAmount * 10 ** baseDecimals).toString());
  const mintBAmount = new BN(Math.round(quoteAmount * 10 ** quoteDecimals).toString());

  const startTimeBN = startTime
    ? new BN(Math.floor(startTime.getTime() / 1000).toString())
    : new BN(0);

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount,
    mintBAmount,
    startTime: startTimeBN,
    feeConfig,
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });

  return {
    poolId: extInfo.address.poolId.toBase58(),
    signature: txId,
  };
}

// ---------------------------------------------------------------------------
// Add liquidity to an existing pool
// ---------------------------------------------------------------------------

export interface AddLiquidityParams {
  wallet: WalletContextState;
  connection: Connection;
  poolId: string;
  /** Amount of the pool's base token (mintA) to deposit, in human units. */
  baseAmount: number;
  /** Slippage tolerance as a percent, e.g. 1 for 1%. Defaults to 1%. */
  slippagePercent?: number;
}

export interface AddLiquidityResult {
  signature: string;
}

/**
 * Deposits more liquidity into an existing Raydium CPMM pool. Raydium
 * automatically computes the matching amount of the other side of the
 * pool based on the current on-chain ratio.
 */
export async function addLiquidity(params: AddLiquidityParams): Promise<AddLiquidityResult> {
  const { wallet, connection, poolId, baseAmount, slippagePercent = 1 } = params;

  const raydium = await loadRaydium(wallet, connection);
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(poolId);

  const inputAmount = new BN(
    Math.round(baseAmount * 10 ** poolInfo.mintA.decimals).toString()
  );

  const { execute } = await raydium.cpmm.addLiquidity({
    poolInfo,
    poolKeys,
    inputAmount,
    baseIn: true,
    slippage: new Percent(Math.round(slippagePercent * 100), 10000),
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  return { signature: txId };
}

// ---------------------------------------------------------------------------
// Withdraw (remove) liquidity from an existing pool
// ---------------------------------------------------------------------------

export interface WithdrawLiquidityParams {
  wallet: WalletContextState;
  connection: Connection;
  poolId: string;
  /** Percentage of your LP position to withdraw, from 1 to 100. */
  percentToWithdraw: number;
  slippagePercent?: number;
}

export interface WithdrawLiquidityResult {
  signature: string;
}

/**
 * Withdraws a percentage of the caller's LP tokens from a Raydium CPMM
 * pool, returning the underlying token + SOL to their wallet.
 */
export async function withdrawLiquidity(
  params: WithdrawLiquidityParams
): Promise<WithdrawLiquidityResult> {
  const { wallet, connection, poolId, percentToWithdraw, slippagePercent = 1 } = params;

  if (percentToWithdraw <= 0 || percentToWithdraw > 100) {
    throw new Error("percentToWithdraw must be between 1 and 100");
  }
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const raydium = await loadRaydium(wallet, connection);
  const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId);

  // Look up the caller's LP token balance for this pool to compute the
  // exact amount corresponding to the requested percentage.
  const lpMint = poolInfo.lpMint.address;
  const { tokenAccounts } = await raydium.account.fetchWalletTokenAccounts();
  const lpAccount = tokenAccounts.find((acc) => acc.mint.toBase58() === lpMint);

  if (!lpAccount || lpAccount.amount.isZero()) {
    throw new Error("No LP tokens found for this pool in your wallet.");
  }

  const lpAmount = lpAccount.amount
    .mul(new BN(Math.round(percentToWithdraw * 100)))
    .div(new BN(10000));

  const { execute } = await raydium.cpmm.withdrawLiquidity({
    poolInfo,
    poolKeys,
    lpAmount,
    slippage: new Percent(Math.round(slippagePercent * 100), 10000),
    txVersion: TxVersion.V0,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  return { signature: txId };
}
