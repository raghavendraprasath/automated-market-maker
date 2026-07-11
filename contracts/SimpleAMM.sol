// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Simple Automated Market Maker (AMM)
/// @author Raghavendra Prasath Sridhar
/// @notice A simplified Uniswap V2-style Automated Market Maker for educational purposes.
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

    /// @notice Total liquidity shares issued.
    uint256 public totalLiquidity;

    /// @notice Liquidity owned by each provider.
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
    error InvalidSwapToken();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /// @notice Creates a new AMM pool.
    /// @param _tokenA Address of the first ERC20 token.
    /// @param _tokenB Address of the second ERC20 token.
    constructor(address _tokenA, address _tokenB) {
        require(_tokenA != address(0), "Invalid token A");
        require(_tokenB != address(0), "Invalid token B");
        require(_tokenA != _tokenB, "Tokens must be different");

        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    // ------------------------------------------------------------------------
    // External Functions
    // ------------------------------------------------------------------------

    /// @notice Returns the current reserves.
    function getReserves()
        external
        view
        returns (uint256, uint256)
    {
        return (reserveA, reserveB);
    }

    /// @notice Returns the liquidity owned by a provider.
    /// @param provider Address of the liquidity provider.
    function getLiquidity(address provider)
        external
        view
        returns (uint256)
    {
        return liquidityBalance[provider];
    }

    /// @notice Deposits liquidity into the AMM.
    /// @param amountA Amount of Token A.
    /// @param amountB Amount of Token B.
    function deposit(
        uint256 amountA,
        uint256 amountB
    ) external {

        if (amountA == 0 || amountB == 0) {
            revert ZeroAmount();
        }

        bool success;

        success = tokenA.transferFrom(msg.sender, address(this), amountA);
        if (!success) revert TransferFailed();

        success = tokenB.transferFrom(msg.sender, address(this), amountB);
        if (!success) revert TransferFailed();

        uint256 liquidityMinted;

        // First liquidity provider
        if (totalLiquidity == 0) {
            liquidityMinted = sqrt(amountA * amountB);
        } else {
            liquidityMinted = min(
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

        emit LiquidityDeposited(
            msg.sender,
            amountA,
            amountB,
            liquidityMinted
        );
    }

    // redeem()
    /// @notice Redeems liquidity shares for the underlying tokens.
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

        bool success;

        success = tokenA.transfer(msg.sender, amountA);
        if (!success) revert TransferFailed();

        success = tokenB.transfer(msg.sender, amountB);
        if (!success) revert TransferFailed();

        emit LiquidityRedeemed(
            msg.sender,
            amountA,
            amountB,
            liquidity
        );
    }

    // swap()
    /// @notice Swaps one token for the other.
    /// @param tokenIn Address of the input token.
    /// @param amountIn Amount of input tokens to swap.
    function swap(
        address tokenIn,
        uint256 amountIn
    ) external {

        if (amountIn == 0) {
            revert ZeroAmount();
        }

        if (reserveA == 0 || reserveB == 0) {
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

        // Transfer input tokens into the pool
        if (!inputToken.transferFrom(msg.sender, address(this), amountIn)) {
            revert TransferFailed();
        }

        // Constant product invariant (fee-free)
        //
        // reserveIn * reserveOut = k
        // (reserveIn + amountIn) * (reserveOut - amountOut) = k
        //
        // Therefore:
        // amountOut = reserveOut - (k / (reserveIn + amountIn))
        uint256 k = reserveIn * reserveOut;
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 newReserveOut = k / newReserveIn;

        uint256 amountOut = reserveOut - newReserveOut;

        if (amountOut == 0) {
            revert InsufficientLiquidity();
        }

        if (!outputToken.transfer(msg.sender, amountOut)) {
            revert TransferFailed();
        }

        // Update reserves
        if (isTokenA) {
            reserveA = newReserveIn;
            reserveB = newReserveOut;
        } else {
            reserveB = newReserveIn;
            reserveA = newReserveOut;
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
    // Internal Functions
    // ------------------------------------------------------------------------

    /// @dev Returns the smaller of two numbers.
    function min(uint256 x, uint256 y)
        internal
        pure
        returns (uint256)
    {
        return x < y ? x : y;
    }

    /// @dev Integer square root using the Babylonian method.
    function sqrt(uint256 y)
        internal
        pure
        returns (uint256 z)
    {
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