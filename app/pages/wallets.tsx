import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { formatEther } from 'ethers';
import {
  Wallet,
  ArrowLeft,
  Copy,
  CheckCircle,
  Eye,
  EyeSlash,
  Info,
  ShieldCheck,
  LockSimple,
  Fingerprint,
  ArrowSquareOut,
  Warning,
  Database,
  CircleNotch,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { useWallet } from './_app';
import { getCerc20Contract, PAYROLL_ADDRESS, CERC20_ADDRESS, POOL_ADDRESS } from '../lib/contract-client';
import { decryptValue } from '../lib/fhevm';
import { formatBalance } from '../lib/format';

const WalletButton = dynamic(() => import('../components/WalletButton'), {
  ssr: false,
});

interface AccountInfo {
  ethBalance: string;
  hasEncryptedBalance: boolean;
  encryptedBalanceHandle: bigint | null;
}

export default function WalletsPage() {
  const { address, signer, chainId, fhevmReady, fhevmError } = useWallet();
  const connected = !!address && !!signer;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    ethBalance: '0',
    hasEncryptedBalance: false,
    encryptedBalanceHandle: null,
  });

  // Load account info on mount and when wallet changes
  useEffect(() => {
    async function loadAccountInfo() {
      if (!address || !signer) {
        setAccountInfo({
          ethBalance: '0',
          hasEncryptedBalance: false,
          encryptedBalanceHandle: null,
        });
        setDecryptedBalance(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const provider = signer.provider!;
        const balance = await provider.getBalance(address);
        const ethBalance = formatEther(balance);

        let hasEncryptedBalance = false;
        let encryptedBalanceHandle: bigint | null = null;

        try {
          const cerc20 = getCerc20Contract(signer);
          const handle = await cerc20.confidentialBalanceOf(address);
          const handleBigInt = BigInt(handle);
          if (handleBigInt !== 0n) {
            hasEncryptedBalance = true;
            encryptedBalanceHandle = handleBigInt;
          }
        } catch (err) {
          console.warn('Could not fetch CERC20 balance:', err);
        }

        setAccountInfo({
          ethBalance,
          hasEncryptedBalance,
          encryptedBalanceHandle,
        });
      } catch (err: any) {
        console.error('Failed to load account info:', err);
        setError(err.message || 'Failed to load account information');
      } finally {
        setLoading(false);
      }
    }

    loadAccountInfo();
  }, [address, signer]);

  const refreshAccountInfo = useCallback(async () => {
    if (!address || !signer) return;

    setLoading(true);
    setDecryptedBalance(null);
    try {
      const provider = signer.provider!;
      const balance = await provider.getBalance(address);
      const ethBalance = formatEther(balance);

      let hasEncryptedBalance = false;
      let encryptedBalanceHandle: bigint | null = null;

      try {
        const cerc20 = getCerc20Contract(signer);
        const handle = await cerc20.confidentialBalanceOf(address);
        const handleBigInt = BigInt(handle);
        if (handleBigInt !== 0n) {
          hasEncryptedBalance = true;
          encryptedBalanceHandle = handleBigInt;
        }
      } catch (err) {
        console.warn('Could not fetch CERC20 balance:', err);
      }

      setAccountInfo({
        ethBalance,
        hasEncryptedBalance,
        encryptedBalanceHandle,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  }, [address, signer]);

  const handleDecryptBalance = useCallback(async () => {
    if (!signer || !accountInfo.encryptedBalanceHandle) return;

    setDecrypting(true);
    try {
      const value = await decryptValue(accountInfo.encryptedBalanceHandle, CERC20_ADDRESS, signer);
      setDecryptedBalance(value);
    } catch (err: any) {
      console.error('Failed to decrypt balance:', err);
      setError(err.message || 'Failed to decrypt balance');
    } finally {
      setDecrypting(false);
    }
  }, [signer, accountInfo.encryptedBalanceHandle]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <>
      <Head>
        <title>Wallets - Bagel</title>
        <meta name="description" content="Manage your wallets and confidential accounts" />
      </Head>

      <div className="min-h-screen bg-[#F7F7F2]">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🥯</span>
                <h1 className="text-xl font-bold text-bagel-dark">Wallets</h1>
              </div>
            </div>
            <WalletButton />
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2"
              >
                <Warning className="w-5 h-5" />
                {error}
              </motion.div>
            )}

            {/* fhEVM Status */}
            {connected && (fhevmError || !fhevmReady) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 border rounded text-sm flex items-center gap-2 ${
                  fhevmError
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}
              >
                {fhevmError ? (
                  <>
                    <Warning className="w-5 h-5" />
                    fhEVM Error: {fhevmError}
                  </>
                ) : (
                  <>
                    <CircleNotch className="w-5 h-5 animate-spin" />
                    Initializing fhEVM encryption...
                  </>
                )}
              </motion.div>
            )}

            {/* Connected Wallet */}
            {connected && address && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded p-6 border border-gray-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-bagel-dark flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-bagel-orange" />
                    Connected Wallet
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshAccountInfo}
                      disabled={loading}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                    >
                      <ArrowsClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                      Active
                    </span>
                    {fhevmReady && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                        FHE Ready
                      </span>
                    )}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded border border-gray-200 mb-4">
                  <div className="w-10 h-10 bg-bagel-orange/10 rounded-full flex items-center justify-center">
                    <Fingerprint className="w-5 h-5 text-bagel-orange" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-bagel-dark">Primary Wallet</div>
                    <div className="text-xs text-gray-500 font-mono truncate">{address}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(address, 'wallet')}
                    className="p-2 hover:bg-gray-200 rounded transition-colors"
                  >
                    {copiedKey === 'wallet' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" weight="fill" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  <a
                    href={`https://sepolia.etherscan.io/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-200 rounded transition-colors"
                  >
                    <ArrowSquareOut className="w-4 h-4 text-gray-500" />
                  </a>
                </div>

                {/* Balances */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* ETH Balance */}
                  <div className="p-4 bg-bagel-cream rounded border border-bagel-orange/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-bagel-orange rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-bold">E</span>
                      </div>
                      <span className="text-sm font-medium text-bagel-dark">ETH Balance</span>
                    </div>
                    <div className="text-2xl font-bold text-bagel-dark">
                      {loading ? (
                        <CircleNotch className="w-6 h-6 animate-spin text-bagel-orange" />
                      ) : (
                        `${formatBalance(parseFloat(accountInfo.ethBalance), 4)} ETH`
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {chainId ? `Chain ID: ${chainId}` : 'Native Ethereum'}
                    </div>
                  </div>

                  {/* CERC20 Encrypted Balance */}
                  <div className="p-4 bg-bagel-cream rounded border border-bagel-orange/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-bagel-orange rounded-full flex items-center justify-center">
                        <span className="text-white text-lg">🥯</span>
                      </div>
                      <span className="text-sm font-medium text-bagel-dark">USDBagel</span>
                    </div>
                    <div className="text-2xl font-bold text-bagel-dark flex items-center gap-2">
                      {loading ? (
                        <CircleNotch className="w-6 h-6 animate-spin text-bagel-orange" />
                      ) : decryptedBalance !== null ? (
                        <span>{formatBalance(Number(decryptedBalance), 0)} USDBagel</span>
                      ) : accountInfo.hasEncryptedBalance ? (
                        <>
                          <LockSimple className="w-5 h-5 text-bagel-orange" />
                          <span>Encrypted</span>
                          {fhevmReady && (
                            <button
                              onClick={handleDecryptBalance}
                              disabled={decrypting}
                              className="ml-2 px-2 py-1 text-xs bg-bagel-orange/10 text-bagel-orange rounded hover:bg-bagel-orange/20 transition-colors disabled:opacity-50"
                            >
                              {decrypting ? (
                                <CircleNotch className="w-3 h-3 animate-spin inline" />
                              ) : (
                                'Decrypt'
                              )}
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400 text-lg">No balance</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {accountInfo.hasEncryptedBalance
                        ? 'FHE-encrypted balance (Zama fhEVM)'
                        : 'Mint tokens to create balance'}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* On-Chain Account Details */}
            {connected && address && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded p-6 border border-gray-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-bagel-dark flex items-center gap-2">
                    <Database className="w-5 h-5 text-bagel-orange" />
                    Contract Addresses
                  </h3>
                  <button
                    onClick={() => setShowValues(!showValues)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                  >
                    {showValues ? (
                      <>
                        <EyeSlash className="w-4 h-4" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Show
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Payroll Contract */}
                  <div className="p-4 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-bagel-orange/10 text-bagel-orange">
                            Payroll Contract
                          </span>
                          {PAYROLL_ADDRESS ? (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">
                              Deployed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-yellow-100 text-yellow-700">
                              Not Configured
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">
                          BagelPayroll - manages businesses, employees, and salary accrual
                        </p>
                        <div className="text-sm font-mono text-bagel-dark">
                          {showValues && PAYROLL_ADDRESS ? PAYROLL_ADDRESS : '••••••••••••••••••••••••••••••••'}
                        </div>
                      </div>
                      {PAYROLL_ADDRESS && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(PAYROLL_ADDRESS, 'payroll')}
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            {copiedKey === 'payroll' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" weight="fill" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          <a
                            href={`https://sepolia.etherscan.io/address/${PAYROLL_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            <ArrowSquareOut className="w-4 h-4 text-gray-500" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CERC20 Token Contract */}
                  <div className="p-4 bg-gray-50 rounded border border-gray-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-bagel-orange/10 text-bagel-orange">
                            CERC20 Token
                          </span>
                          {CERC20_ADDRESS ? (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">
                              Deployed
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600">
                              Not Configured
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">
                          Holds your encrypted USDBagel balance (ERC7984 confidential token)
                        </p>
                        <div className="text-sm font-mono text-bagel-dark">
                          {showValues && CERC20_ADDRESS ? CERC20_ADDRESS : '••••••••••••••••••••••••••••••••'}
                        </div>
                      </div>
                      {CERC20_ADDRESS && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(CERC20_ADDRESS, 'cerc20')}
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            {copiedKey === 'cerc20' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" weight="fill" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          <a
                            href={`https://sepolia.etherscan.io/address/${CERC20_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            <ArrowSquareOut className="w-4 h-4 text-gray-500" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Privacy Pool Contract */}
                  {POOL_ADDRESS && (
                    <div className="p-4 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-bagel-orange/10 text-bagel-orange">
                              Privacy Pool
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700">
                              Deployed
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            BagelPool - queued private transfers via encrypted routing
                          </p>
                          <div className="text-sm font-mono text-bagel-dark">
                            {showValues ? POOL_ADDRESS : '••••••••••••••••••••••••••••••••'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(POOL_ADDRESS, 'pool')}
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            {copiedKey === 'pool' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" weight="fill" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          <a
                            href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                          >
                            <ArrowSquareOut className="w-4 h-4 text-gray-500" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* How It Works */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded p-6 border border-gray-200"
            >
              <h3 className="font-semibold text-bagel-dark mb-4 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-bagel-orange" />
                How Your Wallet Works
              </h3>

              <div className="space-y-4 text-sm text-gray-600">
                <div className="p-4 bg-bagel-cream/50 rounded border border-bagel-orange/10">
                  <h4 className="font-medium text-bagel-dark mb-2 flex items-center gap-2">
                    <LockSimple className="w-4 h-4 text-bagel-orange" />
                    Fully Homomorphic Encryption (FHE)
                  </h4>
                  <p className="text-xs leading-relaxed">
                    Your USDBagel balance is encrypted using Zama's fhEVM technology. This means your balance
                    remains encrypted on-chain at all times - even the blockchain validators cannot see your
                    actual balance. Computations (transfers, payroll calculations) happen directly on encrypted
                    data without ever decrypting it. Only you can decrypt your own balance by signing an
                    EIP-712 request with your wallet.
                  </p>
                </div>

                <div className="p-4 bg-bagel-cream/50 rounded border border-bagel-orange/10">
                  <h4 className="font-medium text-bagel-dark mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-bagel-orange" />
                    Smart Contract Architecture
                  </h4>
                  <p className="text-xs leading-relaxed">
                    Bagel uses EVM smart contracts on Sepolia to manage payroll. The CERC20 token contract
                    (ERC7984) stores encrypted balances, the Payroll contract manages businesses and employees,
                    and the Privacy Pool enables anonymous transfers via encrypted routing. All state is
                    on-chain and verifiable.
                  </p>
                </div>

                <div className="p-4 bg-bagel-cream/50 rounded border border-bagel-orange/10">
                  <h4 className="font-medium text-bagel-dark mb-2 flex items-center gap-2">
                    <Fingerprint className="w-4 h-4 text-bagel-orange" />
                    Privacy Guarantees
                  </h4>
                  <p className="text-xs leading-relaxed">
                    Only you (the wallet owner) can authorize decryption of your balance. Employers can pay you
                    without knowing your total balance, and coworkers cannot see each other's salaries. All
                    financial data stays private while still being verifiable on-chain.
                  </p>
                </div>
              </div>

              {/* Contract Addresses */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <h4 className="font-medium text-bagel-dark mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-bagel-orange" />
                  Contract Addresses
                </h4>
                <div className="space-y-1 font-mono text-[10px] bg-gray-50 p-3 rounded">
                  <div><span className="text-gray-500">Payroll:</span> {PAYROLL_ADDRESS || 'Not configured'}</div>
                  <div><span className="text-gray-500">CERC20 Token:</span> {CERC20_ADDRESS || 'Not configured'}</div>
                  <div><span className="text-gray-500">Privacy Pool:</span> {POOL_ADDRESS || 'Not configured'}</div>
                </div>
              </div>
            </motion.div>

            {/* Not Connected State */}
            {!connected && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded p-12 border border-gray-200 text-center"
              >
                <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Connect Your Wallet</h3>
                <p className="text-sm text-gray-500 mb-6">
                  Connect your EVM wallet to view your accounts.
                </p>
                <WalletButton />
              </motion.div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-16 py-8 border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
            <p className="text-xs">Bagel Privacy Payroll - Built on Ethereum with Zama FHE</p>
          </div>
        </footer>
      </div>
    </>
  );
}
