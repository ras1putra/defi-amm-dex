// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./V2AMM.sol";

contract V2Factory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 indexed);

    error SameTokens();
    error PairExists();
    error InvalidToken();

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert SameTokens();
        if (tokenA == address(0) || tokenB == address(0)) revert InvalidToken();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (getPair[token0][token1] != address(0)) revert PairExists();

        V2AMM amm = new V2AMM(token0, token1);
        pair = address(amm);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
}
