# Luna Liquidity

Create and manage Raydium liquidity pools for Solana tokens, directly from
your wallet. Companion project to Luna Launch / SolMint Launchpad Pro.

## What it does

- **Create Pool** - deposits real liquidity into a brand new Raydium CPMM
  pool for any token against SOL. The resulting pool is a real, public
  Raydium pool - it shows up on raydium.io, Jupiter, DEX Screener, etc.
- **Manage Liquidity** - add more liquidity to an existing pool, or withdraw
  a percentage of your position back to your wallet.

All transactions are built client-side and signed by the connected wallet
(Phantom, Solflare) - this site never holds funds or private keys.

## Setup (Vercel + GitHub, mobile workflow)

1. Push this project to a new GitHub repository.
2. Import it into Vercel.
3. In Vercel -> Settings -> Environment Variables, add:
   - `NEXT_PUBLIC_SOLANA_RPC_URL` - your Helius (or similar) mainnet RPC URL.
     See `.env.example`.
4. Deploy. Vercel will redeploy automatically on every push to `main`.

## Local reference (Termux)

```bash
npm install
npm run build
```

(You don't need to run this locally if you rely on Vercel's build - this is
just useful to catch TypeScript errors before pushing.)

## Tech stack

- Next.js 15 + TypeScript
- Tailwind CSS (custom "moon & tide" theme)
- Solana Wallet Adapter (Phantom, Solflare)
- `@raydium-io/raydium-sdk-v2` for all pool operations
- Framer Motion, Sonner (toasts)

## Notes on the Raydium integration (`lib/raydium.ts`)

- `createPool()` - creates a new CPMM pool, fee tier fetched live from
  Raydium's API (`raydium.api.getCpmmConfigs()`), so it always uses their
  current standard fee configuration.
- `addLiquidity()` - fetches the pool's current on-chain state via
  `getPoolInfoFromRpc`, then deposits the given token amount; Raydium
  auto-computes the matching SOL amount from the live pool ratio.
- `withdrawLiquidity()` - reads the caller's actual LP token balance for the
  pool and withdraws the requested percentage of it.

All three were verified directly against the installed SDK's TypeScript
type definitions (`@raydium-io/raydium-sdk-v2`) to make sure method names
and parameter shapes are accurate as of this SDK version.
