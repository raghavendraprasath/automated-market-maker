// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Simple Automated Market Maker (AMM)
/// @author Raghavendra Prasath Sridhar
/// @notice A simplified Uniswap V2-style constant-product AMM (x * y = k).
/// @dev Supports deposit / redeem of liquidity shares and fee-free swaps with slippage protection.
contract SimpleAMM {
    // ------------------------------------------------------------------------
    // State Variables
    // ------------------------------------------------------------------------

    /// @notice First token in the liquidity pool.
    IERC20 public immutable tokenA;

    /// @notice Second token in the liquidity pool.
    IERC20 public immutable tokenB;

    /// @notice Current reserve of Token A.
    uint256 public reserveA;

    /// @notice Current reserve of Token B.
    uint256 public reserveB;

    /// @notice Total liquidity shares issued (LP supply).
    uint256 public totalLiquidity;

    /// @notice Liquidity shares owned by each provider.
    mapping(address => uint256) public liquidityBalance;

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    /// @notice Emitted whenever liquidity is deposited.
    event LiquidityDeposited(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidityMinted
    );

    /// @notice Emitted whenever liquidity is redeemed.
    event LiquidityRedeemed(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidityBurned
    );

    /// @notice Emitted whenever tokens are swapped.
    event TokensSwapped(
        address indexed trader,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut
    );

    // ------------------------------------------------------------------------
    // Custom Errors
    // ------------------------------------------------------------------------

    error ZeroAmount();
    error TransferFailed();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InvalidSwapToken();
    error InvalidTokenAddress();
    error IdenticalTokens();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /// @notice Creates a new AMM pool for a token pair.
    /// @param _tokenA Address of the first ERC20 token.
    /// @param _tokenB Address of the second ERC20 token.
    constructor(address _tokenA, address _tokenB) {
        if (_tokenA == address(0) || _tokenB == address(0)) {
            revert InvalidTokenAddress();
        }
        if (_tokenA == _tokenB) {
            revert IdenticalTokens();
        }

        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    // ------------------------------------------------------------------------
    // View Functions
    // ------------------------------------------------------------------------

    /// @notice Returns the current reserves of both tokens.
    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }

    /// @notice Returns the liquidity shares owned by a provider.
    /// @param provider Address of the liquidity provider.
    function getLiquidity(address provider) external view returns (uint256) {
        return liquidityBalance[provider];
    }

    /// @notice Quotes output amount for a given input using the constant-product formula.
    /// @dev amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
    /// @param amountIn Amount of input tokens.
    /// @param reserveIn Reserve of the input token.
    /// @param reserveOut Reserve of the output token.
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    // ------------------------------------------------------------------------
    // External Functions
    // ------------------------------------------------------------------------

    /// @notice Deposits both tokens and mints proportional liquidity shares.
    /// @param amountA Amount of Token A to deposit.
    /// @param amountB Amount of Token B to deposit.
    function deposit(uint256 amountA, uint256 amountB) external {
        if (amountA == 0 || amountB == 0) {
            revert ZeroAmount();
        }

        if (!tokenA.transferFrom(msg.sender, address(this), amountA)) {
            revert TransferFailed();
        }
        if (!tokenB.transferFrom(msg.sender, address(this), amountB)) {
            revert TransferFailed();
        }

        uint256 liquidityMinted;

        // First LP: shares = sqrt(amountA * amountB), matching Uniswap V2.
        if (totalLiquidity == 0) {
            liquidityMinted = _sqrt(amountA * amountB);
        } else {
            // Subsequent LPs: mint the minimum of both proportional contributions
            // so the pool ratio cannot be skewed by a single-sided deposit.
            liquidityMinted = _min(
                (amountA * totalLiquidity) / reserveA,
                (amountB * totalLiquidity) / reserveB
            );
        }

        if (liquidityMinted == 0) {
            revert InsufficientLiquidity();
        }

        reserveA += amountA;
        reserveB += amountB;

        totalLiquidity += liquidityMinted;
        liquidityBalance[msg.sender] += liquidityMinted;

        emit LiquidityDeposited(msg.sender, amountA, amountB, liquidityMinted);
    }

    /// @notice Burns liquidity shares and returns the proportional underlying tokens.
    /// @param liquidity Amount of liquidity shares to redeem.
    function redeem(uint256 liquidity) external {
        if (liquidity == 0) {
            revert ZeroAmount();
        }
        if (liquidity > liquidityBalance[msg.sender]) {
            revert InsufficientLiquidity();
        }

        uint256 amountA = (liquidity * reserveA) / totalLiquidity;
        uint256 amountB = (liquidity * reserveB) / totalLiquidity;

        liquidityBalance[msg.sender] -= liquidity;
        totalLiquidity -= liquidity;

        reserveA -= amountA;
        reserveB -= amountB;

        if (!tokenA.transfer(msg.sender, amountA)) {
            revert TransferFailed();
        }
        if (!tokenB.transfer(msg.sender, amountB)) {
            revert TransferFailed();
        }

        emit LiquidityRedeemed(msg.sender, amountA, amountB, liquidity);
    }

    /// @notice Swaps an exact input amount of one pool token for the other.
    /// @param tokenIn Address of the token being sold into the pool.
    /// @param amountIn Exact amount of `tokenIn` to sell.
    /// @param minAmountOut Minimum acceptable output (slippage protection).
    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut
    ) external {
        if (amountIn == 0) {
            revert ZeroAmount();
        }
        if (totalLiquidity == 0) {
            revert InsufficientLiquidity();
        }

        bool isTokenA = tokenIn == address(tokenA);
        bool isTokenB = tokenIn == address(tokenB);
        if (!isTokenA && !isTokenB) {
            revert InvalidSwapToken();
        }

        IERC20 inputToken = isTokenA ? tokenA : tokenB;
        IERC20 outputToken = isTokenA ? tokenB : tokenA;

        uint256 reserveIn = isTokenA ? reserveA : reserveB;
        uint256 reserveOut = isTokenA ? reserveB : reserveA;

        if (!inputToken.transferFrom(msg.sender, address(this), amountIn)) {
            revert TransferFailed();
        }

        uint256 amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

        if (amountOut == 0) {
            revert InsufficientLiquidity();
        }
        if (amountOut < minAmountOut) {
            revert InsufficientOutputAmount();
        }

        if (!outputToken.transfer(msg.sender, amountOut)) {
            revert TransferFailed();
        }

        if (isTokenA) {
            reserveA = reserveIn + amountIn;
            reserveB = reserveOut - amountOut;
        } else {
            reserveB = reserveIn + amountIn;
            reserveA = reserveOut - amountOut;
        }

        emit TokensSwapped(
            msg.sender,
            tokenIn,
            amountIn,
            address(outputToken),
            amountOut
        );
    }

    // ------------------------------------------------------------------------
    // Internal Math
    // ------------------------------------------------------------------------

    /// @dev Returns the smaller of two numbers.
    function _min(uint256 x, uint256 y) internal pure returns (uint256) {
        return x < y ? x : y;
    }

    /// @dev Integer square root (Babylonian method), same approach as Uniswap V2.
    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
