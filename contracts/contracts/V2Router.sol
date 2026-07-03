// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./V2Factory.sol";
import "./V2AMM.sol";
import "./WETH.sol";

contract V2Router {
    using SafeERC20 for IERC20;

    address public immutable factory;
    WETH public immutable weth;

    error Expired();
    error ZeroAmount();
    error InsufficientETH();
    error ETHRefundFailed();
    error InsufficientOutputAmount();
    error InvalidPath();
    error NoLiquidity();
    error PairNotFound();
    error InsufficientBAmount();
    error ExcessiveAAmount();
    error InsufficientAAmount();
    error ETHTransferFailed();

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    constructor(address _factory, address _weth) {
        factory = _factory;
        weth = WETH(payable(_weth));
    }

    receive() external payable {}

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        if (amountADesired == 0 || amountBDesired == 0) revert ZeroAmount();

        address pair = V2Factory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = V2Factory(factory).createPair(tokenA, tokenB);
        }

        address poolToken0 = address(V2AMM(payable(pair)).token0());
        bool aIsToken0 = tokenA == poolToken0;
        (uint256 amount0Desired, uint256 amount1Desired) = aIsToken0
            ? (amountADesired, amountBDesired)
            : (amountBDesired, amountADesired);
        (uint256 amount0Min, uint256 amount1Min) = aIsToken0
            ? (amountAMin, amountBMin)
            : (amountBMin, amountAMin);

        (uint256 amount0, uint256 amount1) = _calculateOptimalAmounts(
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            pair
        );

        amountA = aIsToken0 ? amount0 : amount1;
        amountB = aIsToken0 ? amount1 : amount0;

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        IERC20(tokenA).forceApprove(pair, amountA);
        IERC20(tokenB).forceApprove(pair, amountB);

        liquidity = V2AMM(payable(pair)).addLiquidity(amount0, amount1, 0, 0);

        IERC20(V2AMM(payable(pair)).lpToken()).safeTransfer(to, liquidity);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        ensure(deadline)
        returns (uint256 amountToken, uint256 liquidity)
    {
        if (msg.value == 0) revert InsufficientETH();

        address wethAddr = address(weth);
        address pair = V2Factory(factory).getPair(token, wethAddr);
        if (pair == address(0)) {
            pair = V2Factory(factory).createPair(token, wethAddr);
        }

        address poolToken0 = address(V2AMM(payable(pair)).token0());
        bool wethIsToken0 = wethAddr == poolToken0;

        (uint256 amount0Desired, uint256 amount1Desired) = wethIsToken0
            ? (msg.value, amountTokenDesired)
            : (amountTokenDesired, msg.value);

        (uint256 amount0Min, uint256 amount1Min) = wethIsToken0
            ? (amountETHMin, amountTokenMin)
            : (amountTokenMin, amountETHMin);

        (uint256 amount0Optimal, uint256 amount1Optimal) = _calculateOptimalAmounts(
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            pair
        );

        uint256 amountWETH = wethIsToken0 ? amount0Optimal : amount1Optimal;
        amountToken = wethIsToken0 ? amount1Optimal : amount0Optimal;

        weth.deposit{value: amountWETH}();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amountToken);

        IERC20(token).forceApprove(pair, amountToken);
        IERC20(wethAddr).forceApprove(pair, amountWETH);

        (uint256 amount0, uint256 amount1) = wethIsToken0
            ? (amountWETH, amountToken)
            : (amountToken, amountWETH);

        liquidity = V2AMM(payable(pair)).addLiquidity(amount0, amount1, 0, 0);

        if (msg.value > amountWETH) {
            (bool success, ) = msg.sender.call{value: msg.value - amountWETH}("");
            if (!success) revert ETHRefundFailed();
        }

        IERC20(V2AMM(payable(pair)).lpToken()).safeTransfer(to, liquidity);
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        address wethAddr = address(weth);
        address pair = V2Factory(factory).getPair(token, wethAddr);
        if (pair == address(0)) revert PairNotFound();

        address poolToken0 = address(V2AMM(payable(pair)).token0());
        bool wethIsToken0 = wethAddr == poolToken0;
        (uint256 amount0Min, uint256 amount1Min) = wethIsToken0
            ? (amountETHMin, amountTokenMin)
            : (amountTokenMin, amountETHMin);

        V2AMM(payable(pair)).removeLiquidity(liquidity, amount0Min, amount1Min);

        uint256 balanceWETH = weth.balanceOf(address(this));
        uint256 balanceToken = IERC20(token).balanceOf(address(this));

        if (wethIsToken0) {
            amountETH = balanceWETH;
            amountToken = balanceToken;
        } else {
            amountToken = balanceToken;
            amountETH = balanceWETH;
        }

        IERC20(token).safeTransfer(to, amountToken);
        weth.withdraw(amountETH);
        (bool success, ) = to.call{value: amountETH}("");
        if (!success) revert ETHTransferFailed();
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (amountIn == 0) revert ZeroAmount();
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin)
            revert InsufficientOutputAmount();

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        _swap(amounts, path, to);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        if (msg.value == 0) revert InsufficientETH();
        if (path[0] != address(weth)) revert InvalidPath();

        weth.deposit{value: msg.value}();

        amounts = getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin)
            revert InsufficientOutputAmount();

        _swap(amounts, path, to);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (amountIn == 0) revert ZeroAmount();
        if (path[path.length - 1] != address(weth)) revert InvalidPath();

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin)
            revert InsufficientOutputAmount();

        _swap(amounts, path, address(this));

        uint256 wethAmount = amounts[amounts.length - 1];
        weth.withdraw(wethAmount);
        (bool success, ) = to.call{value: wethAmount}("");
        if (!success) revert ETHTransferFailed();
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();
        if (reserveIn == 0 || reserveOut == 0) revert NoLiquidity();

        uint256 amountInWithFee;
        uint256 numerator;
        uint256 denominator;
        unchecked {
            amountInWithFee = amountIn * 997;
            numerator = amountInWithFee * reserveOut;
            denominator = (reserveIn * 1000) + amountInWithFee;
        }
        amountOut = numerator / denominator;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) public view returns (uint256[] memory amounts) {
        uint256 len = path.length;
        if (len < 2) revert InvalidPath();
        amounts = new uint256[](len);
        amounts[0] = amountIn;

        unchecked {
            for (uint256 i; i < len - 1; i++) {
                address pair = V2Factory(factory).getPair(path[i], path[i + 1]);
                if (pair == address(0)) revert PairNotFound();

                (uint256 reserveIn, uint256 reserveOut) = V2AMM(payable(pair))
                    .getReserves();
                if (path[i] > path[i + 1]) {
                    (reserveIn, reserveOut) = (reserveOut, reserveIn);
                }
                amounts[i + 1] = getAmountOut(
                    amounts[i],
                    reserveIn,
                    reserveOut
                );
            }
        }
    }

    function _calculateOptimalAmounts(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address pair
    ) internal view returns (uint256 amountA, uint256 amountB) {
        (uint256 reserve0, uint256 reserve1) = V2AMM(payable(pair))
            .getReserves();

        if (reserve0 == 0 && reserve1 == 0) {
            return (amountADesired, amountBDesired);
        }

        uint256 amountBOptimal = (amountADesired * reserve1) / reserve0;
        if (amountBOptimal <= amountBDesired) {
            if (amountBOptimal < amountBMin) revert InsufficientBAmount();
            return (amountADesired, amountBOptimal);
        }

        uint256 amountAOptimal = (amountBDesired * reserve0) / reserve1;
        if (amountAOptimal > amountADesired) revert ExcessiveAAmount();
        if (amountAOptimal < amountAMin) revert InsufficientAAmount();
        return (amountAOptimal, amountBDesired);
    }

    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address to
    ) internal {
        uint256 len = path.length;
        unchecked {
            for (uint256 i; i < len - 1; i++) {
                address pair = V2Factory(factory).getPair(path[i], path[i + 1]);
                if (pair == address(0)) revert PairNotFound();

                IERC20(path[i]).forceApprove(pair, amounts[i]);

                V2AMM(payable(pair)).swap(path[i], amounts[i], 0);
            }
        }

        address lastToken = path[len - 1];
        uint256 lastAmount = amounts[len - 1];
        IERC20(lastToken).safeTransfer(to, lastAmount);
    }
}
