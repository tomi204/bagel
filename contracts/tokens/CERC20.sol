// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "openzeppelin-confidential-contracts/contracts/token/ERC7984/ERC7984.sol";

/// @title CERC20 - Confidential ERC20 Token (USDBagel)
/// @notice ERC7984-based confidential token for private payroll transfers.
/// @dev All balances are encrypted using Zama fhEVM. 6 decimals.
contract CERC20 is ZamaEthereumConfig, ERC7984, Ownable2Step {
    constructor(
        uint64 initialSupply,
        string memory name_,
        string memory symbol_,
        string memory tokenURI_
    ) ERC7984(name_, symbol_, tokenURI_) Ownable(msg.sender) {
        _mint(msg.sender, FHE.asEuint64(initialSupply));
    }

    /// @notice Mint new tokens (owner only)
    function mint(address to, uint64 amount) external onlyOwner {
        _mint(to, FHE.asEuint64(amount));
    }

    /// @inheritdoc ERC7984
    function _update(address from, address to, euint64 amount)
        internal
        virtual
        override
        returns (euint64 transferred)
    {
        transferred = super._update(from, to, amount);
        FHE.allow(confidentialTotalSupply(), owner());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
