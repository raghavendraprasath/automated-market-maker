// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SimpleAMM.sol";

/// @title SimpleAMM Factory
/// @author Raghavendra Prasath Sridhar
/// @notice Deploys and indexes `SimpleAMM` pools, mirroring `UniswapV2Factory`.
/// @dev A UI can enumerate every available pool with `getAllPairs()` and then read `tokenA` /
/// `tokenB` from each pool, so no pool addresses need to be hardcoded in the frontend.
contract SimpleAMMFactory {
    /// @notice Every pool created by this factory, in creation order.
    address[] public allPairs;

    /// @notice Pool address for a token pair, registered under both orderings.
    mapping(address => mapping(address => address)) public getPair;

    /// @notice Emitted when a new pool is deployed.
    event PairCreated(
        address indexed tokenA,
        address indexed tokenB,
        address pair,
        uint256 pairIndex
    );

    error PairAlreadyExists();

    /// @notice Deploys a new pool for `tokenA` / `tokenB`.
    /// @dev Zero-address and identical-token validation is enforced by the `SimpleAMM` constructor.
    /// @param tokenA Address of the first ERC20 token.
    /// @param tokenB Address of the second ERC20 token.
    /// @return pair Address of the newly deployed pool.
    function createPair(
        address tokenA,
        address tokenB
    ) external returns (address pair) {
        if (getPair[tokenA][tokenB] != address(0)) {
            revert PairAlreadyExists();
        }

        pair = address(new SimpleAMM(tokenA, tokenB));

        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
        allPairs.push(pair);

        emit PairCreated(tokenA, tokenB, pair, allPairs.length - 1);
    }

    /// @notice Number of pools created by this factory.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Returns every pool address in a single call.
    function getAllPairs() external view returns (address[] memory) {
        return allPairs;
    }
}
