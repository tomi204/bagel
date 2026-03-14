/**
 * BagelPayroll Contract Client
 *
 * BagelPayroll + CERC20 contract interactions via ethers.js.
 * Provides typed methods for all payroll operations.
 */

import { Contract, BrowserProvider, type Signer, type ContractTransactionResponse } from "ethers";
import { encryptValue, encryptValues } from "./fhevm";

// Contract addresses (from deployment)
const PAYROLL_ADDRESS =
  process.env.NEXT_PUBLIC_PAYROLL_ADDRESS || "";
const CERC20_ADDRESS =
  process.env.NEXT_PUBLIC_CERC20_ADDRESS || "";

// BagelPayroll ABI (minimal, only what frontend needs)
const PAYROLL_ABI = [
  // Admin
  "function configureConfidentialToken(address token) external",
  "function isActive() external view returns (bool)",
  "function confidentialToken() external view returns (address)",
  "function nextBusinessIndex() external view returns (uint256)",

  // Business
  "function registerBusiness(bytes32 encEmployerId, bytes calldata inputProof) external",
  "function deposit(uint256 businessIndex, bytes32 encAmount, bytes calldata inputProof) external",
  "function getBusinessInfo(uint256 businessIndex) external view returns (uint256 nextEmployeeIdx, bool active)",

  // Employee
  "function addEmployee(uint256 businessIndex, bytes32 encEmployeeId, bytes32 encSalary, bytes calldata inputProof) external",
  "function setEmployeeAddress(uint256 businessIndex, uint256 employeeIndex, address employeeAddress) external",
  "function accrueSalary(uint256 businessIndex, uint256 employeeIndex) external",
  "function getEmployeeInfo(uint256 businessIndex, uint256 employeeIndex) external view returns (uint256 lastAction, bool active)",

  // Withdrawal
  "function requestWithdrawal(uint256 businessIndex, uint256 employeeIndex, bytes32 encAmount, bytes calldata inputProof) external",

  // Encrypted handles (for decryption)
  "function getEncryptedBalance(uint256 businessIndex) external view returns (bytes32)",
  "function getEncryptedAccrued(uint256 businessIndex, uint256 employeeIndex) external view returns (bytes32)",
  "function getEncryptedSalary(uint256 businessIndex, uint256 employeeIndex) external view returns (bytes32)",

  // Events
  "event VaultInitialized(address indexed authority, uint256 timestamp)",
  "event BusinessRegistered(uint256 indexed entryIndex, uint256 timestamp)",
  "event FundsDeposited(uint256 indexed entryIndex, uint256 timestamp)",
  "event EmployeeAdded(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
  "event WithdrawalProcessed(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
  "event SalaryAccrued(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp)",
];

// CERC20 ABI (ERC7984 interface)
const CERC20_ABI = [
  "function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) external returns (bytes32)",
  "function confidentialTransferFrom(address from, address to, bytes32 encryptedAmount, bytes inputProof) external returns (bytes32)",
  "function confidentialBalanceOf(address account) external view returns (bytes32)",
  "function confidentialTotalSupply() external view returns (bytes32)",
  "function setOperator(address operator, uint48 until) external",
  "function isOperator(address holder, address spender) external view returns (bool)",
  "function mint(address to, uint64 amount) external",
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
];

/**
 * Get a connected BagelPayroll contract instance
 */
export function getPayrollContract(signer: Signer): Contract {
  return new Contract(PAYROLL_ADDRESS, PAYROLL_ABI, signer);
}

/**
 * Get a connected CERC20 contract instance
 */
export function getCerc20Contract(signer: Signer): Contract {
  return new Contract(CERC20_ADDRESS, CERC20_ABI, signer);
}

/**
 * Register a new business
 */
export async function registerBusiness(
  signer: Signer
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  // Encrypt employer ID (hash of address)
  const idHash = BigInt("0x" + address.slice(2, 18));
  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, idHash);

  return contract.registerBusiness(encrypted.handles[0], encrypted.inputProof);
}

/**
 * Deposit funds to a business
 */
export async function deposit(
  signer: Signer,
  businessIndex: number,
  amount: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, amount);

  return contract.deposit(
    businessIndex,
    encrypted.handles[0],
    encrypted.inputProof
  );
}

/**
 * Add an employee to a business
 */
export async function addEmployee(
  signer: Signer,
  businessIndex: number,
  employeeAddress: string,
  salaryPerSecond: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const callerAddress = await signer.getAddress();

  // Encrypt employee ID and salary
  const empIdHash = BigInt("0x" + employeeAddress.slice(2, 18));
  const encrypted = await encryptValues(PAYROLL_ADDRESS, callerAddress, [
    empIdHash,
    salaryPerSecond,
  ]);

  return contract.addEmployee(
    businessIndex,
    encrypted.handles[0],
    encrypted.handles[1],
    encrypted.inputProof
  );
}

/**
 * Set employee wallet address
 */
export async function setEmployeeAddress(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number,
  employeeAddress: string
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  return contract.setEmployeeAddress(
    businessIndex,
    employeeIndex,
    employeeAddress
  );
}

/**
 * Accrue salary for an employee
 */
export async function accrueSalary(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  return contract.accrueSalary(businessIndex, employeeIndex);
}

/**
 * Request withdrawal of accrued salary
 */
export async function requestWithdrawal(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number,
  amount: bigint
): Promise<ContractTransactionResponse> {
  const contract = getPayrollContract(signer);
  const address = await signer.getAddress();

  const encrypted = await encryptValue(PAYROLL_ADDRESS, address, amount);

  return contract.requestWithdrawal(
    businessIndex,
    employeeIndex,
    encrypted.handles[0],
    encrypted.inputProof
  );
}

/**
 * Get business info
 */
export async function getBusinessInfo(
  signer: Signer,
  businessIndex: number
): Promise<{ nextEmployeeIndex: number; isActive: boolean }> {
  const contract = getPayrollContract(signer);
  const [nextEmpIdx, active] = await contract.getBusinessInfo(businessIndex);
  return {
    nextEmployeeIndex: Number(nextEmpIdx),
    isActive: active,
  };
}

/**
 * Get employee info
 */
export async function getEmployeeInfo(
  signer: Signer,
  businessIndex: number,
  employeeIndex: number
): Promise<{ lastAction: number; isActive: boolean }> {
  const contract = getPayrollContract(signer);
  const [lastAction, active] = await contract.getEmployeeInfo(
    businessIndex,
    employeeIndex
  );
  return {
    lastAction: Number(lastAction),
    isActive: active,
  };
}

/**
 * Get next business index
 */
export async function getNextBusinessIndex(signer: Signer): Promise<number> {
  const contract = getPayrollContract(signer);
  return Number(await contract.nextBusinessIndex());
}

// Re-export addresses for use in components
export { PAYROLL_ADDRESS, CERC20_ADDRESS };
