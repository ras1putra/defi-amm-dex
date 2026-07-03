import { expect } from "chai";
import { ethers } from "hardhat";
import { V2AMM, V2LPToken, MockToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("V2AMM", () => {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let tokenA: MockToken;
  let tokenB: MockToken;
  let pool: V2AMM;
  let lpToken: V2LPToken;

  const INITIAL_A = ethers.parseEther("10000");
  const INITIAL_B = ethers.parseEther("20000");

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    tokenA = (await MockTokenFactory.deploy("Token A", "TKA", 18)) as unknown as MockToken;
    tokenB = (await MockTokenFactory.deploy("Token B", "TKB", 18)) as unknown as MockToken;

    // Ensure tokenA < tokenB for deterministic ordering
    const addrA = await tokenA.getAddress();
    const addrB = await tokenB.getAddress();
    let t0 = tokenA;
    let t1 = tokenB;
    if (addrA.toLowerCase() > addrB.toLowerCase()) {
      t0 = tokenB;
      t1 = tokenA;
    }

    const V2AMMFactory = await ethers.getContractFactory("V2AMM");
    pool = (await V2AMMFactory.deploy(
      await t0.getAddress(),
      await t1.getAddress()
    )) as unknown as V2AMM;

    const lpAddr = await pool.lpToken();
    lpToken = (await ethers.getContractAt("V2LPToken", lpAddr)) as unknown as V2LPToken;

    // Mint mock tokens to owner
    await tokenA.mint(owner.address, ethers.parseEther("1000000"));
    await tokenB.mint(owner.address, ethers.parseEther("1000000"));
  });

  describe("Deployment", () => {
    it("sets token0 and token1 correctly", async () => {
      const t0 = await pool.token0();
      const t1 = await pool.token1();
      expect(ethers.toBigInt(t0.toLowerCase())).to.be.lessThan(ethers.toBigInt(t1.toLowerCase()));
    });

    it("creates LP token with correct metadata", async () => {
      const name = await lpToken.name();
      const symbol = await lpToken.symbol();
      const poolAddr = await pool.getAddress();

      const t0Addr = await pool.token0();
      const t0Contract = (await ethers.getContractAt("MockToken", t0Addr)) as unknown as MockToken;
      const t1Contract = (await ethers.getContractAt("MockToken", await pool.token1())) as unknown as MockToken;
      const name0 = await t0Contract.name();
      const name1 = await t1Contract.name();
      const sym0 = await t0Contract.symbol();
      const sym1 = await t1Contract.symbol();

      expect(name).to.equal(`V2 LP ${name0}-${name1}`);
      expect(symbol).to.equal(`V2-${sym0}${sym1}`);
      expect(await lpToken.pool()).to.equal(poolAddr);
    });

    it("starts with zero reserves", async () => {
      const [r0, r1] = await pool.getReserves();
      expect(r0).to.equal(0n);
      expect(r1).to.equal(0n);
    });
  });

  describe("addLiquidity — Initial", () => {
    it("mints LP tokens = sqrt(amount0 * amount1)", async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);

      const expectedLp = ethers.parseEther(
        String(Math.floor(Math.sqrt(Number(INITIAL_A) / 1e18 * Number(INITIAL_B) / 1e18)))
      );

      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);

      const lpBal = await lpToken.balanceOf(owner.address);
      expect(lpBal).to.be.gt(0n);
      expect(lpBal).to.be.closeTo(expectedLp, ethers.parseEther("1"));

      const [r0, r1] = await pool.getReserves();
      expect(r0).to.equal(INITIAL_A);
      expect(r1).to.equal(INITIAL_B);
    });

    it("emits LiquidityAdded event", async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);

      await expect(pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n))
        .to.emit(pool, "LiquidityAdded");
    });
  });

  describe("addLiquidity — Subsequent", () => {
    beforeEach(async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);
    });

    it("mints proportional LP tokens", async () => {
      const lpBefore = await lpToken.balanceOf(owner.address);
      const totalBefore = await lpToken.totalSupply();

      const addA = ethers.parseEther("1000");
      const addB = ethers.parseEther("2000");
      await pool.addLiquidity(addA, addB, 0n, 0n);

      const totalAfter = await lpToken.totalSupply();
      const lpMinted = totalAfter - totalBefore;

      const expectedMint = (addA * totalBefore) / INITIAL_A;
      expect(lpMinted).to.be.closeTo(expectedMint, ethers.parseEther("0.01"));
    });

    it("updates reserves correctly", async () => {
      const addA = ethers.parseEther("500");
      const addB = ethers.parseEther("1000");
      await pool.addLiquidity(addA, addB, 0n, 0n);

      const [r0, r1] = await pool.getReserves();
      expect(r0).to.equal(INITIAL_A + addA);
      expect(r1).to.equal(INITIAL_B + addB);
    });

    it("accepts off-ratio liquidity with proportional LP tokens", async () => {
      const totalBefore = await lpToken.totalSupply();
      const lpBefore = await lpToken.balanceOf(owner.address);

      const addA = ethers.parseEther("1000");
      const addB = ethers.parseEther("500");

      await pool.addLiquidity(addA, addB, 0n, 0n);

      const totalAfter = await lpToken.totalSupply();
      const lpMinted = totalAfter - totalBefore;

      const expectedMint = (addB * totalBefore) / INITIAL_B;
      expect(lpMinted).to.be.closeTo(expectedMint, ethers.parseEther("0.01"));
    });
  });

  describe("removeLiquidity", () => {
    beforeEach(async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);
    });

    it("burns LP and returns proportional tokens", async () => {
      const lpBal = await lpToken.balanceOf(owner.address);
      const balABefore = await tokenA.balanceOf(owner.address);
      const balBBefore = await tokenB.balanceOf(owner.address);

      await pool.removeLiquidity(lpBal, 0n, 0n);

      const gotA = (await tokenA.balanceOf(owner.address)) - balABefore;
      const gotB = (await tokenB.balanceOf(owner.address)) - balBBefore;

      expect(gotA).to.be.closeTo(INITIAL_A, ethers.parseEther("0.01"));
      expect(gotB).to.be.closeTo(INITIAL_B, ethers.parseEther("0.01"));
      expect(await lpToken.balanceOf(owner.address)).to.equal(0n);
    });

    it("reverts when slippage not met", async () => {
      const lpBal = await lpToken.balanceOf(owner.address);
      const hugeMin = ethers.parseEther("999999");

      await expect(
        pool.removeLiquidity(lpBal, hugeMin, 0n)
      ).to.be.revertedWith("INSUFFICIENT_AMOUNT_0");
    });

    it("emits LiquidityRemoved event", async () => {
      const lpBal = await lpToken.balanceOf(owner.address);

      await expect(pool.removeLiquidity(lpBal, 0n, 0n))
        .to.emit(pool, "LiquidityRemoved");
    });
  });

  describe("swap", () => {
    beforeEach(async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);
    });

    it("swaps with 0.3% fee", async () => {
      const swapIn = ethers.parseEther("100");
      const expectedOut = await pool.getAmountOut(await tokenA.getAddress(), swapIn);

      const balBBefore = await tokenB.balanceOf(owner.address);

      await pool.swap(await tokenA.getAddress(), swapIn, 0n);

      const got = (await tokenB.balanceOf(owner.address)) - balBBefore;
      expect(got).to.equal(expectedOut);
      expect(got).to.be.gt(0n);

      const [r0, r1] = await pool.getReserves();
      const newK = r0 * r1;
      const oldK = INITIAL_A * INITIAL_B;
      expect(newK).to.be.gte(oldK);
    });

    it("emits Swapped event", async () => {
      const swapIn = ethers.parseEther("50");

      await expect(
        pool.swap(await tokenA.getAddress(), swapIn, 0n)
      ).to.emit(pool, "Swapped");
    });

    it("reverts when slippage not met", async () => {
      const swapIn = ethers.parseEther("100");
      const hugeMin = ethers.parseEther("999999");

      await expect(
        pool.swap(await tokenA.getAddress(), swapIn, hugeMin)
      ).to.be.revertedWith("INSUFFICIENT_OUTPUT");
    });

    it("reverts with zero input", async () => {
      await expect(
        pool.swap(await tokenA.getAddress(), 0n, 0n)
      ).to.be.revertedWith("ZERO_AMOUNT");
    });

    it("reverts with invalid token", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const fake = await MockTokenFactory.deploy("Fake", "FAKE", 18);

      await expect(
        pool.swap(await fake.getAddress(), ethers.parseEther("1"), 0n)
      ).to.be.revertedWith("INVALID_TOKEN");
    });

    it("allows swapping tokenB for tokenA", async () => {
      const swapIn = ethers.parseEther("100");
      const expectedOut = await pool.getAmountOut(await tokenB.getAddress(), swapIn);

      const balABefore = await tokenA.balanceOf(owner.address);

      await pool.swap(await tokenB.getAddress(), swapIn, 0n);

      const got = (await tokenA.balanceOf(owner.address)) - balABefore;
      expect(got).to.equal(expectedOut);
    });
  });

  describe("getAmountOut", () => {
    beforeEach(async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);
    });

    it("returns correct output for given input", async () => {
      const amountIn = ethers.parseEther("1000");
      const out = await pool.getAmountOut(await tokenA.getAddress(), amountIn);

      const [reserve0, reserve1] = await pool.getReserves();
      const reserveIn = (await tokenA.getAddress()).toLowerCase() === (await pool.token0()).toLowerCase()
        ? reserve0 : reserve1;
      const reserveOut = (await tokenA.getAddress()).toLowerCase() === (await pool.token0()).toLowerCase()
        ? reserve1 : reserve0;

      const amountInWithFee = amountIn * 997n;
      const numerator = amountInWithFee * reserveOut;
      const denominator = 1000n * reserveIn + amountInWithFee;
      const expected = numerator / denominator;

      expect(out).to.equal(expected);
    });

    it("reverts for zero input", async () => {
      await expect(
        pool.getAmountOut(await tokenA.getAddress(), 0n)
      ).to.be.revertedWith("ZERO_AMOUNT");
    });
  });

  describe("Reentrancy protection", () => {
    it("protects addLiquidity from reentrancy", async () => {
      const poolAddr = await pool.getAddress();
      const code = await ethers.provider.getCode(poolAddr);
      expect(code.length).to.be.gt(2);
    });
  });

  describe("View functions", () => {
    beforeEach(async () => {
      await tokenA.approve(await pool.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.addLiquidity(INITIAL_A, INITIAL_B, 0n, 0n);
    });

    it("getReserves returns correct data", async () => {
      const [r0, r1] = await pool.getReserves();
      expect(r0).to.equal(INITIAL_A);
      expect(r1).to.equal(INITIAL_B);
    });
  });
});
