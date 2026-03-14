// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, eaddress, externalEuint64, externalEaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title ICERC20 - Minimal interface for confidential ERC20 (ERC7984)
interface ICERC20 {
    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64 transferred);
    function confidentialTransfer(
        address to,
        euint64 amount
    ) external returns (euint64 transferred);
    function setOperator(address operator, uint48 until) external;
    function isOperator(address holder, address spender) external view returns (bool);
}

/// @title BagelPool - Privacy Pool for Confidential Token Transfers
/// @notice Breaks the on-chain link between sender and recipient.
///         Sender deposits to the pool with an encrypted recipient address.
///         A TEE operator later distributes to the actual recipients.
///
/// @dev Flow:
///   1. Sender calls setOperator(pool, until) on CERC20 to authorize the pool
///   2. Sender calls queueTransfer(encRecipient, encAmount, inputProof)
///      - Pool pulls tokens from sender via confidentialTransferFrom
///      - Encrypted recipient + amount stored in queue
///   3. TEE operator reads the queue, decrypts recipient off-chain
///   4. TEE calls distribute(index, recipient, ...) to send from pool to recipient
///
/// On-chain, observers see:
///   - sender → pool (encrypted amount, encrypted recipient)
///   - pool → recipient (encrypted amount)
///   These happen at different times, breaking temporal correlation.
contract BagelPool is ZamaEthereumConfig, Ownable2Step {

    // ================================================================
    // State
    // ================================================================

    /// @notice The confidential ERC20 token
    ICERC20 public token;

    /// @notice TEE operator address (the only address that can call distribute)
    address public operator;

    /// @notice Minimum delay before a queued transfer can be distributed (privacy)
    uint256 public minDelay;

    /// @notice Queue of pending transfers
    Transfer[] public queue;

    struct Transfer {
        eaddress encRecipient;    // encrypted recipient address
        euint64  encAmount;       // encrypted transfer amount
        address  sender;          // public: who deposited (visible on-chain anyway)
        uint256  timestamp;       // when it was queued
        bool     distributed;     // whether it has been sent out
    }

    // ================================================================
    // Events
    // ================================================================

    event TransferQueued(uint256 indexed index, address indexed sender, uint256 timestamp);
    event TransferDistributed(uint256 indexed index, uint256 timestamp);
    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event MinDelayUpdated(uint256 oldDelay, uint256 newDelay);

    // ================================================================
    // Errors
    // ================================================================

    error OnlyOperator();
    error AlreadyDistributed();
    error TooEarly();
    error InvalidOperator();

    // ================================================================
    // Constructor
    // ================================================================

    /// @param _token   The CERC20 token address
    /// @param _operator The TEE operator wallet address
    /// @param _minDelay Minimum seconds between queue and distribute (e.g. 300 = 5 min)
    constructor(
        address _token,
        address _operator,
        uint256 _minDelay
    ) Ownable(msg.sender) {
        token = ICERC20(_token);
        operator = _operator;
        minDelay = _minDelay;
    }

    // ================================================================
    // User: Queue a Private Transfer
    // ================================================================

    /// @notice Queue a private transfer. The sender must have called
    ///         token.setOperator(address(this), until) beforehand.
    /// @param encRecipient  Encrypted recipient address (eaddress input)
    /// @param encAmount     Encrypted transfer amount (euint64 input)
    /// @param inputProof    FHE input proof for both encrypted values
    function queueTransfer(
        externalEaddress encRecipient,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        // Decrypt inputs from external encrypted form
        eaddress recipient = FHE.fromExternal(encRecipient, inputProof);
        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        // Pull tokens from sender to this contract
        // Requires sender to have set this contract as operator on the CERC20
        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), amount);

        // Store the pending transfer
        uint256 index = queue.length;
        queue.push(Transfer({
            encRecipient: recipient,
            encAmount: transferred,
            sender: msg.sender,
            timestamp: block.timestamp,
            distributed: false
        }));

        // Grant permissions so the TEE operator can request decryption
        FHE.allow(recipient, operator);
        FHE.allow(transferred, operator);
        // Also allow this contract to use them for distribution
        FHE.allowThis(recipient);
        FHE.allowThis(transferred);

        emit TransferQueued(index, msg.sender, block.timestamp);
    }

    // ================================================================
    // TEE Operator: Distribute
    // ================================================================

    /// @notice Distribute a queued transfer to its recipient.
    ///         Called by the TEE operator after decrypting the recipient off-chain.
    /// @param index      Index in the queue
    /// @param recipient  The decrypted recipient address (known only to TEE)
    function distribute(
        uint256 index,
        address recipient
    ) external {
        if (msg.sender != operator) revert OnlyOperator();

        Transfer storage t = queue[index];
        if (t.distributed) revert AlreadyDistributed();
        if (block.timestamp < t.timestamp + minDelay) revert TooEarly();

        t.distributed = true;

        // Transfer from pool to the actual recipient
        token.confidentialTransfer(recipient, t.encAmount);

        emit TransferDistributed(index, block.timestamp);
    }

    /// @notice Batch distribute multiple queued transfers
    /// @param indices    Array of queue indices
    /// @param recipients Array of decrypted recipient addresses
    function batchDistribute(
        uint256[] calldata indices,
        address[] calldata recipients
    ) external {
        if (msg.sender != operator) revert OnlyOperator();
        require(indices.length == recipients.length, "Length mismatch");

        for (uint256 i = 0; i < indices.length; i++) {
            Transfer storage t = queue[indices[i]];
            if (t.distributed) revert AlreadyDistributed();
            if (block.timestamp < t.timestamp + minDelay) revert TooEarly();

            t.distributed = true;
            token.confidentialTransfer(recipients[i], t.encAmount);

            emit TransferDistributed(indices[i], block.timestamp);
        }
    }

    // ================================================================
    // Admin
    // ================================================================

    /// @notice Update the TEE operator address
    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert InvalidOperator();
        emit OperatorUpdated(operator, _operator);
        operator = _operator;
    }

    /// @notice Update minimum delay between queue and distribute
    function setMinDelay(uint256 _minDelay) external onlyOwner {
        emit MinDelayUpdated(minDelay, _minDelay);
        minDelay = _minDelay;
    }

    // ================================================================
    // View
    // ================================================================

    /// @notice Get total number of queued transfers
    function queueLength() external view returns (uint256) {
        return queue.length;
    }

    /// @notice Get transfer status (non-encrypted fields only)
    function getTransferInfo(uint256 index) external view returns (
        address sender,
        uint256 timestamp,
        bool distributed
    ) {
        Transfer storage t = queue[index];
        return (t.sender, t.timestamp, t.distributed);
    }

    /// @notice Get the encrypted amount handle for a queued transfer
    function getEncryptedAmount(uint256 index) external view returns (euint64) {
        return queue[index].encAmount;
    }

    /// @notice Get the encrypted recipient handle for a queued transfer
    function getEncryptedRecipient(uint256 index) external view returns (eaddress) {
        return queue[index].encRecipient;
    }
}
