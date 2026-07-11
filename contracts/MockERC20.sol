// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test ERC20 with optional transfer failures for coverage of TransferFailed paths.
contract MockERC20 is ERC20 {
    bool public failTransfers;
    bool public failTransferFrom;

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransfers(bool shouldFail) external {
        failTransfers = shouldFail;
    }

    function setFailTransferFrom(bool shouldFail) external {
        failTransferFrom = shouldFail;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (failTransfers) {
            return false;
        }
        return super.transfer(to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (failTransferFrom) {
            return false;
        }
        return super.transferFrom(from, to, amount);
    }
}
