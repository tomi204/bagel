import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  House,
  Users,
  PaperPlaneTilt,
  ClockCounterClockwise,
  Vault,
  Wallet,
  ChartBar,
  MagnifyingGlass,
  Bell,
  CaretUp,
  CaretDown,
  Shield,
  ShieldCheck,
  Eye,
  EyeSlash,
  Fingerprint,
  LockSimple,
  LockSimpleOpen,
  CheckCircle,
  Circle,
  Funnel,
  DotsThree,
  ArrowUpRight,
  Command,
  X,
  CaretDown as CaretDownIcon,
  CurrencyDollar,
  CalendarBlank,
  Lightning,
  Info,
  Warning,
  User,
  Copy,
  Plus,
  CircleNotch,
  ArrowSquareOut,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/toaster';
import { formatBalance } from '@/lib/format';
import { useWallet } from './_app';
import { useBagel } from '../hooks/useBagel';
import {
  getPayrollContract,
  getCerc20Contract,
  getNextBusinessIndex,
  getBusinessInfo,
  getEmployeeInfo,
  registerBusiness as registerBusinessTx,
  deposit as depositTx,
  addEmployee as addEmployeeTx,
  setEmployeeAddress as setEmployeeAddressTx,
  accrueSalary as accrueSalaryTx,
  requestWithdrawal as requestWithdrawalTx,
  PAYROLL_ADDRESS,
  CERC20_ADDRESS,
} from '../lib/contract-client';
import { decryptValue, encryptValue } from '../lib/fhevm';
import { PayrollChart } from '@/components/ui/payroll-chart';
import { CryptoDistributionChart } from '@/components/ui/crypto-distribution-chart';

const WalletButton = dynamic(() => import('../components/WalletButton'), {
  ssr: false,
});

