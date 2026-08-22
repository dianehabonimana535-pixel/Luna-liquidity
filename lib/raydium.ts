import { Connection, PublicKey } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Buffer } from "buffer";
import {
  Raydium,
  TxVersion,
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  Percent,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { SOLANA_CLUSTER } from "./network";

// Raydium's on-chain CPMM program (and its fee-collection account) has a
// DIFFERENT address on devnet than on mainnet - using the wrong one means
// every transaction fails during simulation, before anything is even sent
// to the network (so it looks like "nothing happens", not even fees).
// See: https://docs.raydium.io/reference/program-addresses
const CPMM_PROGRAM_ID =
  SOLANA_CLUSTER === "devnet" ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : CREATE_CPMM_POOL_PROGRAM;
const CPMM_FEE_ACC =
  SOLANA_CLUSTER === "devnet" ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC : CREATE_CPMM_POOL_FEE_ACC;

// Native SOL "mint" address, offered as one of the quote token presets.
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Metaplex Token Metadata program - used to auto-detect a token's symbol,
// name and decimals from just its mint address.
const METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

// Metaplex on-chain metadata stores name/symbol/uri as plain Borsh strings
// (4-byte little-endian length prefix + utf8 bytes). Any leftover
// null-byte padding after the real characters is stripped.
function readBorshString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const value = buf
    .slice(start, start + len)
    .toString("utf8")
    .replace(/\0/g, "")
    .trim();
  return [value, start + len];
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  uri: string;
}

/**
 * Looks up a token's decimals (from the mint account itself) and, if
 * present, its on-chain Metaplex name/symbol/uri - so the "Symbol" field
 * (and a preview) can be filled in automatically as soon as a valid mint
 * address is entered. Returns null if the mint address is invalid or
 * doesn't exist on-chain.
 */
export async function fetchTokenMetadata(
  connection: Connection,
  mintAddress: string
): Promise<TokenMetadata | null> {
  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(mintAddress);
  } catch {
    return null;
  }

  const [mintAccountInfo, metadataAccountInfo] = await Promise.all([
    connection.getParsedAccountInfo(mintPk),
    connection.getAccountInfo(findMetadataPda(mintPk)),
  ]);

  const parsedMint: any = mintAccountInfo.value?.data;
  const decimals = parsedMint?.parsed?.info?.decimals;
  if (decimals === undefined) {
    // Not a valid SPL mint account at all.
    return null;
  }

  let name = "";
  let symbol = "";
  let uri = "";
  if (metadataAccountInfo?.data) {
    try {
      const buf = Buffer.from(metadataAccountInfo.data);
      let offset = 1 + 32 + 32; // key (1) + update_authority (32) + mint (32)
      [name, offset] = readBorshString(buf, offset);
      [symbol, offset] = readBorshString(buf, offset);
      [uri, offset] = readBorshString(buf, offset);
    } catch {
      // Malformed/unexpected metadata layout - fall back to decimals only.
    }
  }

  return { name, symbol, decimals, uri };
}

// ---------------------------------------------------------------------------
// Off-chain metadata JSON (logo image) - resolved from the on-chain `uri`.
// ---------------------------------------------------------------------------

