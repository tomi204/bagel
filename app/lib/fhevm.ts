/**
 * Zama fhEVM Client Library
 *
 * Uses the official Zama Relayer SDK loaded from CDN via _document.tsx.
 * The SDK is loaded with strategy="beforeInteractive" so it's available
 * before any JS runs.
 */

import { type Signer } from "ethers";

// Types for window.relayerSDK
interface RelayerSDK {
  initSDK: (options?: Record<string, unknown>) => Promise<boolean>;
  createInstance: (config: Record<string, unknown>) => Promise<FhevmInstance>;
  SepoliaConfig: Record<string, unknown> & {
    aclContractAddress: string;
    kmsContractAddress: string;
    relayerUrl: string;
  };
  __initialized__?: boolean;
}

interface FhevmInstance {
  createEncryptedInput: (
    contractAddress: string,
    userAddress: string
  ) => EncryptedInput;
  generateKeypair: () => { publicKey: string; privateKey: string };
  createEIP712: (
    publicKey: string,
    contractAddresses: string[],
    startTimestamp?: number,
    durationDays?: number
  ) => {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
    primaryType: string;
  };
  userDecrypt: (
    requests: Array<{ handle: string; contractAddress: string }>,
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number
  ) => Promise<Record<string, bigint | string | boolean>>;
  getPublicKey: () => Uint8Array | null;
  getPublicParams: (capacity: number) => unknown;
}

interface EncryptedInput {
  add64: (value: bigint) => void;
  encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

declare global {
  interface Window {
    relayerSDK?: RelayerSDK;
  }
}

let instance: FhevmInstance | null = null;
let initPromise: Promise<FhevmInstance> | null = null;
let lastInitError: string | null = null;

/**
 * Wait for the Relayer SDK to be available on window.
 * The SDK script is loaded via _document.tsx with strategy="beforeInteractive",
 * but we still wait in case of slow loading.
 */
function waitForRelayerSDK(timeoutMs = 15000): Promise<RelayerSDK> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Can only be used in the browser"));
  }

  // Already available
  if (window.relayerSDK && typeof window.relayerSDK.initSDK === "function") {
    return Promise.resolve(window.relayerSDK);
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (window.relayerSDK && typeof window.relayerSDK.initSDK === "function") {
        resolve(window.relayerSDK);
        return;
      }
      if (Date.now() - startTime > timeoutMs) {
        reject(
          new Error(
            "Relayer SDK not found on window after " +
              timeoutMs +
              "ms. Check that the CDN script loaded correctly."
          )
        );
        return;
      }
      setTimeout(check, 100);
    };

    check();
  });
}

/**
 * Initialize the fhEVM instance.
 * Safe to call multiple times — deduplicates concurrent calls.
 */
export async function initFhevm(
  _provider?: unknown
): Promise<FhevmInstance> {
  if (instance) return instance;

  // Deduplicate concurrent init calls
  if (initPromise) return initPromise;

  initPromise = _doInit();

  try {
    const result = await initPromise;
    return result;
  } catch (err: any) {
    lastInitError = err?.message || "Unknown fhEVM init error";
    initPromise = null; // Allow retry
    throw err;
  }
}

async function _doInit(): Promise<FhevmInstance> {
  console.log("[fhEVM] Waiting for Relayer SDK...");

  // 1. Wait for SDK (loaded via _document.tsx beforeInteractive script)
  const sdk = await waitForRelayerSDK();
  console.log("[fhEVM] Relayer SDK found, initializing WASM...");

  // 2. Initialize SDK (WASM)
  if (!sdk.__initialized__) {
    const result = await sdk.initSDK();
    sdk.__initialized__ = result;
    if (!result) {
      throw new Error("Relayer SDK initSDK() returned false");
    }
  }
  console.log("[fhEVM] WASM initialized, creating instance...");

  // 3. Get the EIP-1193 provider (window.ethereum)
  const eip1193 =
    typeof window !== "undefined" ? (window as any).ethereum : null;
  if (!eip1193) {
    throw new Error("No EIP-1193 provider (install MetaMask)");
  }

  // 4. Create instance using SepoliaConfig
  console.log(
    "[fhEVM] SepoliaConfig:",
    JSON.stringify(sdk.SepoliaConfig, null, 2)
  );

  const config = {
    ...sdk.SepoliaConfig,
    relayerUrl: `${sdk.SepoliaConfig.relayerUrl}/v2`,
    network: eip1193,
    relayerRouteVersion: 2,
  };

  instance = await sdk.createInstance(config);
  console.log("[fhEVM] Instance created successfully!");

  return instance;
}

/**
 * Ensure fhEVM is initialized, auto-init if needed.
 */
async function ensureInstance(): Promise<FhevmInstance> {
  if (instance) return instance;
  return initFhevm();
}

/**
 * Get the current fhEVM instance (null if not yet initialized)
 */
export function getFhevmInstance(): FhevmInstance | null {
  return instance;
}

/**
 * Get initialization error (if any)
 */
export function getInitError(): string | null {
  return lastInitError;
}

/**
 * Create encrypted input for a contract call (single value)
 */
export async function encryptValue(
  contractAddress: string,
  userAddress: string,
  value: bigint
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  const inst = await ensureInstance();

  const input = inst.createEncryptedInput(contractAddress, userAddress);
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
  const inst = await ensureInstance();

  const input = inst.createEncryptedInput(contractAddress, userAddress);
  for (const val of values) {
    input.add64(val);
  }
  return input.encrypt();
}

/**
 * Decrypt an encrypted value via userDecrypt
 */
export async function decryptValue(
  handle: bigint,
  contractAddress: string,
  signer: Signer
): Promise<bigint> {
  const inst = await ensureInstance();

  const address = await signer.getAddress();
  const handleHex = "0x" + handle.toString(16).padStart(64, "0");

  // Generate keypair
  const keypair = inst.generateKeypair();

  // Create EIP712 for signing
  const now = Math.floor(Date.now() / 1000);
  const durationDays = 1;
  const eip712 = inst.createEIP712(
    keypair.publicKey,
    [contractAddress],
    now,
    durationDays
  );

  // Sign with wallet
  const signature = await signer.signTypedData(
    eip712.domain as any,
    {
      UserDecryptRequestVerification:
        eip712.types.UserDecryptRequestVerification,
    },
    eip712.message as any
  );

  // Call userDecrypt
  const results = await inst.userDecrypt(
    [{ handle: handleHex, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature,
    [contractAddress],
    address,
    now,
    durationDays
  );

  // Result is keyed by handle
  const result = results[handleHex];
  if (result === undefined) {
    throw new Error("Decryption returned no result for handle");
  }

  return BigInt(result as string | bigint);
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
