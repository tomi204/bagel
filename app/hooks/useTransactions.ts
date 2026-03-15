import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../pages/_app';
import { CERC20_ADDRESS, POOL_ADDRESS } from '../lib/contract-client';

const ETHERSCAN_API_KEY = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || '';

export interface Transaction {
  id: string;
  type: string;
  direction: 'in' | 'out';
  recipient: string;
  wallet: string;
  amount: number;
  currency: string;
  date: string;
  time: string;
  status: 'Completed' | 'Pending' | 'Failed';
  privacy: 'Standard' | 'Enhanced' | 'Maximum';
  txHash: string;
  timestamp: number;
  fee?: number;
}

export interface TransactionStats {
  totalOutgoing: number;
  totalIncoming: number;
  transactionCount: number;
  privateTransactionPercent: number;
}

interface EtherscanTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  isError: string;
  txreceipt_status: string;
  functionName: string;
  input: string;
  blockNumber: string;
  nonce: string;
  confirmations: string;
}

function shortenAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(timestamp: number): { date: string; time: string } {
  const d = new Date(timestamp * 1000);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date, time };
}

/**
 * Determine if a transaction involves one of the privacy contracts
 * (CERC20 confidential token or the BagelPool privacy pool).
 */
function isPrivacyTransaction(tx: EtherscanTx): boolean {
  const toAddr = tx.to?.toLowerCase() || '';
  const cerc20 = CERC20_ADDRESS?.toLowerCase() || '';
  const pool = POOL_ADDRESS?.toLowerCase() || '';

  if (cerc20 && toAddr === cerc20) return true;
  if (pool && toAddr === pool) return true;
  return false;
}

function parseEtherscanTx(tx: EtherscanTx, walletAddress: string): Transaction {
  const ts = parseInt(tx.timeStamp, 10);
  const { date, time } = formatDate(ts);

  const from = tx.from.toLowerCase();
  const to = (tx.to || '').toLowerCase();
  const wallet = walletAddress.toLowerCase();

  const isIncoming = to === wallet;
  const direction: 'in' | 'out' = isIncoming ? 'in' : 'out';

  // Convert wei to ETH
  const amountWei = BigInt(tx.value || '0');
  const amount = Number(amountWei) / 1e18;

  // Determine currency based on whether this is a contract call or plain ETH transfer
  const isContractCall = tx.input && tx.input !== '0x';
  const currency = isContractCall ? 'USDB' : 'ETH';

  // Determine status
  let status: 'Completed' | 'Pending' | 'Failed' = 'Completed';
  if (tx.isError === '1' || tx.txreceipt_status === '0') {
    status = 'Failed';
  }

  // Determine privacy level
  const privacy: 'Standard' | 'Enhanced' | 'Maximum' = isPrivacyTransaction(tx)
    ? 'Maximum'
    : 'Standard';

  // Determine transaction type
  let type = 'Transfer';
  if (isPrivacyTransaction(tx)) {
    type = 'Confidential Transfer';
  } else if (tx.functionName) {
    // Extract the function name before the parentheses
    const fnMatch = tx.functionName.match(/^(\w+)\(/);
    if (fnMatch) {
      const fn = fnMatch[1];
      // Map known function names to readable types
      if (fn === 'transfer' || fn === 'transferFrom') {
        type = isIncoming ? 'Token Received' : 'Token Transfer';
      } else if (fn === 'approve') {
        type = 'Approval';
      } else if (fn === 'deposit') {
        type = 'Deposit';
      } else if (fn === 'queueTransfer') {
        type = 'Private Transfer';
      } else if (fn === 'registerBusiness') {
        type = 'Register Business';
      } else if (fn === 'addEmployee') {
        type = 'Add Employee';
      } else if (fn === 'accrueSalary') {
        type = 'Accrue Salary';
      } else if (fn === 'requestWithdrawal') {
        type = 'Withdrawal';
      } else if (fn === 'mint') {
        type = 'Mint';
      } else {
        // Capitalize and space-separate camelCase
        type = fn.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
      }
    }
  } else if (amount > 0) {
    type = isIncoming ? 'ETH Received' : 'ETH Transfer';
  } else {
    type = isIncoming ? 'Deposit' : 'Transaction';
  }

  // Fee in ETH
  const gasUsed = BigInt(tx.gasUsed || '0');
  const gasPrice = BigInt(tx.gasPrice || '0');
  const fee = Number(gasUsed * gasPrice) / 1e18;

  const counterparty = isIncoming ? tx.from : (tx.to || '');

  return {
    id: tx.hash,
    type,
    direction,
    recipient: shortenAddress(counterparty),
    wallet: shortenAddress(counterparty),
    amount,
    currency,
    date,
    time,
    status,
    privacy,
    txHash: shortenAddress(tx.hash),
    timestamp: ts,
    fee,
  };
}

export function useTransactions(limit: number = 20) {
  const { address } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats>({
    totalOutgoing: 0,
    totalIncoming: 0,
    transactionCount: 0,
    privateTransactionPercent: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!address) {
      setTransactions([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiKeyParam = ETHERSCAN_API_KEY ? `&apikey=${ETHERSCAN_API_KEY}` : '';
      const url =
        `https://api-sepolia.etherscan.io/api?module=account&action=txlist` +
        `&address=${address}&startblock=0&endblock=99999999&sort=desc` +
        `&page=1&offset=${limit}${apiKeyParam}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.status}`);
      }

      const json = await response.json();

      if (json.status !== '1' && json.message !== 'No transactions found') {
        // status "0" with "No transactions found" is valid (empty list)
        if (json.result && Array.isArray(json.result) && json.result.length === 0) {
          setTransactions([]);
          setStats({ totalOutgoing: 0, totalIncoming: 0, transactionCount: 0, privateTransactionPercent: 0 });
          return;
        }
        if (json.message === 'NOTOK' || json.message === 'No transactions found') {
          setTransactions([]);
          setStats({ totalOutgoing: 0, totalIncoming: 0, transactionCount: 0, privateTransactionPercent: 0 });
          return;
        }
      }

      const data: EtherscanTx[] = Array.isArray(json.result) ? json.result : [];

      const parsedTransactions = data.map((tx) => parseEtherscanTx(tx, address));

      setTransactions(parsedTransactions);

      // Calculate stats
      const totalOutgoing = parsedTransactions
        .filter(tx => tx.direction === 'out')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const totalIncoming = parsedTransactions
        .filter(tx => tx.direction === 'in')
        .reduce((sum, tx) => sum + tx.amount, 0);

      const privateCount = parsedTransactions.filter(
        tx => tx.privacy === 'Enhanced' || tx.privacy === 'Maximum'
      ).length;

      setStats({
        totalOutgoing,
        totalIncoming,
        transactionCount: parsedTransactions.length,
        privateTransactionPercent: parsedTransactions.length > 0
          ? (privateCount / parsedTransactions.length) * 100
          : 0,
      });

    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [address, limit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    stats,
    loading,
    error,
    refetch: fetchTransactions,
  };
}

// Hook for recent transactions (smaller list for dashboard)
export function useRecentTransactions(limit: number = 5) {
  return useTransactions(limit);
}
