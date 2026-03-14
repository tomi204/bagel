import type { NextApiRequest, NextApiResponse } from "next";
import { Wallet, JsonRpcProvider, Contract } from "ethers";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.infura.io/v3/652503e9fbc04fa3a323e08b7c610840";
const CERC20_ADDRESS = process.env.NEXT_PUBLIC_CERC20_ADDRESS || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const FAUCET_AMOUNT = 10_000; // 10,000 USDB (6 decimals, so 10_000 raw = 0.01 USDB... we want 10,000 tokens)
// CERC20 mint takes uint64 raw amount. With 6 decimals: 10_000 * 1e6 = 10_000_000_000
const FAUCET_RAW_AMOUNT = 10_000_000_000; // 10,000 USDB

const CERC20_ABI = ["function mint(address to, uint64 amount) external"];

// Rate limit: one claim per address per hour
const claims = new Map<string, number>();
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { address } = req.body;
  if (!address || typeof address !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "Invalid address" });
  }

  if (!DEPLOYER_PRIVATE_KEY) {
    return res.status(500).json({ error: "Faucet not configured (missing DEPLOYER_PRIVATE_KEY)" });
  }

  if (!CERC20_ADDRESS) {
    return res.status(500).json({ error: "CERC20 address not configured" });
  }

  // Rate limit check
  const lastClaim = claims.get(address.toLowerCase());
  if (lastClaim && Date.now() - lastClaim < RATE_LIMIT_MS) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastClaim)) / 60_000);
    return res.status(429).json({ error: `Rate limited. Try again in ${remaining} minutes.` });
  }

  try {
    const provider = new JsonRpcProvider(RPC_URL);
    const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const cerc20 = new Contract(CERC20_ADDRESS, CERC20_ABI, wallet);

    const tx = await cerc20.mint(address, FAUCET_RAW_AMOUNT);
    await tx.wait();

    claims.set(address.toLowerCase(), Date.now());

    return res.status(200).json({
      success: true,
      txHash: tx.hash,
      amount: "10,000 USDB",
    });
  } catch (err: any) {
    console.error("Faucet error:", err);
    return res.status(500).json({ error: err?.message || "Mint failed" });
  }
}
