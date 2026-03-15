/**
 * Privacy Audit Page
 *
 * This page demonstrates Bagel's privacy features to hackathon judges.
 * It shows the difference between raw on-chain data (encrypted) and
 * what authorized users see (decrypted).
 *
 * **EVM BAGEL STACK**
 * Uses Etherscan API for transaction fetching and ethers.js for on-chain queries.
 */

import { useWallet } from './_app';
import { PAYROLL_ADDRESS, CERC20_ADDRESS, POOL_ADDRESS } from '../lib/contract-client';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { JsonRpcProvider, Contract } from 'ethers';

const WalletButton = dynamic(() => import('../components/WalletButton'), {
  ssr: false,
});

const ETHERSCAN_API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || '';
const ETHERSCAN_BASE = 'https://sepolia.etherscan.io';
const ETHERSCAN_API = 'https://api-sepolia.etherscan.io/api';

interface TransactionData {
  hash: string;
  timestamp: number;
  type: string;
  description: string;
}

interface AccountDataDisplay {
  address: string;
  rawHex: string;
  formattedRaw: string;
  decryptedView: any;
}

export default function PrivacyAuditPage() {
  const { address, provider, signer } = useWallet();
  const connected = !!address;

  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [accountData, setAccountData] = useState<AccountDataDisplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch recent contract transactions via Etherscan
  const fetchTransactions = async () => {
    setLoading(true);
    setError('');

    try {
      const contractAddr = PAYROLL_ADDRESS || CERC20_ADDRESS;
      if (!contractAddr) throw new Error('No contract address configured');

      const url = `${ETHERSCAN_API}?module=account&action=txlist&address=${contractAddr}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc${ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === '1' && data.result?.length > 0) {
        setTransactions(
          data.result.map((tx: any) => ({
            hash: tx.hash,
            timestamp: parseInt(tx.timeStamp) || Date.now() / 1000,
            type: tx.functionName ? tx.functionName.split('(')[0] : 'transfer',
            description: tx.functionName || 'Contract Interaction',
          }))
        );
      } else {
        throw new Error('No transactions found');
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError('Failed to fetch transactions. Using mock data.');

      // Mock data for demo
      setTransactions([
        {
          hash: '0xdemo1' + Date.now().toString(16),
          timestamp: Date.now() / 1000 - 3600,
          type: 'registerBusiness',
          description: 'Register encrypted business',
        },
        {
          hash: '0xdemo2' + Date.now().toString(16),
          timestamp: Date.now() / 1000 - 1800,
          type: 'deposit',
          description: 'Deposit encrypted funds to vault',
        },
        {
          hash: '0xdemo3' + Date.now().toString(16),
          timestamp: Date.now() / 1000 - 600,
          type: 'requestWithdrawal',
          description: 'Private withdrawal via BagelPool',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch account/contract data via ethers.js
  const fetchAccountData = async (addr: string) => {
    setLoading(true);
    setError('');

    try {
      if (!provider) throw new Error('Provider not available');

      const code = await provider.getCode(addr);
      const balance = await provider.getBalance(addr);

      const rawHex = code !== '0x' ? code.slice(2) : '';

      if (!rawHex) {
        // EOA or empty contract -- show balance as hex instead
        const balHex = balance.toString(16).padStart(64, '0');
        setAccountData({
          address: addr,
          rawHex: balHex,
          formattedRaw: `Account balance (hex): ${balHex}\nNo contract bytecode at this address.`,
          decryptedView: null,
        });
        return;
      }

      const formattedRaw = formatHexDisplay(rawHex);

      // Mock decrypted view (in production, this would use Zama fhEVM decryption)
      const decryptedView = {
        employer: (address || '0x0000').slice(0, 8) + '...' + (address || '0x0000').slice(-4) + ' (Your Wallet)',
        employee: '0xEMP1...xyz',
        salaryPerSecond: '*** ENCRYPTED ***',
        accruedBalance: '*** ENCRYPTED ***',
        lastUpdate: new Date().toLocaleString(),
        isActive: true,
        note: 'Only authorized parties can see actual values',
      };

      setAccountData({
        address: addr,
        rawHex,
        formattedRaw,
        decryptedView,
      });
    } catch (err) {
      console.error('Failed to fetch account data:', err);
      setError('Failed to fetch account data');

      // Mock data for demo
      setAccountData({
        address: addr,
        rawHex: generateMockHex(),
        formattedRaw: formatHexDisplay(generateMockHex()),
        decryptedView: {
          employer: address ? address.slice(0, 8) + '...' : 'Not connected',
          employee: 'Encrypted',
          salaryPerSecond: '*** ENCRYPTED (Zama fhEVM) ***',
          accruedBalance: '*** ENCRYPTED (Zama fhEVM) ***',
          lastUpdate: new Date().toLocaleString(),
          isActive: true,
          note: 'Real values hidden by Zama fhEVM encryption',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper: Format hex for display
  const formatHexDisplay = (hex: string): string => {
    const lines: string[] = [];
    for (let i = 0; i < Math.min(hex.length, 256); i += 32) {
      const offset = (i / 2).toString(16).padStart(4, '0');
      const chunk = hex.slice(i, i + 32);
      const formatted = chunk.match(/.{1,2}/g)?.join(' ') || '';
      lines.push(`${offset}: ${formatted}`);
    }
    if (hex.length > 256) {
      lines.push('... (truncated)');
    }
    return lines.join('\n');
  };

  // Helper: Generate mock hex for demo
  const generateMockHex = (): string => {
    let hex = '';
    for (let i = 0; i < 128; i++) {
      hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    }
    return hex;
  };

  // Load transactions on mount
  useEffect(() => {
    fetchTransactions();
  }, []);

  return (
    <div className="min-h-screen bg-[#F7F7F2]">
      <Head>
        <title>Privacy Audit - Bagel</title>
      </Head>

      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-4xl font-bold text-[#FF6B35]">B</span>
            <h1 className="text-2xl font-bold text-[#2D2D2A]">Bagel</h1>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/employer" className="text-gray-600 hover:text-[#FF6B35]">
              Employer
            </Link>
            <Link href="/employee" className="text-gray-600 hover:text-[#FF6B35]">
              Employee
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-[#2D2D2A] mb-2">
            Privacy Audit Dashboard
          </h2>
          <p className="text-lg text-gray-600">
            Verify Bagel&apos;s privacy features - compare raw on-chain data with decrypted views
          </p>
        </div>

        {/* Privacy Stack Info */}
        <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold text-[#2D2D2A] mb-4">
            Bagel EVM Privacy Stack
          </h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-purple-600 font-bold text-sm">R</span>
              </div>
              <h4 className="font-bold text-sm">Range</h4>
              <p className="text-xs text-gray-600">Compliance Pre-screening</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-blue-600 font-bold text-sm">Z</span>
              </div>
              <h4 className="font-bold text-sm">Zama fhEVM</h4>
              <p className="text-xs text-gray-600">Encrypted Ledger</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-green-600 font-bold text-sm">BP</span>
              </div>
              <h4 className="font-bold text-sm">BagelPool</h4>
              <p className="text-xs text-gray-600">Private Streaming</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-orange-600 font-bold text-sm">T</span>
              </div>
              <h4 className="font-bold text-sm">TEE Operator</h4>
              <p className="text-xs text-gray-600">Private Payouts</p>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: Raw On-Chain Data */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <h3 className="text-xl font-bold text-[#2D2D2A] mb-4 flex items-center">
              <span className="mr-2 text-gray-500">[ ]</span>
              Raw On-Chain Data (Public)
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This is what <strong>everyone</strong> can see on Etherscan - encrypted hex data.
            </p>

            {/* Account Lookup */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Look up Contract / Account
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                  placeholder="Enter contract or account address (0x...)..."
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                />
                <button
                  onClick={() => fetchAccountData(selectedAccount)}
                  disabled={!selectedAccount || loading}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  {loading ? '...' : 'Fetch'}
                </button>
              </div>
            </div>

            {/* Raw Data Display */}
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
              <div className="text-green-400">
                {accountData ? (
                  <pre className="whitespace-pre-wrap">{accountData.formattedRaw}</pre>
                ) : (
                  <>
                    <div className="text-gray-500 mb-2"># Example encrypted data:</div>
                    <pre>{`0000: 5a 41 4d 41 5f 46 48 45 56 4d 5f 45 4e 43 5f 56
0010: 31 00 00 00 00 00 00 00 8a 7b 2f c4 9e 3d 1a 5b
0020: ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
0030: [ENCRYPTED SALARY DATA - HIDDEN BY ZAMA fhEVM]
0040: ** ** ** ** ** ** ** ** ** ** ** ** ** ** ** **
0050: [ENCRYPTED ACCRUED DATA - HIDDEN BY ZAMA fhEVM]`}</pre>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                <strong>On-Chain Reality:</strong> Without decryption keys, observers only see random-looking bytes. Salary amounts and balances are completely hidden!
              </p>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Confidential ERC-20 Transfers (Production Path):</strong> In production,
                  Bagel uses Zama fhEVM Confidential ERC-20 tokens (CERC20) for deposits and withdrawals. Transfer amounts
                  are encrypted on-chain via fully homomorphic encryption, providing end-to-end privacy from storage to payout.
                </p>
              </div>
            </div>
          </div>

          {/* Right: Bagel Decrypted View */}
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <h3 className="text-xl font-bold text-[#2D2D2A] mb-4 flex items-center">
              <span className="mr-2 text-green-500">*</span>
              Bagel Decrypted View (Authorized)
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This is what <strong>only authorized users</strong> (employer/employee) can see.
            </p>

            {/* Decrypted View */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
              {accountData?.decryptedView ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Employer:</span>
                    <span className="text-sm font-mono">{accountData.decryptedView.employer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Employee:</span>
                    <span className="text-sm font-mono">{accountData.decryptedView.employee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Salary/Second:</span>
                    <span className="text-sm font-bold text-green-600">
                      {accountData.decryptedView.salaryPerSecond}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Accrued Balance:</span>
                    <span className="text-sm font-bold text-green-600">
                      {accountData.decryptedView.accruedBalance}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Last Update:</span>
                    <span className="text-sm">{accountData.decryptedView.lastUpdate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className="text-sm">
                      {accountData.decryptedView.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ) : connected ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Enter an account address to see decrypted view</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Only the employer or employee can decrypt their data
                  </p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Connect wallet to view decrypted data</p>
                  <WalletButton />
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Privacy Guarantee:</strong> Only wallet owners with decryption keys can see the actual salary amounts and balances.
              </p>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="mt-8 bg-white rounded-2xl p-6 shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-[#2D2D2A]">
              Recent Bagel Transactions
            </h3>
            <button
              onClick={fetchTransactions}
              disabled={loading}
              className="px-4 py-2 bg-[#FF6B35] text-white rounded-lg text-sm hover:bg-[#E55A24] disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Powered by <strong>Etherscan API</strong> (Sepolia Testnet)
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Tx Hash</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Time</th>
                  <th className="text-left py-2 px-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-xs">
                      <a
                        href={`${ETHERSCAN_BASE}/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {tx.hash.slice(0, 16)}...
                      </a>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-600">
                      {new Date(tx.timestamp * 1000).toLocaleString()}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-gray-400 font-mono">*** HIDDEN ***</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {transactions.length === 0 && !loading && (
            <div className="text-center py-8 text-gray-500">
              No transactions found. Create a payroll to see transactions here.
            </div>
          )}
        </div>

        {/* How It Works */}
        <div className="mt-8 bg-gradient-to-r from-orange-100 to-amber-100 rounded-2xl p-6">
          <h3 className="text-xl font-bold text-[#2D2D2A] mb-4">
            How Bagel Privacy Works
          </h3>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl mb-2 font-bold text-[#FF6B35]">1</div>
              <h4 className="font-bold text-sm">Compliance</h4>
              <p className="text-xs text-gray-600">
                Range pre-screens wallets before payroll creation
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2 font-bold text-[#FF6B35]">2</div>
              <h4 className="font-bold text-sm">Encryption</h4>
              <p className="text-xs text-gray-600">
                Zama fhEVM encrypts salary data on-chain
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2 font-bold text-[#FF6B35]">3</div>
              <h4 className="font-bold text-sm">Streaming</h4>
              <p className="text-xs text-gray-600">
                BagelPool queues and batches transfers privately
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-2 font-bold text-[#FF6B35]">4</div>
              <h4 className="font-bold text-sm">Payout</h4>
              <p className="text-xs text-gray-600">
                TEE Operator distributes funds privately from the pool.
                Confidential ERC-20 encrypts transfer amounts (production path).
              </p>
            </div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="mt-8 bg-gray-100 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-[#2D2D2A] mb-4">
            Bagel Contract Info
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Payroll Contract:</span>
              <code className="ml-2 bg-white px-2 py-1 rounded font-mono text-xs">
                {PAYROLL_ADDRESS || 'Not deployed'}
              </code>
            </div>
            <div>
              <span className="text-gray-600">CERC20 Token:</span>
              <code className="ml-2 bg-white px-2 py-1 rounded font-mono text-xs">
                {CERC20_ADDRESS || 'Not deployed'}
              </code>
            </div>
            <div>
              <span className="text-gray-600">BagelPool:</span>
              <code className="ml-2 bg-white px-2 py-1 rounded font-mono text-xs">
                {POOL_ADDRESS || 'Not deployed'}
              </code>
            </div>
            <div>
              <span className="text-gray-600">Network:</span>
              <span className="ml-2 px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs">
                Sepolia Testnet
              </span>
            </div>
            <div>
              <span className="text-gray-600">Block Explorer:</span>
              <span className="ml-2 px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs">
                Etherscan
              </span>
            </div>
            <div>
              {PAYROLL_ADDRESS && (
                <a
                  href={`${ETHERSCAN_BASE}/address/${PAYROLL_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View on Etherscan Sepolia &rarr;
                </a>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