/** Turns ipfs:// and ar:// URIs into fetchable https gateway URLs. */
function resolveGatewayUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice("ar://".length)}`;
  }
  return uri;
}

/**
 * Fetches the off-chain metadata JSON pointed to by a token's on-chain
 * `uri` and returns its logo image URL (also gateway-resolved), if any.
 * Fails soft: any network/CORS/parse error just yields null so a missing
 * logo never blocks the rest of the form.
 */
export async function fetchTokenImage(uri: string): Promise<string | null> {
  if (!uri) return null;
  try {
    const res = await fetch(resolveGatewayUrl(uri));
    if (!res.ok) return null;
    const json = await res.json();
    const image = typeof json?.image === "string" ? json.image : null;
    return image ? resolveGatewayUrl(image) : null;
  } catch {
    return null;
  }
}

async function loadRaydium(wallet: WalletContextState, connection: Connection) {
  if (!wallet.publicKey || !wallet.signAllTransactions) {
    throw new Error("Wallet not connected");
  }
  return Raydium.load({
    connection,
    owner: wallet.publicKey,
    signAllTransactions: wallet.signAllTransactions,
    cluster: SOLANA_CLUSTER,
    // Route the SDK's own API calls (fee-tier configs, pool lookups, etc.)
    // to Raydium's devnet endpoints too - otherwise raydium.api.* calls
    // silently return mainnet data, e.g. fee-tier IDs that don't exist as
    // accounts on devnet, which also breaks pool creation there.
    ...(SOLANA_CLUSTER === "devnet"
      ? {
          urlConfigs: {
            BASE_HOST: "https://api-v3-devnet.raydium.io",
            OWNER_BASE_HOST: "https://owner-v1-devnet.raydium.io",
            SWAP_HOST: "https://transaction-v1-devnet.raydium.io",
          },
        }
      : {}),
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
// Wallet balance helper - powers the "Max" / "50%" quick-fill buttons.
// ---------------------------------------------------------------------------

/**
 * Returns the connected wallet's balance for a given mint, in human (UI)
 * units. Handles native SOL specially since it isn't an SPL token account.
 */
export async function getTokenBalance(
  connection: Connection,
  owner: PublicKey,
  mintAddress: string,
  decimals: number
): Promise<number> {
  try {
    if (mintAddress === NATIVE_SOL_MINT) {
      const lamports = await connection.getBalance(owner);
      return lamports / 1e9;
    }
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(mintAddress),
    });
    if (accounts.value.length === 0) return 0;
    const amount =
      accounts.value[0].account.data.parsed?.info?.tokenAmount?.uiAmount;
    return typeof amount === "number" ? amount : 0;
  } catch {
    return 0;
  }
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
    programId: CPMM_PROGRAM_ID,
    poolFeeAccount: CPMM_FEE_ACC,
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

// ---------------------------------------------------------------------------
// Pool snapshot - live reserves + the caller's position value, used by the
// Portfolio page (to show current value / profit-loss on refresh) and by
// the add/withdraw modal (to preview "assets to be received").
// ---------------------------------------------------------------------------

export interface PoolSnapshot {
  poolId: string;
  baseMint: string;
  baseSymbol: string;
  baseDecimals: number;
  quoteMint: string;
  quoteSymbol: string;
  quoteDecimals: number;
  /** Current pool reserves, in human (UI) units. */
  baseReserve: number;
  quoteReserve: number;
  /** The caller's LP token balance for this pool, in raw (BN) units. */
  userLpAmount: BN;
  /** Total LP supply, in raw (BN) units. */
  lpSupply: BN;
  /**
   * The caller's current position value, expressed entirely in
   * quote-token units (the base side converted at the pool's current
   * price). This is a simplification used to compare "how much did I put
   * in" vs "how much is my share worth now" over time - it is NOT a real
   * USD valuation, since there's no reliable price feed for arbitrary
   * (especially devnet) tokens.
   */
  userValueInQuote: number;
}

/**
 * NOTE: this reads pool reserves and LP supply from the fields Raydium SDK
 * v2 (^0.2.60-alpha) is documented to expose on `poolInfo`
 * (`mintAmountA`/`mintAmountB`/`lpAmount`). Because this package is alpha
 * and its shape can shift between versions, if the numbers below ever come
 * back as 0/NaN in the UI, `console.log(poolInfo)` here and adjust the
 * field names to match what your installed version actually returns.
 */
export async function getPoolSnapshot(
  wallet: WalletContextState,
  connection: Connection,
  poolId: string
): Promise<PoolSnapshot> {
  const raydium = await loadRaydium(wallet, connection);
  const { poolInfo } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const info: any = poolInfo;

  const baseReserve = Number(info.mintAmountA ?? 0);
  const quoteReserve = Number(info.mintAmountB ?? 0);
  const lpSupply = new BN(Math.round(Number(info.lpAmount ?? 0) * 10 ** (info.lpMint?.decimals ?? 9)).toString());

  const { tokenAccounts } = await raydium.account.fetchWalletTokenAccounts();
  const lpMintAddress = info.lpMint?.address;
  const lpAccount = tokenAccounts.find((acc) => acc.mint.toBase58() === lpMintAddress);
  const userLpAmount = lpAccount?.amount ?? new BN(0);

  const lpSupplyNum = Number(lpSupply.toString());
  const userShare = lpSupplyNum > 0 ? Number(userLpAmount.toString()) / lpSupplyNum : 0;

  // In a constant-product pool both sides hold equal value, so the pool's
  // total value in quote-token units is simply 2x the quote reserve.
  const userValueInQuote = userShare * quoteReserve * 2;

  return {
    poolId,
    baseMint: info.mintA?.address ?? "",
    baseSymbol: info.mintA?.symbol || "Base",
    baseDecimals: info.mintA?.decimals ?? 9,
    quoteMint: info.mintB?.address ?? "",
    quoteSymbol: info.mintB?.symbol || "Quote",
    quoteDecimals: info.mintB?.decimals ?? 9,
    baseReserve,
    quoteReserve,
    userLpAmount,
    lpSupply,
    userValueInQuote,
  };
}