// Decrypt cache - stores decrypted values per handle
// Key: "handle_walletAddress", Value: { amount, timestamp }
const decryptCache = new Map<string, { amount: number; timestamp: number }>();
const DECRYPT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Helper: Check if handle has changed before decrypting
function shouldDecryptHandle(
  currentHandle: bigint,
  walletAddress: string
): boolean {
  const cacheKey = `bagel_balance_${walletAddress}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const { handle: cachedHandle, amount: cachedAmount } = JSON.parse(cached);
      if (cachedHandle === currentHandle.toString()) {
        toast.info('Your balance is fresh!', {
          description: `Your handle is the same on-chain - no new transactions detected. Still holding ${formatBalance(cachedAmount)} USDBagel, fully encrypted and secure!`,
          duration: 4000,
        });
        return false;
      }
    } catch (e) {
      // Continue with decrypt if cache parse fails
    }
  }

  return true;
}

// Helper function to format relative time
function getRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// Sidebar navigation items
const navItems = [
  { icon: House, label: 'Home', href: '/dashboard', active: true },
  { icon: Users, label: 'Employer', href: '/employer' },
  { icon: PaperPlaneTilt, label: 'Employee', href: '/employee' },
];

// Privacy features
const privacyFeatures = [
  { icon: Fingerprint, label: 'FHE Encryption', enabled: true },
  { icon: EyeSlash, label: 'Stealth Addresses', enabled: true },
  { icon: LockSimple, label: 'Transaction Mixing', enabled: true },
  { icon: Eye, label: 'IP Masking', enabled: true },
];

// Payment Modal Component
interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeposit: (entryIndex: number, amount: number) => Promise<string>;
  businessEntryIndex: number | null;
  employees: Employee[];
  onBalanceUpdate?: () => void;
}

function PaymentModal({ isOpen, onClose, onDeposit, businessEntryIndex, employees, onBalanceUpdate }: PaymentModalProps) {
  const { address, signer } = useWallet();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');

  // Balance state
  const [encryptedHandle, setEncryptedHandle] = useState<bigint | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Load balance when modal opens
  useEffect(() => {
    async function loadBalance() {
      if (!isOpen || !address || !signer) {
        setEncryptedHandle(null);
        setDecryptedBalance(null);
        return;
      }

      setBalanceLoading(true);
      try {
        const cerc20 = getCerc20Contract(signer);
        const handle = await cerc20.confidentialBalanceOf(address);
        const handleBigInt = BigInt(handle.toString());
        if (handleBigInt !== BigInt(0)) {
          setEncryptedHandle(handleBigInt);

          // Check localStorage cache for this handle
          const cacheKey = `bagel_balance_${address}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const { handle: cachedHandle, amount: cachedAmount } = JSON.parse(cached);
              if (cachedHandle === handleBigInt.toString()) {
                console.log(`Using cached balance for handle ${handleBigInt.toString()}: ${cachedAmount} USDBagel`);
                setDecryptedBalance(cachedAmount);
              } else {
                console.log(`Handle changed (${cachedHandle} -> ${handleBigInt.toString()}), cache invalidated`);
                setDecryptedBalance(null);
              }
            } catch (e) {
              console.error('Failed to parse balance cache:', e);
              setDecryptedBalance(null);
            }
          } else {
            setDecryptedBalance(null);
          }
        }
      } catch (err) {
        console.error('Failed to load balance:', err);
      } finally {
        setBalanceLoading(false);
      }
    }
    loadBalance();
  }, [isOpen, address, signer]);

  // Decrypt balance via fhevmjs reencrypt
  const handleDecrypt = useCallback(async () => {
    if (!address || !signer) return;

    setDecrypting(true);
    setError('');

    try {
      const cerc20 = getCerc20Contract(signer);
      const currentHandle = BigInt((await cerc20.confidentialBalanceOf(address)).toString());
      if (currentHandle === BigInt(0)) {
        setError('No encrypted balance found');
        return;
      }

      setEncryptedHandle(currentHandle);

      // Check if handle has changed before decrypting
      if (!shouldDecryptHandle(currentHandle, address)) {
        setError('');
        return;
      }

      console.log(`Decrypting handle ${currentHandle.toString()} via fhEVM reencryption...`);
      const decrypted = await decryptValue(currentHandle, CERC20_ADDRESS, signer);
      const decryptedValue = Number(decrypted) / 1_000_000;
      setDecryptedBalance(decryptedValue);

      // Cache it
      const cacheKey = `bagel_balance_${address}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        handle: currentHandle.toString(),
        amount: decryptedValue,
      }));
      console.log(`Decrypt successful - ${decryptedValue} USDBagel`);

      onBalanceUpdate?.();
      setError('');
    } catch (err: any) {
      console.error('Decrypt failed:', err);
      setError(err.message || 'Failed to decrypt balance. Please try again.');
    } finally {
      setDecrypting(false);
    }
  }, [address, signer, onBalanceUpdate]);

  // Calculate projected earnings (mock 10% APR)
  const projectedEarnings = amount ? {
    daily: formatBalance(parseFloat(amount) * 0.10 / 365),
    monthly: formatBalance(parseFloat(amount) * 0.10 / 12),
    yearly: formatBalance(parseFloat(amount) * 0.10),
  } : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTxid('');

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);

      if (businessEntryIndex === null) {
        setError('Business not registered yet. Please register your business first.');
        return;
      }
      const amountUnits = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
      const signature = await onDeposit(businessEntryIndex, Number(amountUnits));
      setTxid(signature);
      setAmount('');
    } catch (err: any) {
      console.error('Deposit error:', err);
      setError(err.message || 'Failed to deposit funds');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setTxid('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg mx-4 bg-white rounded shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-bagel-dark">Deposit</h2>
                <p className="text-sm text-gray-500">Deposit your confidential assets</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* APR Banner */}
              <div className="flex items-center justify-between p-4 bg-bagel-cream border border-bagel-orange/20 rounded">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-bagel-orange/10 rounded flex items-center justify-center">
                    <ChartBar className="w-5 h-5 text-bagel-orange" weight="fill" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-bagel-dark/70 uppercase tracking-wide">Earn While Shielded</div>
                    <div className="text-lg font-bold text-bagel-dark">10% APR</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Paid to employees</div>
                  <div className="text-sm font-medium text-bagel-dark">Per-second streaming</div>
                </div>
              </div>

              {/* Available Balance */}
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Your Balance:</span>
                    {balanceLoading ? (
                      <CircleNotch className="w-3 h-3 animate-spin text-gray-400" />
                    ) : decryptedBalance !== null ? (
                      <span className="text-sm font-semibold text-green-600 flex items-center gap-1">
                        <LockSimpleOpen className="w-3 h-3" />
                        {formatBalance(decryptedBalance)} USDBagel
                      </span>
                    ) : encryptedHandle ? (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <LockSimple className="w-3 h-3" />
                        ****
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No balance</span>
                    )}
                  </div>
                  {encryptedHandle && decryptedBalance === null && (
                    <button
                      type="button"
                      onClick={handleDecrypt}
                      disabled={decrypting}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-bagel-orange bg-white border border-bagel-orange/30 rounded hover:bg-bagel-orange/10 transition-colors disabled:opacity-50"
                    >
                      {decrypting ? (
                        <CircleNotch className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      {decrypting ? 'Decrypting...' : 'Show Balance'}
                    </button>
                  )}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deposit Amount
                </label>
                <div className="relative">
                  <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full pl-10 pr-24 py-3 bg-gray-50 border border-gray-200 rounded text-lg font-semibold focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-bagel-cream rounded flex items-center gap-1">
                    <span className="text-sm">&#x1F96F;</span>
                    <span className="text-xs font-semibold text-bagel-orange">USDBagel</span>
                  </div>
                </div>
              </div>

              {/* Projected Earnings */}
              {projectedEarnings && parseFloat(amount) > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-gray-50 rounded p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                    <ChartBar className="w-4 h-4 text-bagel-orange" />
                    Projected Vault Earnings (10% APR)
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-2 bg-white rounded border border-gray-100">
                      <div className="text-xs text-gray-500">Daily</div>
                      <div className="text-sm font-bold text-green-600">+{projectedEarnings.daily}</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded border border-gray-100">
                      <div className="text-xs text-gray-500">Monthly</div>
                      <div className="text-sm font-bold text-green-600">+{projectedEarnings.monthly}</div>
                    </div>
                    <div className="text-center p-2 bg-white rounded border border-gray-100">
                      <div className="text-xs text-gray-500">Yearly</div>
                      <div className="text-sm font-bold text-green-600">+{projectedEarnings.yearly}</div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Vault Info */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-bagel-orange/10 rounded flex items-center justify-center">
                    <LockSimple className="w-4 h-4 text-bagel-orange" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-bagel-dark">Vault Secured</div>
                    <div className="text-[10px] text-gray-500">Zama fhEVM</div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 text-right max-w-[180px]">
                  Tokens are FHE-encrypted on-chain
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded">
                  <Warning className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div>
                    <div className="text-sm font-medium text-red-800">Error</div>
                    <div className="text-xs text-red-700">{error}</div>
                  </div>
                </div>
              )}

              {/* Success Display */}
              {txid && (
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-800">Deposit Shielded!</div>
                    <div className="text-xs text-green-700 mt-1">Funds encrypted and deposited to vault</div>
                    <div className="text-xs text-green-700 break-all mt-1 font-mono">{txid}</div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 mt-2 font-medium"
                    >
                      View on Explorer <ArrowSquareOut className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  {txid ? 'Close' : 'Cancel'}
                </button>
                {!txid && (
                  <motion.button
                    type="submit"
                    whileHover={{ scale: loading ? 1 : 1.01 }}
                    whileTap={{ scale: loading ? 1 : 0.99 }}
                    disabled={loading || !amount || businessEntryIndex === null}
                    className="flex-1 px-4 py-3 bg-bagel-orange text-white rounded text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <CircleNotch className="w-4 h-4 animate-spin" />
                        Shielding...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" weight="fill" />
                        Shield & Deposit
                      </>
                    )}
                  </motion.button>
                )}
              </div>

              {/* Terms */}
              <p className="text-xs text-gray-400 text-center">
                By depositing, you agree to our{' '}
                <Link href="/terms" className="text-bagel-orange hover:underline">
                  Terms & Conditions
                </Link>
              </p>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Transfer Modal Component
interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (recipientAddress: string, amount: number) => Promise<string>;
  onBalanceUpdate?: () => void;
}

function TransferModal({ isOpen, onClose, onTransfer, onBalanceUpdate }: TransferModalProps) {
  const { address, signer } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');

  // Balance state
  const [encryptedHandle, setEncryptedHandle] = useState<bigint | null>(null);
  const [decryptedBalance, setDecryptedBalance] = useState<number | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState(0);

  // Load balance when modal opens or after transfer
  const loadBalance = useCallback(async () => {
    if (!isOpen || !address || !signer) {
      setEncryptedHandle(null);
      setDecryptedBalance(null);
      return;
    }

    setBalanceLoading(true);
    try {
      const cerc20 = getCerc20Contract(signer);
      const handle = BigInt((await cerc20.confidentialBalanceOf(address)).toString());
      if (handle !== BigInt(0)) {
        setEncryptedHandle(handle);

        // Check localStorage cache for this handle
        const cacheKey = `bagel_balance_${address}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { handle: cachedHandle, amount: cachedAmount } = JSON.parse(cached);
            if (cachedHandle === handle.toString()) {
              console.log(`Using cached balance for handle ${handle.toString()}: ${cachedAmount} USDBagel`);
              setDecryptedBalance(cachedAmount);
            } else {
              console.log(`Handle changed (${cachedHandle} -> ${handle.toString()}), cache invalidated`);
              setDecryptedBalance(null);
            }
          } catch (e) {
            console.error('Failed to parse balance cache:', e);
            setDecryptedBalance(null);
          }
        } else {
          setDecryptedBalance(null);
        }
      }
    } catch (err) {
      console.error('Failed to load balance:', err);
    } finally {
      setBalanceLoading(false);
    }
  }, [isOpen, address, signer]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance, balanceRefreshTrigger]);

  // Decrypt balance via fhevmjs reencrypt
  const handleDecrypt = useCallback(async () => {
    if (!address || !signer) return;

    setDecrypting(true);
    setError('');

    try {
      const cerc20 = getCerc20Contract(signer);
      const currentHandle = BigInt((await cerc20.confidentialBalanceOf(address)).toString());
      if (currentHandle === BigInt(0)) {
        setError('No encrypted balance found');
        return;
      }

      setEncryptedHandle(currentHandle);

      if (!shouldDecryptHandle(currentHandle, address)) {
        setError('');
        return;
      }

      console.log(`Decrypting handle ${currentHandle.toString()} via fhEVM reencryption...`);
      const decrypted = await decryptValue(currentHandle, CERC20_ADDRESS, signer);
      const decryptedVal = Number(decrypted) / 1_000_000;
      setDecryptedBalance(decryptedVal);

      const cacheKey = `bagel_balance_${address}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        handle: currentHandle.toString(),
        amount: decryptedVal,
      }));
      console.log(`Decrypt successful - ${decryptedVal} USDBagel`);

      onBalanceUpdate?.();
      setError('');
    } catch (err: any) {
      console.error('Decrypt failed:', err);
      setError(err.message || 'Failed to decrypt balance. Please try again.');
    } finally {
      setDecrypting(false);
    }
  }, [address, signer, onBalanceUpdate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTxid('');

    if (!recipient || recipient.length < 10 || !recipient.startsWith('0x')) {
      setError('Please enter a valid Ethereum wallet address (0x...)');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      const signature = await onTransfer(recipient, parseFloat(amount));
      setTxid(signature);
      setAmount('');
      setRecipient('');
      // Refresh balance after successful transfer
      setTimeout(() => {
        setBalanceRefreshTrigger(prev => prev + 1);
      }, 2000);
    } catch (err: any) {
      console.error('Transfer error:', err);
      setError(err.message || 'Failed to transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setTxid('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg mx-4 bg-white rounded shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-bagel-dark">Transfer</h2>
                <p className="text-sm text-gray-500">Send confidential tokens</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Available Balance */}
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Available Balance:</span>
                    {balanceLoading ? (
                      <CircleNotch className="w-3 h-3 animate-spin text-gray-400" />
                    ) : decryptedBalance !== null ? (
                      <span className="text-sm font-semibold text-green-600 flex items-center gap-1">
                        <LockSimpleOpen className="w-3 h-3" />
                        {formatBalance(decryptedBalance)} USDBagel
                      </span>
                    ) : encryptedHandle ? (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <LockSimple className="w-3 h-3" />
                        ****
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No balance</span>
                    )}
                  </div>
                  {encryptedHandle && decryptedBalance === null && (
                    <button
                      type="button"
                      onClick={handleDecrypt}
                      disabled={decrypting}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-bagel-orange bg-white border border-bagel-orange/30 rounded hover:bg-bagel-orange/10 transition-colors disabled:opacity-50"
                    >
                      {decrypting ? (
                        <CircleNotch className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      {decrypting ? 'Decrypting...' : 'Show Balance'}
                    </button>
                  )}
                </div>
              </div>

              {/* Recipient Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Enter Ethereum wallet address (0x...)"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20 font-mono"
                />
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount
                </label>
                <div className="relative">
                  <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full pl-10 pr-24 py-3 bg-gray-50 border border-gray-200 rounded text-lg font-semibold focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-bagel-cream rounded flex items-center gap-1">
                    <span className="text-sm">&#x1F96F;</span>
                    <span className="text-xs font-semibold text-bagel-orange">USDBagel</span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-bagel-orange/10 rounded flex items-center justify-center">
                    <LockSimple className="w-4 h-4 text-bagel-orange" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-bagel-dark">Confidential Transfer</div>
                    <div className="text-[10px] text-gray-500">FHE encrypted on Zama fhEVM</div>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded">
                  <Warning className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div>
                    <div className="text-sm font-medium text-red-800">Error</div>
                    <div className="text-xs text-red-700">{error}</div>
                  </div>
                </div>
              )}

              {/* Success Display */}
              {txid && (
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-800">Transfer Complete!</div>
                    <div className="text-xs text-green-700 mt-1">Tokens sent successfully</div>
                    <div className="text-xs text-green-700 break-all mt-1 font-mono">{txid}</div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 mt-2 font-medium"
                    >
                      View on Explorer <ArrowSquareOut className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  {txid ? 'Close' : 'Cancel'}
                </button>
                {!txid && (
                  <motion.button
                    type="submit"
                    whileHover={{ scale: loading ? 1 : 1.01 }}
                    whileTap={{ scale: loading ? 1 : 0.99 }}
                    disabled={loading || !recipient || !amount}
                    className="flex-1 px-4 py-3 bg-bagel-orange text-white rounded text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <CircleNotch className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <PaperPlaneTilt className="w-4 h-4" weight="fill" />
                        Send Transfer
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Add Employee Modal Component
interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEmployee: (walletAddress: string, salaryPerSecond: number, name: string) => Promise<{ txid: string; employeeIndex: number }>;
  businessEntryIndex: number | null;
}

function AddEmployeeModal({ isOpen, onClose, onAddEmployee, businessEntryIndex }: AddEmployeeModalProps) {
  const [name, setName] = useState('');
  const [wallet, setWallet] = useState('');
  const [salary, setSalary] = useState('');
  const [currency, setCurrency] = useState('USDBagel');
  const [paymentFrequency, setPaymentFrequency] = useState<'monthly' | 'bi-weekly' | 'weekly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [employeeIndex, setEmployeeIndex] = useState<number | null>(null);

  const currencies = [
    { symbol: 'USDBagel', name: 'USD Bagel', icon: '\u{1F96F}' },
  ];

  // Convert salary to per-second rate based on frequency
  const calculateSalaryPerSecond = (monthlySalary: number, frequency: string): number => {
    let annualSalary: number;
    switch (frequency) {
      case 'weekly':
        annualSalary = monthlySalary * 52;
        break;
      case 'bi-weekly':
        annualSalary = monthlySalary * 26;
        break;
      default: // monthly
        annualSalary = monthlySalary * 12;
    }
    // Seconds in a year: 365.25 * 24 * 60 * 60 = 31,557,600
    return annualSalary / 31557600;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTxid('');

    if (businessEntryIndex === null) {
      setError('Business not registered yet. Please register your business first.');
      return;
    }

    if (!wallet) {
      setError('Please enter a wallet address');
      return;
    }

    if (!salary || parseFloat(salary) <= 0) {
      setError('Please enter a valid salary amount');
      return;
    }

    // Validate Ethereum address
    if (!wallet.startsWith('0x') || wallet.length !== 42) {
      setError('Invalid Ethereum wallet address. Must start with 0x and be 42 characters.');
      return;
    }

    try {
      setLoading(true);
      const salaryPerSecond = calculateSalaryPerSecond(parseFloat(salary), paymentFrequency);
      // Convert to 6 decimal units
      const salaryUnits = BigInt(Math.floor(salaryPerSecond * 1_000_000));

      const result = await onAddEmployee(wallet, Number(salaryUnits), name || `Employee`);
      setTxid(result.txid);
      setEmployeeIndex(result.employeeIndex);
    } catch (err: any) {
      console.error('Add employee error:', err);
      setError(err.message || 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    setTxid('');
    setEmployeeIndex(null);
    if (txid) {
      // Reset form only on successful add
      setName('');
      setWallet('');
      setSalary('');
      setCurrency('USDBagel');
      setPaymentFrequency('monthly');
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg mx-4 bg-white rounded shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-bagel-orange/10 rounded flex items-center justify-center">
                  <Users className="w-5 h-5 text-bagel-orange" weight="fill" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-bagel-dark">Add Employee</h2>
                  <p className="text-sm text-gray-500">Set up payroll for a new team member</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Employee Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Employee Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter employee name"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                  />
                </div>
              </div>

              {/* Wallet Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Wallet Address
                </label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    placeholder="Enter Ethereum wallet address (0x...)"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                  />
                </div>
              </div>

              {/* Salary & Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Salary Amount
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <CurrencyDollar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      value={salary}
                      onChange={(e) => setSalary(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="appearance-none w-28 px-4 py-3 bg-gray-50 border border-gray-200 rounded text-sm font-medium focus:outline-none focus:border-bagel-orange cursor-pointer"
                    >
                      {currencies.map((c) => (
                        <option key={c.symbol} value={c.symbol}>
                          {c.icon} {c.symbol}
                        </option>
                      ))}
                    </select>
                    <CaretDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Payment Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Frequency
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'bi-weekly', label: 'Bi-weekly' },
                    { value: 'weekly', label: 'Weekly' },
                  ].map((freq) => (
                    <button
                      key={freq.value}
                      type="button"
                      onClick={() => setPaymentFrequency(freq.value as typeof paymentFrequency)}
                      className={`flex items-center justify-center gap-2 p-3 border rounded transition-all ${
                        paymentFrequency === freq.value
                          ? 'border-bagel-orange bg-bagel-orange/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <CalendarBlank className={`w-4 h-4 ${
                        paymentFrequency === freq.value ? 'text-bagel-orange' : 'text-gray-500'
                      }`} />
                      <span className={`text-sm font-medium ${
                        paymentFrequency === freq.value ? 'text-bagel-dark' : 'text-gray-600'
                      }`}>{freq.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded">
                <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" weight="fill" />
                <div>
                  <div className="text-sm font-medium text-green-800">Privacy Protected</div>
                  <div className="text-xs text-green-700">
                    All payroll transactions for this employee will be processed with maximum privacy.
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded">
                  <Warning className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div>
                    <div className="text-sm font-medium text-red-800">Error</div>
                    <div className="text-xs text-red-700">{error}</div>
                  </div>
                </div>
              )}

              {/* Success Display */}
              {txid && (
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" weight="fill" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-800">Employee Added Successfully!</div>
                    <div className="text-xs text-green-700 mt-1">
                      Employee Index: <span className="font-mono">{employeeIndex}</span>
                    </div>
                    <div className="text-xs text-green-700 break-all mt-1">{txid}</div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 mt-2 font-medium"
                    >
                      View on Explorer <ArrowSquareOut className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  {txid ? 'Close' : 'Cancel'}
                </button>
                {!txid && (
                  <motion.button
                    type="submit"
                    whileHover={{ scale: loading ? 1 : 1.01 }}
                    whileTap={{ scale: loading ? 1 : 0.99 }}
                    disabled={loading || businessEntryIndex === null}
                    className="flex-1 px-4 py-3 bg-bagel-orange text-white rounded text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <CircleNotch className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Users className="w-4 h-4" weight="fill" />
                        Add Employee
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Mint Tokens Section Component
interface MintTokensSectionProps {
  onMint: (amount: number) => Promise<{ txid: string; amount: number }>;
}

function MintTokensSection({ onMint }: MintTokensSectionProps) {
  const [amount, setAmount] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [mintedAmount, setMintedAmount] = useState(0);

  const presetAmounts = [10, 50, 100, 500, 1000];

  const handleMint = async () => {
    setError('');
    setTxid('');

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      const result = await onMint(amountNum);
      setTxid(result.txid);
      setMintedAmount(result.amount);
    } catch (err: any) {
      console.error('Mint error:', err);
      setError(err.message || 'Failed to mint tokens');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-200 rounded overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-bagel-cream rounded flex items-center justify-center">
            <Lightning className="w-5 h-5 text-bagel-orange" weight="fill" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-bagel-dark">Mint Test Tokens</h3>
            <p className="text-xs text-gray-500">Get USDBagel for the demo</p>
          </div>
        </div>
        <span className="px-2 py-1 bg-bagel-cream text-bagel-orange text-xs font-medium rounded">
          Testnet
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium text-bagel-dark mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="w-full px-4 py-3 border border-gray-200 rounded bg-gray-50 focus:outline-none focus:border-bagel-orange focus:bg-white text-lg font-mono text-bagel-dark transition-colors"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
              USDB
            </div>
          </div>
        </div>

        {/* Preset Amounts */}
        <div className="flex flex-wrap gap-2">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(preset.toString())}
              className={`px-3 py-1.5 text-sm rounded transition-all ${
                amount === preset.toString()
                  ? 'bg-bagel-orange text-white'
                  : 'bg-gray-50 border border-gray-200 text-gray-600 hover:border-bagel-orange hover:text-bagel-orange'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-3 p-3 bg-bagel-cream/50 rounded">
          <ShieldCheck className="w-4 h-4 text-bagel-orange flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600">
            <span className="font-medium text-bagel-dark">FHE Encrypted:</span> Token amounts are encrypted on-chain using Zama's Fully Homomorphic Encryption.
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded">
            <Warning className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" weight="fill" />
            <div>
              <p className="text-sm font-medium text-red-800">Transaction Failed</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Success Display */}
        {txid && (
          <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" weight="fill" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800">
                {formatBalance(mintedAmount)} USDBagel Minted
              </p>
              <code className="block text-xs text-green-600 mt-1 truncate">{txid}</code>
              <a
                href={`https://sepolia.etherscan.io/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 mt-2 font-medium"
              >
                View on Explorer <ArrowSquareOut className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Mint Button */}
        <motion.button
          whileHover={{ scale: loading ? 1 : 1.01 }}
          whileTap={{ scale: loading ? 1 : 0.99 }}
          onClick={handleMint}
          disabled={loading}
          className="w-full px-4 py-3 bg-bagel-orange text-white rounded font-medium flex items-center justify-center gap-2 hover:bg-bagel-orange/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <CircleNotch className="w-4 h-4 animate-spin" />
              Minting tokens...
            </>
          ) : (
            <>
              <Lightning className="w-4 h-4" weight="fill" />
              Mint {amount || '0'} USDBagel
            </>
          )}
        </motion.button>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
          <span>CERC20 Token Contract</span>
          <code className="bg-white px-1.5 py-0.5 rounded text-gray-500">{CERC20_ADDRESS ? CERC20_ADDRESS.slice(0, 16) + '...' : 'Not configured'}</code>
        </div>
      </div>
    </motion.div>
  );
}

// Employee interface for type safety
interface Employee {
  id: number;
  employeeIndex: number;
  initials: string;
  name: string;
  date: string;
  wallet: string;
  fullWallet: string;
  amount: number;
  currency: string;
  privacy: 'Standard' | 'Enhanced' | 'Maximum';
  status: 'Pending' | 'Paid' | 'Processing';
  txid?: string;
}

// LocalStorage key for employees
const EMPLOYEES_STORAGE_KEY = 'bagel_employees';

export default function Dashboard() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'employer' | 'employee'>('employer');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const { address, signer } = useWallet();
  const connected = !!address;
  const bagel = useBagel();

  // Handle ?transfer=true query parameter to open transfer modal
  useEffect(() => {
    if (router.query.transfer === 'true' && connected) {
      setIsTransferModalOpen(true);
      router.replace('/dashboard', undefined, { shallow: true });
    }
  }, [router.query.transfer, connected, router]);

  // Business state
  const [businessEntryIndex, setBusinessEntryIndex] = useState<number | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationTxid, setRegistrationTxid] = useState('');

  // Payroll business state
  const [payrollBusiness, setPayrollBusiness] = useState<any>(null);

  // Employees state (loaded from localStorage)
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);

  // Navbar balance state
  const [navbarEncryptedHandle, setNavbarEncryptedHandle] = useState<bigint | null>(null);
  const [navbarDecryptedBalance, setNavbarDecryptedBalance] = useState<number | null>(null);
  const [navbarDecrypting, setNavbarDecrypting] = useState(false);
  const [navbarBalanceRefreshTrigger, setNavbarBalanceRefreshTrigger] = useState(0);

  // Employee claim state (for users who are employees of a business)
  const [employeeData, setEmployeeData] = useState<{
    employerAddress: string;
    businessIndex: number;
    employeeIndex: number;
    isActive: boolean;
  } | null>(null);
  const [employeeClaimAmount, setEmployeeClaimAmount] = useState('1');
  const [employeeClaiming, setEmployeeClaiming] = useState(false);
  const [employeeClaimTxid, setEmployeeClaimTxid] = useState('');
  const [employeeClaimError, setEmployeeClaimError] = useState('');
  // Employee accrued salary decryption
  const [employeeDecryptedAccrued, setEmployeeDecryptedAccrued] = useState<bigint | null>(null);
  const [employeeDecryptedSalaryRate, setEmployeeDecryptedSalaryRate] = useState<bigint | null>(null);
  const [employeeDecrypting, setEmployeeDecrypting] = useState(false);

  // Load employees from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && address) {
      const storageKey = `${EMPLOYEES_STORAGE_KEY}_${address}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Employee[];
          setEmployees(parsed);
          setEmployeeCount(parsed.length);
        } catch (e) {
          console.error('Failed to parse stored employees:', e);
        }
      }
    }
  }, [address]);

  // Save employees to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && address && employees.length > 0) {
      const storageKey = `${EMPLOYEES_STORAGE_KEY}_${address}`;
      localStorage.setItem(storageKey, JSON.stringify(employees));
    }
  }, [employees, address]);

  // Load business index when wallet connects
  useEffect(() => {
    if (address && signer) {
      loadBusinessIndex();
      loadPayrollBusinessData();
    } else {
      setBusinessEntryIndex(null);
      setEmployees([]);
      setEmployeeCount(0);
      setPayrollBusiness(null);
    }
  }, [address, signer]);

  // Decrypt employee's accrued salary
  const handleDecryptEmployeeAccrued = useCallback(async () => {
    if (!employeeData || !signer || !address) {
      toast.error('No employee data available');
      return;
    }

    setEmployeeDecrypting(true);
    try {
      const payroll = getPayrollContract(signer);

      // Get encrypted handles from contract
      const accruedHandle = BigInt((await payroll.getEncryptedAccrued(employeeData.businessIndex, employeeData.employeeIndex)).toString());
      const salaryHandle = BigInt((await payroll.getEncryptedSalary(employeeData.businessIndex, employeeData.employeeIndex)).toString());

      console.log('Employee decrypt handles:', { accruedHandle: accruedHandle.toString(), salaryHandle: salaryHandle.toString() });

      if (accruedHandle === BigInt(0) && salaryHandle === BigInt(0)) {
        toast.info('No accrued salary yet. Your employer may not have started streaming payments.', { duration: 5000 });
        setEmployeeDecryptedAccrued(BigInt(0));
        setEmployeeDecryptedSalaryRate(BigInt(0));
        return;
      }

      // Decrypt via fhEVM reencryption
      if (salaryHandle !== BigInt(0)) {
        console.log('Decrypting salary rate...');
        const salaryValue = await decryptValue(salaryHandle, PAYROLL_ADDRESS, signer);
        setEmployeeDecryptedSalaryRate(salaryValue);

        const salaryPerSecond = Number(salaryValue) / 1_000_000;
        const salaryPerMonth = salaryPerSecond * 30 * 24 * 60 * 60;
        console.log(`Salary Rate: ${salaryPerMonth.toFixed(2)} USDBagel/month`);
      }

      if (accruedHandle !== BigInt(0)) {
        console.log('Decrypting accrued balance...');
        const accruedValue = await decryptValue(accruedHandle, PAYROLL_ADDRESS, signer);
        setEmployeeDecryptedAccrued(accruedValue);

        const accruedAmount = Number(accruedValue) / 1_000_000;
        console.log(`Accrued: ${accruedAmount.toFixed(4)} USDBagel`);
      } else {
        setEmployeeDecryptedAccrued(BigInt(0));
      }

      toast.success('Salary data decrypted!', { duration: 3000 });
    } catch (e: any) {
      console.error('Decrypt employee accrued failed:', e);
      if (e.message?.includes('User rejected') || e.message?.includes('denied')) {
        toast.error('Signature request denied');
      } else {
        toast.error(`Decryption failed: ${e.message || 'Unknown error'}`);
      }
    } finally {
      setEmployeeDecrypting(false);
    }
  }, [employeeData, signer, address]);

  // Load payroll business data
  const loadPayrollBusinessData = async () => {
    if (!signer || !address) return;
    try {
      const nextIdx = await getNextBusinessIndex(signer);
      if (nextIdx > 0) {
        // Try to load the most recent business
        const info = await getBusinessInfo(signer, nextIdx - 1);
        setPayrollBusiness({
          isActive: info.isActive,
          employeeCount: info.nextEmployeeIndex,
          totalDeposited: 0, // Not directly available from contract view
        });
      }
    } catch (err) {
      console.error('Error loading payroll business:', err);
    }
  };

  // Check if current wallet is an employee of any business
  const checkEmployeeStatus = useCallback(async () => {
    if (!address || !signer) return;

    try {
      // Check localStorage first for faster load
      const storageKey = `bagel_employee_${address}`;
      const savedEmployeeData = localStorage.getItem(storageKey);

      if (savedEmployeeData) {
        try {
          const parsed = JSON.parse(savedEmployeeData);
          const empInfo = await getEmployeeInfo(signer, parsed.businessIndex, parsed.employeeIndex);

          if (empInfo && empInfo.isActive) {
            setEmployeeData({
              employerAddress: parsed.employerAddress,
              businessIndex: parsed.businessIndex,
              employeeIndex: parsed.employeeIndex,
              isActive: empInfo.isActive,
            });
            console.log(`Loaded employee data from localStorage`);
            return;
          }
        } catch (e) {
          localStorage.removeItem(storageKey);
        }
      }

      // EVM contracts don't support enumeration by default.
      // Employee status needs to be manually registered via the employee page.
      console.log('No employee record found in localStorage for this wallet');
    } catch (err) {
      console.error('Error checking employee status:', err);
    }
  }, [address, signer]);

  // Auto-check employee status when wallet connects
  useEffect(() => {
    setEmployeeData(null);
    setEmployeeClaimAmount('1');
    setEmployeeClaiming(false);
    setEmployeeClaimTxid('');
    setEmployeeClaimError('');
    setEmployeeDecryptedAccrued(null);
    setEmployeeDecryptedSalaryRate(null);
    setEmployeeDecrypting(false);

    if (address && signer) {
      checkEmployeeStatus();
    }
  }, [address, signer, checkEmployeeStatus]);

  // Handle employee claim (withdrawal)
  const handleEmployeeClaim = async () => {
    if (!address || !signer || !employeeData) {
      setEmployeeClaimError('Wallet not connected or employee data missing');
      return;
    }

    const amount = parseFloat(employeeClaimAmount);
    if (isNaN(amount) || amount <= 0) {
      setEmployeeClaimError('Please enter a valid amount');
      return;
    }

    try {
      setEmployeeClaiming(true);
      setEmployeeClaimError('');
      setEmployeeClaimTxid('');

      console.log('Claiming salary...');
      console.log('   Employee Index:', employeeData.employeeIndex);

      const amountUnits = BigInt(Math.floor(amount * 1_000_000));
      const tx = await requestWithdrawalTx(signer, employeeData.businessIndex, employeeData.employeeIndex, amountUnits);
      await tx.wait();

      setEmployeeClaimTxid(tx.hash);
      console.log('Claim successful:', tx.hash);

      // Refresh balance
      setNavbarBalanceRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Claim failed:', err);
      setEmployeeClaimError(err.message || 'Failed to claim salary');
    } finally {
      setEmployeeClaiming(false);
    }
  };

  const loadBusinessIndex = async () => {
    if (!signer) return;
    try {
      const index = await getNextBusinessIndex(signer);
      if (index > 0) {
        setBusinessEntryIndex(index - 1);
      } else {
        setBusinessEntryIndex(null);
      }
    } catch (err) {
      console.log('No business registered yet');
      setBusinessEntryIndex(null);
    }
  };

  // Register business
  const handleRegisterBusiness = async () => {
    if (!address || !signer) {
      setRegistrationError('Please connect your wallet');
      return;
    }

    try {
      setIsRegistering(true);
      setRegistrationError('');
      setRegistrationTxid('');

      console.log('Registering business on Payroll contract...');
      const tx = await registerBusinessTx(signer);
      await tx.wait();
      console.log('Business registered!');

      setRegistrationTxid(tx.hash);
      setBusinessEntryIndex(0);

      // Refresh payroll business data
      await loadPayrollBusinessData();
    } catch (err: any) {
      console.error('Registration error:', err);
      setRegistrationError(err.message || 'Failed to register business');
    } finally {
      setIsRegistering(false);
    }
  };

  // Load navbar balance
  const loadNavbarBalance = useCallback(async () => {
    if (!address || !signer) {
      setNavbarEncryptedHandle(null);
      setNavbarDecryptedBalance(null);
      return;
    }

    try {
      const cerc20 = getCerc20Contract(signer);
      const handle = BigInt((await cerc20.confidentialBalanceOf(address)).toString());
      if (handle !== BigInt(0)) {
        setNavbarEncryptedHandle(handle);

        // Check localStorage cache
        const cacheKey = `bagel_balance_${address}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { handle: cachedHandle, amount: cachedAmount } = JSON.parse(cached);
            if (cachedHandle === handle.toString()) {
              setNavbarDecryptedBalance(cachedAmount);
            } else {
              setNavbarDecryptedBalance(null);
            }
          } catch (e) {
            setNavbarDecryptedBalance(null);
          }
        } else {
          setNavbarDecryptedBalance(null);
        }
      }
    } catch (err) {
      console.error('Failed to load navbar balance:', err);
    }
  }, [address, signer]);

  // Load navbar balance on mount and when trigger changes
  useEffect(() => {
    loadNavbarBalance();
  }, [loadNavbarBalance, navbarBalanceRefreshTrigger]);

  // Decrypt navbar balance via fhEVM reencryption
  const handleNavbarDecrypt = async () => {
    if (!address || !signer) return;

    setNavbarDecrypting(true);

    try {
      const cerc20 = getCerc20Contract(signer);
      const currentHandle = BigInt((await cerc20.confidentialBalanceOf(address)).toString());
      if (currentHandle === BigInt(0)) {
        console.error('Handle is zero');
        return;
      }

      setNavbarEncryptedHandle(currentHandle);

      if (!shouldDecryptHandle(currentHandle, address)) {
        return;
      }

      console.log('Decrypting via fhEVM reencryption...');
      const decrypted = await decryptValue(currentHandle, CERC20_ADDRESS, signer);
      const decryptedVal = Number(decrypted) / 1_000_000;
      setNavbarDecryptedBalance(decryptedVal);

      const cacheKey = `bagel_balance_${address}`;
      localStorage.setItem(cacheKey, JSON.stringify({
        handle: currentHandle.toString(),
        amount: decryptedVal,
      }));
      console.log('Decrypt successful!');
    } catch (err: any) {
      console.error('Navbar decrypt failed:', err);
    } finally {
      setNavbarDecrypting(false);
    }
  };

  // Deposit funds
  const handleDeposit = useCallback(async (_entryIndex: number, amountUnits: number): Promise<string> => {
    if (!address || !signer) {
      throw new Error('Wallet not connected');
    }

    // Check if business is registered
    const nextIdx = await getNextBusinessIndex(signer);
    if (nextIdx === 0) {
      console.log('Business not registered. Registering now...');
      const regTx = await registerBusinessTx(signer);
      await regTx.wait();
      console.log('Business registered:', regTx.hash);
    } else {
      console.log('Business already registered');
    }

    // Deposit
    console.log('Depositing USDBagel via payroll contract...');
    const tx = await depositTx(signer, nextIdx > 0 ? nextIdx - 1 : 0, BigInt(amountUnits));
    await tx.wait();
    console.log('Deposit successful:', tx.hash);

    // Refresh payroll business data
    loadPayrollBusinessData();

    return tx.hash;
  }, [address, signer]);

  // Confidential transfer via CERC20
  const handleTransfer = useCallback(async (recipientAddress: string, amount: number): Promise<string> => {
    if (!address || !signer) {
      throw new Error('Wallet not connected');
    }

    console.log('Initiating confidential transfer...');
    console.log('   To:', recipientAddress);
    console.log('   Amount:', amount, 'USDBagel');

    const amountUnits = BigInt(Math.floor(amount * 1_000_000));
    const encrypted = await encryptValue(CERC20_ADDRESS, address, amountUnits);

    const cerc20 = getCerc20Contract(signer);
    const tx = await cerc20.confidentialTransfer(recipientAddress, encrypted.handles[0], encrypted.inputProof);
    await tx.wait();

    console.log('Confidential transfer successful:', tx.hash);
    return tx.hash;
  }, [address, signer]);

  // Add employee
  const handleAddEmployee = useCallback(async (walletAddress: string, salaryUnits: number, employeeName: string): Promise<{ txid: string; employeeIndex: number }> => {
    if (!address || !signer) {
      throw new Error('Wallet not connected');
    }

    // Check if business is registered
    const nextIdx = await getNextBusinessIndex(signer);
    if (nextIdx === 0) {
      throw new Error('Please register your business first using the Deposit modal');
    }

    const businessIdx = nextIdx - 1;
    console.log('Adding employee via payroll contract...');

    const tx = await addEmployeeTx(signer, businessIdx, walletAddress, BigInt(salaryUnits));
    await tx.wait();
    console.log('Employee added!');

    // Get the employee index
    const bizInfo = await getBusinessInfo(signer, businessIdx);
    const employeeIndex = bizInfo.nextEmployeeIndex - 1;

    // Also set the employee address
    try {
      const setAddrTx = await setEmployeeAddressTx(signer, businessIdx, employeeIndex, walletAddress);
      await setAddrTx.wait();
      console.log('Employee address set!');
    } catch (e) {
      console.warn('Could not set employee address (may already be set):', e);
    }

    // Generate initials from name
    const initials = employeeName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || walletAddress.slice(2, 4).toUpperCase();

    // Calculate annual salary from per-second rate (salaryUnits is in 6 decimal units)
    const salaryPerSecond = salaryUnits / 1_000_000;
    const annualSalary = salaryPerSecond * 31557600;

    // Add to local employees list
    const newEmployee: Employee = {
      id: Date.now(),
      employeeIndex,
      initials,
      name: employeeName || `Employee #${employeeIndex + 1}`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      wallet: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
      fullWallet: walletAddress,
      amount: annualSalary,
      currency: 'USDBagel',
      privacy: 'Maximum',
      status: 'Pending',
      txid: tx.hash,
    };
    setEmployees(prev => [newEmployee, ...prev]);
    setEmployeeCount(prev => prev + 1);

    toast.success('Employee added!', {
      description: `${employeeName || 'Employee'} added to confidential payroll`,
    });

    // Refresh payroll business data
    loadPayrollBusinessData();

    return { txid: tx.hash, employeeIndex };
  }, [address, signer]);

  // Mint test tokens via CERC20 mint
  const handleMint = useCallback(async (amount: number): Promise<{ txid: string; amount: number }> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }

    console.log('Requesting faucet tokens...');
    const res = await fetch('/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Faucet request failed');
    }
    console.log('Tokens minted via faucet:', data.amount);
    return { txid: data.txHash, amount: 10000 };
  }, [address]);

  // Pay employee via confidential transfer
  const [payingEmployee, setPayingEmployee] = useState<number | null>(null);
  const handlePayEmployeeAction = useCallback(async (employee: Employee) => {
    if (!address || !signer) {
      toast.error('Wallet not connected');
      return;
    }

    if (!employee.fullWallet) {
      toast.error('Employee wallet address not found');
      return;
    }

    const monthlyAmount = (employee.amount || 0) / 12;
    if (monthlyAmount <= 0) {
      toast.error('Invalid payment amount');
      return;
    }

    setPayingEmployee(employee.id);

    try {
      console.log('Paying employee via confidential token transfer...');
      console.log(`   Employee: ${employee.name} (${employee.fullWallet})`);
      console.log(`   Amount: ${monthlyAmount} USDBagel`);

      const amountUnits = BigInt(Math.floor(monthlyAmount * 1_000_000));
      const encrypted = await encryptValue(CERC20_ADDRESS, address, amountUnits);

      const cerc20 = getCerc20Contract(signer);
      const tx = await cerc20.confidentialTransfer(employee.fullWallet, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      console.log('Employee paid!', tx.hash);

      // Update employee status
      setEmployees(prev => prev.map(e =>
        e.id === employee.id ? { ...e, status: 'Paid' as const } : e
      ));

      toast.success('Payment sent!', {
        description: `${formatBalance(monthlyAmount)} USDBagel sent to ${employee.name} (encrypted)`,
      });

      loadPayrollBusinessData();
    } catch (err: any) {
      console.error('Failed to pay employee:', err);
      toast.error('Payment failed', {
        description: err.message,
      });
    } finally {
      setPayingEmployee(null);
    }
  }, [address, signer]);

  // Recent transactions placeholder (no useRecentTransactions hook in EVM version)
  const recentTransactions: Array<{
    id: string;
    type: string;
    timestamp: number;
    direction: 'in' | 'out';
    amount: number;
    currency: string;
  }> = [];
  const txLoading = false;

  return (
    <>
      <Head>
        <title>Dashboard - Bagel</title>
        <meta name="description" content="Manage your private payroll operations" />
      </Head>

      <div className="flex h-screen bg-[#F7F7F2]">
        {/* ============================================
            SIDEBAR
        ============================================ */}
        <aside className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300`}>
          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-gray-100">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-bagel-orange rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">&#x1F96F;</span>
              </div>
              {!sidebarCollapsed && (
                <span className="text-lg font-semibold text-bagel-dark">Bagel</span>
              )}
            </Link>
          </div>

          {/* View Mode Switcher */}
          {!sidebarCollapsed && (
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex bg-gray-100 rounded p-0.5">
                <button
                  onClick={() => setViewMode('employer')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    viewMode === 'employer'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Employer
                </button>
                <button
                  onClick={() => setViewMode('employee')}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-all ${
                    viewMode === 'employee'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Employee
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          {!sidebarCollapsed && (
            <div className="px-4 py-4">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-12 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-200 rounded text-[10px] text-gray-500">
                  <Command className="w-3 h-3" />K
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded mb-1 transition-colors ${
                  item.active
                    ? 'bg-bagel-orange/10 text-bagel-orange'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-bagel-dark'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" weight={item.active ? 'fill' : 'regular'} />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </Link>
            ))}
          </nav>

          {/* Wallet Button */}
          <div className="p-4 border-t border-gray-100" data-guide="wallet-button">
            <WalletButton />
          </div>
        </aside>

        {/* ============================================
            MAIN CONTENT
        ============================================ */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
            <div>
              <h1 className="text-xl font-semibold text-bagel-dark">
                {viewMode === 'employer' ? 'Dashboard' : 'Employee Portal'}
              </h1>
              <p className="text-sm text-gray-500">
                {viewMode === 'employer' ? 'Manage your private payroll operations' : 'View and claim your salary'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Navbar Balance Display */}
              {connected && navbarEncryptedHandle && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Balance:</span>
                    {navbarDecryptedBalance !== null ? (
                      <span className="text-sm font-semibold text-bagel-orange">
                        {formatBalance(navbarDecryptedBalance)} USDBagel
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleNavbarDecrypt}
                    disabled={navbarDecrypting}
                    className="px-2 py-1 text-xs font-medium text-bagel-orange hover:bg-bagel-orange/10 rounded transition-colors disabled:opacity-50"
                    title={navbarDecryptedBalance !== null ? 'Refresh balance' : 'Decrypt balance'}
                  >
                    {navbarDecrypting ? 'Decrypting...' : navbarDecryptedBalance !== null ? 'Refresh' : 'Decrypt'}
                  </motion.button>
                </div>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative p-2 hover:bg-gray-50 rounded border border-gray-200 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-600" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsPaymentModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-bagel-orange text-white rounded font-medium text-sm"
                data-guide="new-payment"
              >
                <ShieldCheck className="w-4 h-4" weight="fill" />
                Deposit
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsTransferModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 border border-bagel-orange text-bagel-orange rounded font-medium text-sm hover:bg-bagel-orange/5"
              >
                <PaperPlaneTilt className="w-4 h-4" weight="fill" />
                Transfer
              </motion.button>
            </div>
          </header>

          {/* Content Area */}
          <main className="flex-1 overflow-auto p-6">
            {/* Employee View */}
            {viewMode === 'employee' && (
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Employee Info Card */}
                <div className="bg-white rounded border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Employment Info</h2>

                  {!connected ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">Connect your wallet to view your employment status</p>
                      <WalletButton />
                    </div>
                  ) : employeeData ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-3 border-b border-gray-100">
                        <span className="text-sm text-gray-500">Status</span>
                        <span className={`text-sm font-medium ${employeeData.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                          {employeeData.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-gray-100">
                        <span className="text-sm text-gray-500">Employee Index</span>
                        <span className="text-sm font-medium text-gray-900">#{employeeData.employeeIndex}</span>
                      </div>
                      <div className="flex items-center justify-between py-3 border-b border-gray-100">
                        <span className="text-sm text-gray-500">Payment Mode</span>
                        <span className="text-sm font-medium text-gray-900">
                          Per-second Streaming
                        </span>
                      </div>

                      {/* Accrued Salary */}
                      <div className="mt-6 p-4 bg-gray-50 rounded">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-700">Available to Claim</span>
                          {employeeDecryptedAccrued !== null ? (
                            <span className="text-lg font-semibold text-gray-900">
                              {formatBalance(Number(employeeDecryptedAccrued) / 1_000_000)} USDBagel
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Encrypted</span>
                          )}
                        </div>
                        <button
                          onClick={handleDecryptEmployeeAccrued}
                          disabled={employeeDecrypting}
                          className="w-full py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          {employeeDecrypting ? 'Decrypting...' : employeeDecryptedAccrued !== null ? 'Refresh' : 'Decrypt Balance'}
                        </button>
                      </div>

                      {/* Claim Form */}
                      <div className="mt-6 space-y-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Amount to Claim (USDBagel)
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          min="0"
                          value={employeeClaimAmount}
                          onChange={(e) => setEmployeeClaimAmount(e.target.value)}
                          placeholder="1.0"
                          className="w-full px-4 py-3 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange focus:ring-1 focus:ring-bagel-orange/20"
                        />
                        <button
                          onClick={handleEmployeeClaim}
                          disabled={employeeClaiming || !employeeData}
                          className="w-full py-3 bg-bagel-orange text-white font-medium rounded hover:bg-bagel-orange/90 transition-colors disabled:opacity-50"
                        >
                          {employeeClaiming ? 'Processing...' : 'Claim Salary'}
                        </button>

                        {employeeClaimError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                            {employeeClaimError}
                          </div>
                        )}

                        {employeeClaimTxid && (
                          <div className="p-3 bg-green-50 border border-green-100 rounded">
                            <div className="text-sm text-green-700 font-medium">Claim successful</div>
                            <a
                              href={`https://sepolia.etherscan.io/tx/${employeeClaimTxid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 mt-1"
                            >
                              View transaction <ArrowSquareOut className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 rounded text-sm text-gray-600">
                        No employment record found for this wallet. If you're an employee, ask your employer for your employee index and use the Employee page to register.
                      </div>
                      <Link
                        href="/employee"
                        className="block w-full py-3 text-center text-sm font-medium text-bagel-orange border border-bagel-orange rounded hover:bg-bagel-orange/5 transition-colors"
                      >
                        Go to Employee Registration
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Employer View */}
            {viewMode === 'employer' && (
            <div className="flex gap-6">
              {/* Left Column - Stats & Table */}
              <div className="flex-1 space-y-6">
                {/* Business Registration Banner - Only show if Payroll business not registered */}
                {connected && !payrollBusiness && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-bagel-orange/10 to-bagel-yellow/10 border border-bagel-orange/20 rounded p-6"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-bagel-dark flex items-center gap-2">
                          <span className="text-2xl">&#x1F96F;</span> Register Your Business
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Register your business on-chain to start managing confidential payroll.
                        </p>
                        <div className="mt-2 text-xs text-gray-500">
                          Payroll Contract: <code className="bg-white px-1.5 py-0.5 rounded">{PAYROLL_ADDRESS ? PAYROLL_ADDRESS.slice(0, 16) + '...' : 'Not configured'}</code>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleRegisterBusiness}
                        disabled={isRegistering}
                        className="px-6 py-3 bg-bagel-orange text-white rounded font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {isRegistering ? (
                          <>
                            <CircleNotch className="w-4 h-4 animate-spin" />
                            Setting up...
                          </>
                        ) : (
                          <>
                            <Vault className="w-4 h-4" weight="fill" />
                            Register Business
                          </>
                        )}
                      </motion.button>
                    </div>
                    {isRegistering && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-700">
                        Setting up your business... Please approve the transactions in your wallet.
                      </div>

                    )}
                    {registrationError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded text-sm text-red-700">
                        {registrationError}
                      </div>
                    )}
                    {registrationTxid && !isRegistering && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded">
                        <div className="text-sm text-green-700 font-medium">Business & Vault Setup Complete!</div>
                        <div className="text-xs text-green-600 mt-1 break-all">{registrationTxid}</div>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${registrationTxid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900 mt-2 font-medium"
                        >
                          View on Explorer <ArrowSquareOut className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-4" data-guide="stats">
                  {[
                    {
                      icon: Lightning,
                      value: connected && payrollBusiness ? '+1' : '--',
                      label: 'Business Registered',
                      badge: connected && payrollBusiness ? 'Active' : undefined,
                      positive: true,
                    },
                    {
                      icon: Users,
                      value: connected ? `${payrollBusiness?.employeeCount || employees.length}` : '--',
                      label: 'Total Employees',
                      change: (payrollBusiness?.employeeCount || employeeCount) > 0 ? `+${payrollBusiness?.employeeCount || employeeCount}` : undefined,
                      positive: true,
                    },
                    {
                      icon: Wallet,
                      value: connected ? `$${formatBalance(employees.reduce((sum, e) => sum + (e.amount || (e as any).salary || 0), 0))}` : '--',
                      label: 'Annual Payroll',
                      change: payrollBusiness?.totalDeposited > 0 ? `+${payrollBusiness.totalDeposited}` : undefined,
                      positive: true,
                    },
                    {
                      icon: ShieldCheck,
                      value: connected ? 'Active' : '--',
                      label: 'FHE Encryption',
                      badge: connected ? 'Zama fhEVM' : undefined,
                      positive: true,
                    },
                  ].map((stat: any, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="rounded p-5 border bg-white border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded flex items-center justify-center bg-bagel-cream">
                          <stat.icon className="w-5 h-5 text-bagel-orange" />
                        </div>
                        {stat.change && (
                          <div className={`flex items-center gap-0.5 text-xs font-medium ${stat.positive ? 'text-green-600' : 'text-red-500'}`}>
                            {stat.change}
                            <ArrowUpRight className="w-3 h-3" />
                          </div>
                        )}
                        {stat.badge && (
                          <span className="text-xs font-medium text-gray-500">{stat.badge}</span>
                        )}
                      </div>
                      <div className="text-2xl font-semibold mb-1 text-bagel-dark">{stat.value}</div>
                      <div className="text-sm text-gray-500">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-2 gap-4" data-guide="charts">
                  <PayrollChart />
                  <CryptoDistributionChart />
                </div>

                {/* Employees Table */}
                <div className="bg-white border border-gray-200 rounded" data-guide="employees">
                  {/* Table Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-bagel-dark">Employees</h2>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsAddEmployeeModalOpen(true)}
                        className="w-7 h-7 bg-bagel-orange text-white rounded flex items-center justify-center hover:bg-bagel-orange/90 transition-colors"
                        title="Add Employee"
                      >
                        <Plus className="w-4 h-4" weight="bold" />
                      </motion.button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search employees..."
                          className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded text-sm focus:outline-none focus:border-bagel-orange w-64"
                        />
                      </div>
                      <button className="p-2 hover:bg-gray-50 rounded border border-gray-200 transition-colors">
                        <Funnel className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Employee</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Wallet</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Amount</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Privacy</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee, i) => (
                        <motion.tr
                          key={employee.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 + i * 0.05 }}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-bagel-cream rounded-full flex items-center justify-center text-sm font-medium text-bagel-dark">
                                {employee.initials}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-bagel-dark">{employee.name}</div>
                                <div className="text-xs text-gray-500">{employee.date}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <code className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">{employee.wallet}</code>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-bagel-dark">${formatBalance(employee.amount || (employee as any).salary || 0)}</div>
                            <div className="text-xs text-gray-500">{employee.currency}</div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              employee.privacy === 'Maximum'
                                ? 'bg-green-100 text-green-700'
                                : employee.privacy === 'Enhanced'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              <Shield className="w-3 h-3" weight="fill" />
                              {employee.privacy}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              employee.status === 'Paid'
                                ? 'bg-green-100 text-green-700'
                                : employee.status === 'Pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {employee.status === 'Paid' && <CheckCircle className="w-3 h-3" weight="fill" />}
                              {employee.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => handlePayEmployeeAction(employee)}
                              disabled={payingEmployee === employee.id || employee.status === 'Paid'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                employee.status === 'Paid'
                                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                  : payingEmployee === employee.id
                                  ? 'bg-purple-100 text-purple-600'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {payingEmployee === employee.id ? (
                                <>
                                  <CircleNotch className="w-3 h-3 animate-spin" />
                                  Paying...
                                </>
                              ) : employee.status === 'Paid' ? (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  Paid
                                </>
                              ) : (
                                <>
                                  <CurrencyDollar className="w-3 h-3" />
                                  Pay
                                </>
                              )}
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column - Privacy Status & Transactions */}
              <div className="w-80 space-y-6">


                {/* Mint Tokens Section */}
                {connected && (
                  <MintTokensSection onMint={handleMint} />
                )}

                {/* Recent Transactions */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white border border-gray-200 rounded p-5"
                >
                  <h3 className="font-semibold text-bagel-dark mb-4">Recent Transactions</h3>

                  <div className="space-y-3">
                    {txLoading ? (
                      <div className="text-center py-4 text-gray-500 text-sm">Loading transactions...</div>
                    ) : recentTransactions.length === 0 ? (
                      <div className="text-center py-4 text-gray-500 text-sm">No recent transactions</div>
                    ) : (
                      recentTransactions.map((tx, i) => (
                        <motion.a
                          key={tx.id}
                          href={`https://sepolia.etherscan.io/tx/${tx.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.7 + i * 0.1 }}
                          className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 px-2 -mx-2 rounded transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <div>
                              <div className="text-sm font-medium text-bagel-dark group-hover:text-bagel-orange transition-colors">{tx.type}</div>
                              <div className="text-xs text-gray-500">{getRelativeTime(tx.timestamp)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-sm font-medium ${tx.direction === 'in' ? 'text-green-600' : 'text-bagel-dark'}`}>
                              {tx.direction === 'in' ? '+' : '-'}{tx.amount.toFixed(4)} {tx.currency}
                            </div>
                            <ArrowSquareOut className="w-3 h-3 text-gray-400 group-hover:text-bagel-orange transition-colors" />
                          </div>
                        </motion.a>
                      ))
                    )}
                  </div>

                  {connected && address && (
                    <a
                      href={`https://sepolia.etherscan.io/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full mt-4 py-2 text-sm text-bagel-orange font-medium hover:bg-bagel-orange/5 rounded transition-colors flex items-center justify-center gap-2"
                    >
                      View All Transactions
                      <ArrowSquareOut className="w-4 h-4" />
                    </a>
                  )}
                </motion.div>
              </div>
            </div>
            )}
          </main>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onDeposit={handleDeposit}
        businessEntryIndex={businessEntryIndex}
        employees={employees}
        onBalanceUpdate={() => setNavbarBalanceRefreshTrigger(prev => prev + 1)}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransfer={handleTransfer}
        onBalanceUpdate={() => setNavbarBalanceRefreshTrigger(prev => prev + 1)}
      />

      {/* Add Employee Modal */}
      <AddEmployeeModal
        isOpen={isAddEmployeeModalOpen}
        onClose={() => setIsAddEmployeeModalOpen(false)}
        onAddEmployee={handleAddEmployee}
        businessEntryIndex={businessEntryIndex}
      />

      {/* Toast Notifications */}
      <Toaster />
    </>
  );
}
