/**
 * Zama fhEVM Client Library
 *
 * Handles FHE encryption, decryption, and proof generation for BagelPayroll.
 * Uses fhevmjs v0.6 with correct initialization flow.
 */

import { initFhevm as initWasm, createInstance, type FhevmInstance } from "fhevmjs/web";
import { BrowserProvider, JsonRpcProvider, type Signer } from "ethers";

let instance: FhevmInstance | null = null;

// Known Zama network addresses
const ZAMA_SEPOLIA = {
  aclAddress: "0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D",
  kmsAddress: "0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A",
  gatewayUrl: "https://gateway.zama.ai",
};

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || ZAMA_SEPOLIA.gatewayUrl;

// Override via env vars, or fall back to known network defaults
const ACL_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_ACL_ADDRESS || "";
const KMS_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_KMS_ADDRESS || "";

/**
 * Try to fetch FHE contract addresses from a local Hardhat node
 * via the fhevm_relayer_metadata RPC call.
 */
async function fetchHardhatMetadata(
  rpcUrl: string
): Promise<{ aclContractAddress: string; kmsContractAddress: string } | null> {
  try {
    const rpc = new JsonRpcProvider(rpcUrl);
    const metadata = await rpc.send("fhevm_relayer_metadata", []);
    rpc.destroy();

    if (
      metadata &&
      typeof metadata === "object" &&
      typeof metadata.ACLAddress === "string" &&
      typeof metadata.KMSVerifierAddress === "string"
    ) {
      return {
        aclContractAddress: metadata.ACLAddress,
        kmsContractAddress: metadata.KMSVerifierAddress,
      };
    }
  } catch {
    // Not a fhevm Hardhat node or not reachable
  }
  return null;
}

/**
 * Initialize the fhEVM instance (call once on wallet connect)
 */
export async function initFhevm(provider: BrowserProvider): Promise<FhevmInstance> {
  if (instance) return instance;

  // 1. Initialize WASM modules
  await initWasm();

  // 2. Resolve ACL and KMS contract addresses
  let aclAddress = ACL_CONTRACT_ADDRESS;
  let kmsAddress = KMS_CONTRACT_ADDRESS;

  // Resolve addresses from network if not set via env vars
  if (!aclAddress || !kmsAddress) {
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    if (chainId === 11155111) {
      // Ethereum Sepolia — use known Zama addresses
      aclAddress = aclAddress || ZAMA_SEPOLIA.aclAddress;
      kmsAddress = kmsAddress || ZAMA_SEPOLIA.kmsAddress;
    } else if (chainId === 31337) {
      // Local Hardhat — fetch addresses from node
      const metadata = await fetchHardhatMetadata("http://127.0.0.1:8545");
      if (metadata) {
        aclAddress = metadata.aclContractAddress;
        kmsAddress = metadata.kmsContractAddress;
      }
    }
  }

  if (!aclAddress || !kmsAddress) {
    throw new Error(
      "FHE contract addresses not configured. Set NEXT_PUBLIC_ACL_ADDRESS and NEXT_PUBLIC_KMS_ADDRESS, or run a local Hardhat node with @fhevm/hardhat-plugin."
    );
  }

  // 3. Create fhEVM instance
  instance = await createInstance({
    kmsContractAddress: kmsAddress,
    aclContractAddress: aclAddress,
    network: provider.provider as any,
    gatewayUrl: GATEWAY_URL,
  });

  return instance;
}

/**
 * Get the current fhEVM instance
 */
export function getFhevmInstance(): FhevmInstance | null {
  return instance;
}

/**
 * Create encrypted input for a contract call (single value)
 */
export async function encryptValue(
  contractAddress: string,
  userAddress: string,
  value: bigint
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  if (!instance) throw new Error("fhEVM not initialized");

  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  return input.encrypt();
}

/**
 * Create encrypted inputs (multiple values)
 */
export async function encryptValues(
  contractAddress: string,
  userAddress: string,
  values: bigint[]
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  if (!instance) throw new Error("fhEVM not initialized");

  const input = instance.createEncryptedInput(contractAddress, userAddress);
  for (const val of values) {
    input.add64(val);
  }
  return input.encrypt();
}

/**
 * Decrypt an encrypted value via reencryption
 */
export async function decryptValue(
  handle: bigint,
  contractAddress: string,
  signer: Signer
): Promise<bigint> {
  if (!instance) throw new Error("fhEVM not initialized");

  const address = await signer.getAddress();

  // Generate keypair for reencryption
  const keypair = instance.generateKeypair();
  const eip712 = instance.createEIP712(keypair.publicKey, contractAddress);

  const signature = await signer.signTypedData(
    eip712.domain,
    eip712.types,
    eip712.message
  );

  return instance.reencrypt(
    handle,
    keypair.privateKey,
    keypair.publicKey,
    signature,
    contractAddress,
    address
  );
}

/**
 * Encrypted value handle (for display/storage)
 */
export interface EncryptedHandle {
  handle: string;
  type: "euint64";
}

/**
 * Encrypted salary data for display
 */
export interface EncryptedSalaryData {
  encryptedSalaryPerSecond: EncryptedHandle;
  encryptedAccrued: EncryptedHandle;
  lastUpdate: number;
  isActive: boolean;
}

/**
 * Decrypted salary data (only for authorized users)
 */
export interface DecryptedSalaryData {
  salaryPerSecond: bigint;
  accruedBalance: bigint;
  lastUpdate: number;
}
