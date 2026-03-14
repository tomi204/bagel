// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title BagelPayroll - Privacy-Preserving Payroll on Ethereum
/// @notice All salary amounts, balances, and identity hashes are encrypted via Zama fhEVM.
///         Observers see ONLY encrypted ciphertext — never plaintext values.
///
/// @dev Architecture (mapped from Solana Bagel):
///   - MasterVault → single contract with global encrypted counters
///   - BusinessEntry → mapping(uint256 => Business) with encrypted fields
///   - EmployeeEntry → mapping(bytes32 => Employee) with encrypted salary/accrued
///   - Inco Euint128 → Zama euint64 (sufficient for token amounts with 6 decimals)
///   - PDA derivation → index-based storage keys (same privacy guarantee)
///   - Confidential token transfers → ERC7984 (CERC20)
contract BagelPayroll is ZamaEthereumConfig, Ownable2Step {

    // ================================================================
    // State
    // ================================================================

    /// @notice Confidential token used for deposits/withdrawals
    address public confidentialToken;

    /// @notice Whether the vault is active
    bool public isActive;

    /// @notice Next business index (public counter for key derivation)
    uint256 public nextBusinessIndex;

    /// @notice ENCRYPTED total business count
    euint64 private _encryptedBusinessCount;

    /// @notice ENCRYPTED total employee count
    euint64 private _encryptedEmployeeCount;

    /// @dev Business data (index-based, no employer address in key)
    struct Business {
        euint64 encryptedEmployerId;     // hash of employer address, encrypted
        euint64 encryptedBalance;        // business balance, encrypted
        euint64 encryptedEmployeeCount;  // employee count, encrypted
        uint256 nextEmployeeIndex;
        address employer;                // stored for auth, NOT in key derivation
        bool isActive;
    }

    /// @dev Employee data (index-based, no employee address in key)
    struct Employee {
        euint64 encryptedEmployeeId;  // hash of employee address, encrypted
        euint64 encryptedSalary;      // salary per second, encrypted
        euint64 encryptedAccrued;     // accrued earnings, encrypted
        address employee;             // stored for auth, NOT in key derivation
        uint256 lastAction;           // timestamp of last withdrawal
        bool isActive;
    }

    /// @notice Business storage: businessIndex => Business
    mapping(uint256 => Business) private businesses;

    /// @notice Employee storage: keccak256(businessIndex, employeeIndex) => Employee
    mapping(bytes32 => Employee) private employees;

    /// @notice Minimum time between withdrawals (60 seconds)
    uint256 public constant MIN_WITHDRAW_INTERVAL = 60;

    // ================================================================
    // Events (minimal info for privacy)
    // ================================================================

    event VaultInitialized(address indexed authority, uint256 timestamp);
    event BusinessRegistered(uint256 indexed entryIndex, uint256 timestamp);
    event FundsDeposited(uint256 indexed entryIndex, uint256 timestamp);
    event EmployeeAdded(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp);
    event WithdrawalProcessed(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp);
    event ConfidentialTokenConfigured(address indexed token, uint256 timestamp);
    event SalaryAccrued(uint256 indexed businessIndex, uint256 employeeIndex, uint256 timestamp);

    // ================================================================
    // Errors
    // ================================================================

    error VaultNotActive();
    error BusinessNotActive();
    error EmployeeNotActive();
    error WithdrawTooSoon();
    error NotBusinessOwner();
    error NotEmployee();
    error InvalidToken();

    // ================================================================
    // Constructor
    // ================================================================

    constructor() Ownable(msg.sender) {
        isActive = true;
        nextBusinessIndex = 0;
        _encryptedBusinessCount = FHE.asEuint64(0);
        _encryptedEmployeeCount = FHE.asEuint64(0);
        FHE.allowThis(_encryptedBusinessCount);
        FHE.allowThis(_encryptedEmployeeCount);
        FHE.allow(_encryptedBusinessCount, msg.sender);
        FHE.allow(_encryptedEmployeeCount, msg.sender);

        emit VaultInitialized(msg.sender, block.timestamp);
    }

    // ================================================================
    // Admin
    // ================================================================

    /// @notice Configure the confidential ERC20 token for payroll
    function configureConfidentialToken(address token) external onlyOwner {
        if (token == address(0)) revert InvalidToken();
        confidentialToken = token;
        emit ConfidentialTokenConfigured(token, block.timestamp);
    }

    // ================================================================
    // Business Operations
    // ================================================================

    /// @notice Register a new business with encrypted employer ID
    function registerBusiness(
        externalEuint64 encEmployerId,
        bytes calldata inputProof
    ) external {
        if (!isActive) revert VaultNotActive();

        uint256 entryIndex = nextBusinessIndex;
        nextBusinessIndex++;

        euint64 employerId = FHE.fromExternal(encEmployerId, inputProof);

        Business storage biz = businesses[entryIndex];
        biz.encryptedEmployerId = employerId;
        biz.encryptedBalance = FHE.asEuint64(0);
        biz.encryptedEmployeeCount = FHE.asEuint64(0);
        biz.nextEmployeeIndex = 0;
        biz.employer = msg.sender;
        biz.isActive = true;

        // Grant permissions: contract + caller
        FHE.allowThis(biz.encryptedEmployerId);
        FHE.allow(biz.encryptedEmployerId, msg.sender);
        FHE.allowThis(biz.encryptedBalance);
        FHE.allow(biz.encryptedBalance, msg.sender);
        FHE.allowThis(biz.encryptedEmployeeCount);
        FHE.allow(biz.encryptedEmployeeCount, msg.sender);

        // Increment encrypted business count
        _encryptedBusinessCount = FHE.add(_encryptedBusinessCount, FHE.asEuint64(1));
        FHE.allowThis(_encryptedBusinessCount);
        FHE.allow(_encryptedBusinessCount, owner());

        emit BusinessRegistered(entryIndex, block.timestamp);
    }

    /// @notice Deposit funds to a business (encrypted amount)
    function deposit(
        uint256 businessIndex,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        if (!isActive) revert VaultNotActive();
        Business storage biz = businesses[businessIndex];
        if (!biz.isActive) revert BusinessNotActive();
        if (msg.sender != biz.employer) revert NotBusinessOwner();

        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        biz.encryptedBalance = FHE.add(biz.encryptedBalance, amount);
        FHE.allowThis(biz.encryptedBalance);
        FHE.allow(biz.encryptedBalance, msg.sender);

        emit FundsDeposited(businessIndex, block.timestamp);
    }

    // ================================================================
    // Employee Operations
    // ================================================================

    /// @notice Add an employee to a business with encrypted salary
    function addEmployee(
        uint256 businessIndex,
        externalEuint64 encEmployeeId,
        externalEuint64 encSalary,
        bytes calldata inputProof
    ) external {
        if (!isActive) revert VaultNotActive();
        Business storage biz = businesses[businessIndex];
        if (!biz.isActive) revert BusinessNotActive();
        if (msg.sender != biz.employer) revert NotBusinessOwner();

        uint256 employeeIndex = biz.nextEmployeeIndex;
        biz.nextEmployeeIndex++;

        bytes32 key = _employeeKey(businessIndex, employeeIndex);

        euint64 employeeId = FHE.fromExternal(encEmployeeId, inputProof);
        euint64 salary = FHE.fromExternal(encSalary, inputProof);

        Employee storage emp = employees[key];
        emp.encryptedEmployeeId = employeeId;
        emp.encryptedSalary = salary;
        emp.encryptedAccrued = FHE.asEuint64(0);
        emp.employee = address(0); // Set via setEmployeeAddress
        emp.lastAction = block.timestamp;
        emp.isActive = true;

        // Grant permissions: contract + employer
        FHE.allowThis(emp.encryptedEmployeeId);
        FHE.allow(emp.encryptedEmployeeId, msg.sender);
        FHE.allowThis(emp.encryptedSalary);
        FHE.allow(emp.encryptedSalary, msg.sender);
        FHE.allowThis(emp.encryptedAccrued);
        FHE.allow(emp.encryptedAccrued, msg.sender);

        // Increment encrypted employee counts
        biz.encryptedEmployeeCount = FHE.add(biz.encryptedEmployeeCount, FHE.asEuint64(1));
        FHE.allowThis(biz.encryptedEmployeeCount);
        FHE.allow(biz.encryptedEmployeeCount, msg.sender);

        _encryptedEmployeeCount = FHE.add(_encryptedEmployeeCount, FHE.asEuint64(1));
        FHE.allowThis(_encryptedEmployeeCount);
        FHE.allow(_encryptedEmployeeCount, owner());

        emit EmployeeAdded(businessIndex, employeeIndex, block.timestamp);
    }

    /// @notice Set the employee wallet address (called by employer after adding)
    function setEmployeeAddress(
        uint256 businessIndex,
        uint256 employeeIndex,
        address employeeAddress
    ) external {
        Business storage biz = businesses[businessIndex];
        if (msg.sender != biz.employer) revert NotBusinessOwner();

        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        Employee storage emp = employees[key];
        emp.employee = employeeAddress;

        // Grant the employee decryption access to their own data
        FHE.allow(emp.encryptedSalary, employeeAddress);
        FHE.allow(emp.encryptedAccrued, employeeAddress);
    }

    /// @notice Accrue salary for an employee (homomorphic computation)
    /// @dev salary_per_second * elapsed_seconds — encrypted * plaintext
    function accrueSalary(
        uint256 businessIndex,
        uint256 employeeIndex
    ) external {
        if (!isActive) revert VaultNotActive();
        Business storage biz = businesses[businessIndex];
        if (!biz.isActive) revert BusinessNotActive();

        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        Employee storage emp = employees[key];
        if (!emp.isActive) revert EmployeeNotActive();

        uint256 elapsed = block.timestamp - emp.lastAction;
        if (elapsed == 0) return;

        // Homomorphic: encrypted_salary * plaintext_elapsed = encrypted_accrued
        euint64 accrued = FHE.mul(emp.encryptedSalary, uint64(elapsed));
        emp.encryptedAccrued = FHE.add(emp.encryptedAccrued, accrued);
        FHE.allowThis(emp.encryptedAccrued);
        FHE.allow(emp.encryptedAccrued, emp.employee);
        FHE.allow(emp.encryptedAccrued, biz.employer);

        emp.lastAction = block.timestamp;

        emit SalaryAccrued(businessIndex, employeeIndex, block.timestamp);
    }

    /// @notice Request withdrawal of accrued salary (encrypted amount)
    function requestWithdrawal(
        uint256 businessIndex,
        uint256 employeeIndex,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        if (!isActive) revert VaultNotActive();

        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        Employee storage emp = employees[key];
        if (!emp.isActive) revert EmployeeNotActive();
        if (msg.sender != emp.employee) revert NotEmployee();

        uint256 elapsed = block.timestamp - emp.lastAction;
        if (elapsed < MIN_WITHDRAW_INTERVAL) revert WithdrawTooSoon();

        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        // Subtract from encrypted accrued balance
        emp.encryptedAccrued = FHE.sub(emp.encryptedAccrued, amount);
        FHE.allowThis(emp.encryptedAccrued);
        FHE.allow(emp.encryptedAccrued, msg.sender);

        // Subtract from business encrypted balance
        Business storage biz = businesses[businessIndex];
        biz.encryptedBalance = FHE.sub(biz.encryptedBalance, amount);
        FHE.allowThis(biz.encryptedBalance);
        FHE.allow(biz.encryptedBalance, biz.employer);

        emp.lastAction = block.timestamp;

        emit WithdrawalProcessed(businessIndex, employeeIndex, block.timestamp);
    }

    // ================================================================
    // View Helpers
    // ================================================================

    /// @notice Get business info (non-encrypted fields only)
    function getBusinessInfo(uint256 businessIndex) external view returns (
        uint256 nextEmployeeIdx,
        bool active
    ) {
        Business storage biz = businesses[businessIndex];
        return (biz.nextEmployeeIndex, biz.isActive);
    }

    /// @notice Get employee info (non-encrypted fields only)
    function getEmployeeInfo(uint256 businessIndex, uint256 employeeIndex) external view returns (
        uint256 lastAction,
        bool active
    ) {
        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        Employee storage emp = employees[key];
        return (emp.lastAction, emp.isActive);
    }

    /// @notice Get encrypted business balance handle (for authorized decryption)
    function getEncryptedBalance(uint256 businessIndex) external view returns (euint64) {
        return businesses[businessIndex].encryptedBalance;
    }

    /// @notice Get encrypted employee accrued handle (for authorized decryption)
    function getEncryptedAccrued(uint256 businessIndex, uint256 employeeIndex) external view returns (euint64) {
        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        return employees[key].encryptedAccrued;
    }

    /// @notice Get encrypted employee salary handle (for authorized decryption)
    function getEncryptedSalary(uint256 businessIndex, uint256 employeeIndex) external view returns (euint64) {
        bytes32 key = _employeeKey(businessIndex, employeeIndex);
        return employees[key].encryptedSalary;
    }

    // ================================================================
    // Internal
    // ================================================================

    /// @dev Derive employee storage key from indices (index-based, not address-based)
    function _employeeKey(uint256 businessIndex, uint256 employeeIndex) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(businessIndex, employeeIndex));
    }
}
