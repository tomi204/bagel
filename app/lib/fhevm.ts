/**
 * Zama fhEVM Client Library
 *
 * Uses the official Zama Relayer SDK loaded from CDN.
 * Follows the same pattern as the official Zama dapps repo.
 */

import { type Signer } from "ethers";

// CDN URL for the Relayer SDK (same as official Zama dapps)
const SDK_CDN_URL =
  "https://cdn.zama.org/relayer-sdk-js/0.4.1/relayer-sdk-js.umd.cjs";

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

/**
 * Load the Relayer SDK from CDN (injects <script> tag)
 */
function loadRelayerSDK(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Can only be used in the browser"));
  }

  // Already loaded
  if (window.relayerSDK && typeof window.relayerSDK.initSDK === "function") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    // Check if script already exists
    const existing = document.querySelector(`script[src="${SDK_CDN_URL}"]`);
    if (existing) {
      if (window.relayerSDK?.initSDK) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Failed to load Relayer SDK"))
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_CDN_URL;
    script.type = "text/javascript";
    script.async = true;

    script.onload = () => {
      if (!window.relayerSDK?.initSDK || !window.relayerSDK?.createInstance) {
        reject(
          new Error(
            "Relayer SDK loaded but window.relayerSDK is invalid"
          )
        );
        return;
      }
      resolve();
    };

    script.onerror = () => {
      reject(new Error(`Failed to load Relayer SDK from ${SDK_CDN_URL}`));
    };

    document.head.appendChild(script);
  });
}

/**
 * Initialize the fhEVM instance (call once on wallet connect)
 */
export async function initFhevm(
  provider: unknown
): Promise<FhevmInstance> {
  if (instance) return instance;

  // 1. Load SDK from CDN
  await loadRelayerSDK();

  const sdk = window.relayerSDK!;

  // 2. Initialize SDK (WASM)
  if (!sdk.__initialized__) {
    const result = await sdk.initSDK();
    sdk.__initialized__ = result;
    if (!result) {
      throw new Error("Relayer SDK initSDK failed");
    }
  }

  // 3. Get the Eip1193 provider (window.ethereum)
  const eip1193 =
    typeof window !== "undefined" ? (window as any).ethereum : null;
  if (!eip1193) {
    throw new Error("No EIP-1193 provider found (MetaMask not installed?)");
  }

  // 4. Create instance using SepoliaConfig
  const config = {
    ...sdk.SepoliaConfig,
    relayerUrl: `${sdk.SepoliaConfig.relayerUrl}/v2`,
    network: eip1193,
    relayerRouteVersion: 2,
  };

  instance = await sdk.createInstance(config);

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
 * Decrypt an encrypted value via userDecrypt
 */
export async function decryptValue(
  handle: bigint,
  contractAddress: string,
  signer: Signer
): Promise<bigint> {
  if (!instance) throw new Error("fhEVM not initialized");

  const address = await signer.getAddress();
  const handleHex = "0x" + handle.toString(16).padStart(64, "0");

  // Generate keypair
  const keypair = instance.generateKeypair();

  // Create EIP712 for signing
  const now = Math.floor(Date.now() / 1000);
  const durationDays = 1;
  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    now,
    durationDays
  );

  // Sign with wallet
  const signature = await signer.signTypedData(
    eip712.domain as any,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message as any
  );

  // Call userDecrypt
  const results = await instance.userDecrypt(
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
