// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./V2LPToken.sol";

contract V2AMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    uint256 public constant FEE_NUM = 997;
    uint256 public constant FEE_DENOM = 1000;

    IERC20 public immutable token0;
    IERC20 public immutable token1;
    V2LPToken public immutable lpToken;

    uint128 public reserve0;
    uint128 public reserve1;

    error SameToken();
    error ZeroAmount();
    error NoLiquidity();
    error Overflow();
    error InitialRequiresBoth();
    error InsufficientLiquidity();
    error ZeroLiquidity();
    error InsufficientAmount0();
    error InsufficientAmount1();
    error InsufficientOutput();
    error InvalidToken();

    event LiquidityAdded(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 lpTokens
    );
    event LiquidityRemoved(
        address indexed provider,
        uint256 amount0,
        uint256 amount1,
        uint256 lpTokens
    );
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address _token0, address _token1) {
        if (_token0 == _token1) revert SameToken();
        if (_token0 == address(0) || _token1 == address(0)) revert InvalidToken();
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);

        string memory name0 = IERC20Metadata(_token0).name();
        string memory name1 = IERC20Metadata(_token1).name();
        string memory sym0 = IERC20Metadata(_token0).symbol();
        string memory sym1 = IERC20Metadata(_token1).symbol();

        lpToken = new V2LPToken(
            string.concat("V2 LP ", name0, "-", name1),
            string.concat("V2-", sym0, sym1),
            address(this)
        );
    }

    struct PoolInfo {
        address token0;
        address token1;
        address lpToken;
        uint256 totalLPSupply;
        uint256 reserve0;
        uint256 reserve1;
    }

    function poolInfo() external view returns (PoolInfo memory) {
        return
            PoolInfo({
                token0: address(token0),
                token1: address(token1),
                lpToken: address(lpToken),
                totalLPSupply: lpToken.totalSupply(),
                reserve0: reserve0,
                reserve1: reserve1
            });
    }

    function getReserves()
        external
        view
        returns (uint256 _reserve0, uint256 _reserve1)
    {
        return (reserve0, reserve1);
    }

    function getAmountOut(
        address tokenIn,
        uint256 amountIn
    ) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        (uint256 reserveIn, uint256 reserveOut) = _getReservesForToken(tokenIn);
        if (reserveIn == 0 || reserveOut == 0) revert NoLiquidity();

        uint256 amountInWithFee;
        uint256 numerator;
        uint256 denominator;
        unchecked {
            amountInWithFee = amountIn * FEE_NUM;
            numerator = amountInWithFee * reserveOut;
            denominator = (reserveIn * FEE_DENOM) + amountInWithFee;
        }
        amountOut = numerator / denominator;
    }

    function addLiquidity(
        uint256 amount0,
        uint256 amount1,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 lpTokens) {
        if (amount0 == 0 && amount1 == 0) revert ZeroAmount();
        if (amount0 > type(uint128).max || amount1 > type(uint128).max)
            revert Overflow();

        uint128 r0 = reserve0;
        uint128 r1 = reserve1;

        if (r0 == 0 && r1 == 0) {
            if (amount0 == 0 || amount1 == 0) revert InitialRequiresBoth();

            _transferIn(token0, amount0, msg.sender);
            _transferIn(token1, amount1, msg.sender);

            uint256 initialLp = _sqrt(amount0 * amount1);
            if (initialLp <= MINIMUM_LIQUIDITY) revert InsufficientLiquidity();
            lpToken.mint(DEAD, MINIMUM_LIQUIDITY);
            unchecked {
                lpTokens = initialLp - MINIMUM_LIQUIDITY;
            }
        } else {
            uint256 totalLp = lpToken.totalSupply();
            uint256 lp0 = (amount0 * totalLp) / r0;
            uint256 lp1 = (amount1 * totalLp) / r1;
            lpTokens = lp0 < lp1 ? lp0 : lp1;
            if (lpTokens == 0) revert ZeroLiquidity();

            uint256 expected0 = (lpTokens * r0) / totalLp;
            uint256 expected1 = (lpTokens * r1) / totalLp;
            if (expected0 < amount0Min) revert InsufficientAmount0();
            if (expected1 < amount1Min) revert InsufficientAmount1();

            _transferIn(token0, amount0, msg.sender);
            _transferIn(token1, amount1, msg.sender);
        }

        unchecked {
            reserve0 = r0 + uint128(amount0);
            reserve1 = r1 + uint128(amount1);
        }
        lpToken.mint(msg.sender, lpTokens);

        emit LiquidityAdded(msg.sender, amount0, amount1, lpTokens);
    }

    function removeLiquidity(
        uint256 lpAmount,
        uint256 amount0Min,
        uint256 amount1Min
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (lpAmount == 0) revert ZeroAmount();
        uint256 totalLp = lpToken.totalSupply();
        if (totalLp == 0) revert NoLiquidity();

        uint128 r0 = reserve0;
        uint128 r1 = reserve1;

        amount0 = (lpAmount * r0) / totalLp;
        amount1 = (lpAmount * r1) / totalLp;

        if (amount0 < amount0Min) revert InsufficientAmount0();
        if (amount1 < amount1Min) revert InsufficientAmount1();

        unchecked {
            reserve0 = r0 - uint128(amount0);
            reserve1 = r1 - uint128(amount1);
        }
        lpToken.burn(msg.sender, lpAmount);

        _transferOut(token0, amount0, msg.sender);
        _transferOut(token1, amount1, msg.sender);

        emit LiquidityRemoved(msg.sender, amount0, amount1, lpAmount);
    }

    function swap(
        address tokenIn,
        uint256 amountIn,
        uint256 amountOutMin
    ) external nonReentrant returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (amountIn > type(uint128).max) revert Overflow();
        address token0Addr = address(token0);
        address token1Addr = address(token1);
        if (tokenIn != token0Addr && tokenIn != token1Addr)
            revert InvalidToken();

        amountOut = getAmountOut(tokenIn, amountIn);
        if (amountOut < amountOutMin) revert InsufficientOutput();

        address tokenOut = tokenIn == token0Addr ? token1Addr : token0Addr;

        _transferIn(IERC20(tokenIn), amountIn, msg.sender);
        _transferOut(IERC20(tokenOut), amountOut, msg.sender);

        unchecked {
            if (tokenIn == token0Addr) {
                reserve0 += uint128(amountIn);
                reserve1 -= uint128(amountOut);
            } else {
                reserve1 += uint128(amountIn);
                reserve0 -= uint128(amountOut);
            }
        }

        emit Swapped(msg.sender, tokenIn, amountIn, amountOut);
    }

    function _getReservesForToken(
        address token
    ) internal view returns (uint256 reserveIn, uint256 reserveOut) {
        if (token == address(token0)) {
            return (reserve0, reserve1);
        } else if (token == address(token1)) {
            return (reserve1, reserve0);
        } else {
            revert InvalidToken();
        }
    }

    function _transferIn(IERC20 token, uint256 amount, address from) internal {
        token.safeTransferFrom(from, address(this), amount);
    }

    function _transferOut(IERC20 token, uint256 amount, address to) internal {
        token.safeTransfer(to, amount);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        y = x;
        uint256 z = (x + 1) / 2;
        while (z < y) {
            y = z;
            unchecked {
                z = (x / z + z) / 2;
            }
        }
    }
}
