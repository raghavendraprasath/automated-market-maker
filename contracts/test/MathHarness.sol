// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../SimpleAMM.sol";

/// @dev Thin wrapper so tests can exercise SimpleAMM internal math helpers directly.
contract MathHarness is SimpleAMM {
    constructor(address _tokenA, address _tokenB) SimpleAMM(_tokenA, _tokenB) {}

    function sqrt(uint256 y) external pure returns (uint256) {
        return _sqrt(y);
    }

    function min(uint256 x, uint256 y) external pure returns (uint256) {
        return _min(x, y);
    }
}
