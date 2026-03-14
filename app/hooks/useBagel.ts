/**
 * useBagel Hook - EVM Version
 *
 * React hook for BagelPayroll operations using ethers.js + fhevmjs.
 * React hook for BagelPayroll operations using ethers.js + fhevmjs.
 */

import { useMemo, useState, useCallback } from "react";
import { useWallet } from "../pages/_app";
import {
  registerBusiness,
  deposit,
  addEmployee,
  setEmployeeAddress,
  accrueSalary,
  requestWithdrawal,
  getBusinessInfo,
  getEmployeeInfo,
  getNextBusinessIndex,
} from "../lib/contract-client";

export interface PayrollData {
  businessIndex: number;
  employeeIndex: number;
  lastAction: number;
  isActive: boolean;
}

export interface UseBagelReturn {
  // State
  loading: boolean;
  error: string | null;
  connected: boolean;
  address: string | null;

  // Business operations
  registerBusiness: () => Promise<string>;
  deposit: (businessIndex: number, amount: bigint) => Promise<string>;
  getNextBusinessIndex: () => Promise<number>;

  // Employee operations
  addEmployee: (
    businessIndex: number,
    employeeAddress: string,
    salaryPerSecond: bigint
  ) => Promise<string>;
  setEmployeeAddress: (
    businessIndex: number,
    employeeIndex: number,
    employeeAddress: string
  ) => Promise<string>;
  accrueSalary: (
    businessIndex: number,
    employeeIndex: number
  ) => Promise<string>;

  // Withdrawal
  requestWithdrawal: (
    businessIndex: number,
    employeeIndex: number,
    amount: bigint
  ) => Promise<string>;

  // Queries
  getBusinessInfo: (
    businessIndex: number
  ) => Promise<{ nextEmployeeIndex: number; isActive: boolean }>;
  getEmployeeInfo: (
    businessIndex: number,
    employeeIndex: number
  ) => Promise<{ lastAction: number; isActive: boolean }>;
}

export function useBagel(): UseBagelReturn {
  const { signer, address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err: any) {
        const msg = err?.reason || err?.message || "Transaction failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    connected: !!signer,
    address,

    registerBusiness: useCallback(async () => {
      if (!signer) throw new Error("Wallet not connected");
      return withLoading(async () => {
        const tx = await registerBusiness(signer);
        await tx.wait();
        return tx.hash;
      });
    }, [signer, withLoading]),

    deposit: useCallback(
      async (businessIndex: number, amount: bigint) => {
        if (!signer) throw new Error("Wallet not connected");
        return withLoading(async () => {
          const tx = await deposit(signer, businessIndex, amount);
          await tx.wait();
          return tx.hash;
        });
      },
      [signer, withLoading]
    ),

    getNextBusinessIndex: useCallback(async () => {
      if (!signer) throw new Error("Wallet not connected");
      return getNextBusinessIndex(signer);
    }, [signer]),

    addEmployee: useCallback(
      async (
        businessIndex: number,
        employeeAddress: string,
        salaryPerSecond: bigint
      ) => {
        if (!signer) throw new Error("Wallet not connected");
        return withLoading(async () => {
          const tx = await addEmployee(
            signer,
            businessIndex,
            employeeAddress,
            salaryPerSecond
          );
          await tx.wait();
          return tx.hash;
        });
      },
      [signer, withLoading]
    ),

    setEmployeeAddress: useCallback(
      async (
        businessIndex: number,
        employeeIndex: number,
        employeeAddr: string
      ) => {
        if (!signer) throw new Error("Wallet not connected");
        return withLoading(async () => {
          const tx = await setEmployeeAddress(
            signer,
            businessIndex,
            employeeIndex,
            employeeAddr
          );
          await tx.wait();
          return tx.hash;
        });
      },
      [signer, withLoading]
    ),

    accrueSalary: useCallback(
      async (businessIndex: number, employeeIndex: number) => {
        if (!signer) throw new Error("Wallet not connected");
        return withLoading(async () => {
          const tx = await accrueSalary(signer, businessIndex, employeeIndex);
          await tx.wait();
          return tx.hash;
        });
      },
      [signer, withLoading]
    ),

    requestWithdrawal: useCallback(
      async (businessIndex: number, employeeIndex: number, amount: bigint) => {
        if (!signer) throw new Error("Wallet not connected");
        return withLoading(async () => {
          const tx = await requestWithdrawal(
            signer,
            businessIndex,
            employeeIndex,
            amount
          );
          await tx.wait();
          return tx.hash;
        });
      },
      [signer, withLoading]
    ),

    getBusinessInfo: useCallback(
      async (businessIndex: number) => {
        if (!signer) throw new Error("Wallet not connected");
        return getBusinessInfo(signer, businessIndex);
      },
      [signer]
    ),

    getEmployeeInfo: useCallback(
      async (businessIndex: number, employeeIndex: number) => {
        if (!signer) throw new Error("Wallet not connected");
        return getEmployeeInfo(signer, businessIndex, employeeIndex);
      },
      [signer]
    ),
  };
}
