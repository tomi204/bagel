import type { NextApiRequest, NextApiResponse } from "next";
import { Wallet, JsonRpcProvider, Contract } from "ethers";

/**
 * TEE Distributor Endpoint
 *
 * This API route acts as the TEE operator for the BagelPool.
 * It reads pending transfers, decrypts recipient addresses via the
 * Zama gateway, and calls distribute() on the pool contract.
 *
 * In production this would run inside a TEE (e.g. AWS Nitro Enclaves)
 * with the operator private key sealed inside the enclave.
 *
 * Can be called as a cron job: POST /api/distribute
 */

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.infura.io/v3/652503e9fbc04fa3a323e08b7c610840";
const POOL_ADDRESS = process.env.NEXT_PUBLIC_POOL_ADDRESS || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

// BagelPool ABI (only what the distributor needs)
const POOL_ABI = [
  "function queueLength() external view returns (uint256)",
  "function getTransferInfo(uint256 index) external view returns (address sender, uint256 timestamp, bool distributed)",
  "function distribute(uint256 index, address recipient) external",
  "function batchDistribute(uint256[] calldata indices, address[] calldata recipients) external",
  "function minDelay() external view returns (uint256)",
];

// Relayer SDK types for decryption
const RELAYER_API_URL = "https://relayer.zama.ai";

/**
 * Decrypt an eaddress handle via the Zama gateway/relayer.
 * In a real TEE, this would use the sealed decryption key.
 * For the hackathon, we use the relayer API.
 */
async function decryptAddress(
  handle: string,
  contractAddress: string,
  operatorWallet: Wallet
): Promise<string> {
  // For hackathon: use userDecrypt pattern via relayer SDK
  // The operator wallet signs an EIP-712 message to authorize decryption
  // The relayer returns the decrypted value

  // NOTE: In production, this runs inside a TEE.
  // The TEE has direct access to the decryption key.
  // For now, we use the operator's signature to request decryption.

  // This is a placeholder - the actual implementation depends on the
  // Zama gateway decryption API for eaddress types.
  // For the hackathon demo, we'll use the off-chain mapping approach below.
  throw new Error("Gateway eaddress decryption not yet implemented - use off-chain mapping");
}

/**
 * Off-chain mapping approach for hackathon:
 * The frontend sends recipient info to this endpoint along with the queue index.
 * This is stored temporarily and used for distribution.
 *
 * In production, the TEE would decrypt on-chain eaddress handles directly.
 */

// File-based mapping of queue index -> recipient address
// Persists across server restarts (in production this would be in a TEE-sealed database)
import fs from "fs";
import path from "path";

const RECIPIENTS_FILE = path.join(process.cwd(), ".bagel-pool-recipients.json");

function loadRecipients(): Map<number, string> {
  try {
    if (fs.existsSync(RECIPIENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RECIPIENTS_FILE, "utf-8"));
      return new Map(Object.entries(data).map(([k, v]) => [Number(k), v as string]));
    }
  } catch {}
  return new Map();
}

function saveRecipients(map: Map<number, string>) {
  const obj: Record<string, string> = {};
  map.forEach((v, k) => { obj[k.toString()] = v; });
  fs.writeFileSync(RECIPIENTS_FILE, JSON.stringify(obj, null, 2));
}

// Lazy-loaded persistent map
let _cachedRecipients: Map<number, string> | null = null;
function getPendingRecipients(): Map<number, string> {
  if (!_cachedRecipients) _cachedRecipients = loadRecipients();
  return _cachedRecipients;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST" && req.body?.action === "register") {
    // Frontend registers a recipient mapping for a queue index
    const { queueIndex, recipient } = req.body;

    if (typeof queueIndex !== "number" || !recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return res.status(400).json({ error: "Invalid queueIndex or recipient" });
    }

    getPendingRecipients().set(queueIndex, recipient);
    saveRecipients(getPendingRecipients());
    console.log(`[Distributor] Registered recipient for index ${queueIndex}: ${recipient}`);

    return res.status(200).json({ success: true, queueIndex });
  }

  if (req.method === "POST" && req.body?.action === "distribute") {
    // Trigger distribution of pending transfers
    if (!DEPLOYER_PRIVATE_KEY) {
      return res.status(500).json({ error: "Operator key not configured" });
    }
    if (!POOL_ADDRESS) {
      return res.status(500).json({ error: "Pool address not configured" });
    }

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, wallet);

      const queueLen = Number(await pool.queueLength());
      const minDelay = Number(await pool.minDelay());
      const now = Math.floor(Date.now() / 1000);

      const indicesToDistribute: number[] = [];
      const recipientsToDistribute: string[] = [];

      for (let i = 0; i < queueLen; i++) {
        const [sender, timestamp, distributed] = await pool.getTransferInfo(i);

        if (distributed) continue;
        if (now < Number(timestamp) + minDelay) continue;

        const recipient = getPendingRecipients().get(i);
        if (!recipient) {
          console.log(`[Distributor] No recipient registered for index ${i}, skipping`);
          continue;
        }

        indicesToDistribute.push(i);
        recipientsToDistribute.push(recipient);
      }

      if (indicesToDistribute.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No transfers ready for distribution",
          queueLength: queueLen,
        });
      }

      console.log(`[Distributor] Distributing ${indicesToDistribute.length} transfers...`);

      let txHash: string;
      if (indicesToDistribute.length === 1) {
        const tx = await pool.distribute(indicesToDistribute[0], recipientsToDistribute[0]);
        await tx.wait();
        txHash = tx.hash;
      } else {
        const tx = await pool.batchDistribute(indicesToDistribute, recipientsToDistribute);
        await tx.wait();
        txHash = tx.hash;
      }

      // Clean up registered recipients
      for (const idx of indicesToDistribute) {
        getPendingRecipients().delete(idx);
      }
      saveRecipients(getPendingRecipients());

      console.log(`[Distributor] Distributed ${indicesToDistribute.length} transfers, tx: ${txHash}`);

      return res.status(200).json({
        success: true,
        distributed: indicesToDistribute.length,
        txHash,
        indices: indicesToDistribute,
      });
    } catch (err: any) {
      console.error("[Distributor] Error:", err);
      return res.status(500).json({ error: err?.message || "Distribution failed" });
    }
  }

  // GET: show pool status
  if (req.method === "GET") {
    if (!POOL_ADDRESS) {
      return res.status(200).json({ configured: false, message: "Pool address not set" });
    }

    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider);

      const queueLen = Number(await pool.queueLength());
      const minDelay = Number(await pool.minDelay());

      let pending = 0;
      let distributed = 0;
      for (let i = 0; i < queueLen; i++) {
        const [, , isDist] = await pool.getTransferInfo(i);
        if (isDist) distributed++;
        else pending++;
      }

      return res.status(200).json({
        configured: true,
        poolAddress: POOL_ADDRESS,
        queueLength: queueLen,
        pending,
        distributed,
        minDelay,
        pendingRecipients: getPendingRecipients().size,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to read pool" });
    }
  }

  return res.status(405).json({ error: "Use POST with action: 'register' or 'distribute', or GET for status" });
}
