import { expect } from "chai";
import { ethers } from "hardhat";
import { V2Router, V2Factory, V2AMM, V2LPToken, MockToken, WETH } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("V2Router", () => {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let tokenA: MockToken;
  let tokenB: MockToken;
  let weth: WETH;
  let factory: V2Factory;
  let router: V2Router;

  const INITIAL_A = ethers.parseEther("10000");
  const INITIAL_B = ethers.parseEther("20000");

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();

    const MockTokenFactory = await ethers.getContractFactory("MockToken");
    tokenA = (await MockTokenFactory.deploy("Token A", "TKA", 18)) as unknown as MockToken;
    tokenB = (await MockTokenFactory.deploy("Token B", "TKB", 18)) as unknown as MockToken;

    const WETHFactory = await ethers.getContractFactory("WETH");
    weth = (await WETHFactory.deploy()) as unknown as WETH;

    const FactoryFactory = await ethers.getContractFactory("V2Factory");
    factory = (await FactoryFactory.deploy()) as unknown as V2Factory;

    const RouterFactory = await ethers.getContractFactory("V2Router");
    router = (await RouterFactory.deploy(await factory.getAddress(), await weth.getAddress())) as unknown as V2Router;

    await tokenA.mint(owner.address, ethers.parseEther("1000000"));
    await tokenB.mint(owner.address, ethers.parseEther("1000000"));
  });

  describe("Deployment", () => {
    it("sets factory and weth addresses", async () => {
      expect(await router.factory()).to.equal(await factory.getAddress());
      expect(await router.weth()).to.equal(await weth.getAddress());
    });
  });

  describe("addLiquidity (ERC20/ERC20)", () => {
    it("creates pair and adds liquidity in one transaction", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);

      const pairAddrBefore = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pairAddrBefore).to.equal(ethers.ZeroAddress);

      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        INITIAL_A,
        INITIAL_B,
        0n,
        0n,
        owner.address,
        deadline
      );

      await tx.wait();

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);

      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const [r0, r1] = await pool.getReserves();
      expect(r0 + r1).to.equal(INITIAL_A + INITIAL_B);

      const lpAddr = await pool.lpToken();
      const lpToken = (await ethers.getContractAt("V2LPToken", lpAddr)) as unknown as V2LPToken;
      const lpBal = await lpToken.balanceOf(owner.address);
      expect(lpBal).to.be.gt(0n);
    });

    it("adds liquidity to existing pool", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );

      const addAmount = ethers.parseEther("1000");
      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        addAmount, addAmount, 0n, 0n, owner.address, deadline
      );

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const [r0, r1] = await pool.getReserves();
      expect(r0).to.be.gte(INITIAL_A);
      expect(r1).to.be.gte(INITIAL_B);
    });

    it("reverts when deadline expired", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const expiredDeadline = Math.floor(Date.now() / 1000) - 600;

      await expect(
        router.addLiquidity(
          await tokenA.getAddress(), await tokenB.getAddress(),
          INITIAL_A, INITIAL_B, 0n, 0n, owner.address, expiredDeadline
        )
      ).to.be.revertedWith("V2Router: EXPIRED");
    });

    it("reverts when optimal amount below minimum (excess A)", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );

      await expect(
        router.addLiquidity(
          await tokenA.getAddress(), await tokenB.getAddress(),
          ethers.parseEther("5000"), ethers.parseEther("1000"),
          ethers.parseEther("3000"), 0n,
          owner.address, deadline
        )
      ).to.be.reverted;
    });

    it("reverts when optimal amount below minimum (excess B)", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );

      await expect(
        router.addLiquidity(
          await tokenA.getAddress(), await tokenB.getAddress(),
          ethers.parseEther("1000"), ethers.parseEther("5000"),
          0n, ethers.parseEther("3000"),
          owner.address, deadline
        )
      ).to.be.reverted;
    });

    it("returns correct amounts and liquidity", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const tx = await router.addLiquidity.staticCall(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );

      expect(tx.amountA + tx.amountB).to.equal(INITIAL_A + INITIAL_B);
      expect(tx.liquidity).to.be.gt(0n);
    });

    it("sends LP tokens to specified recipient", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, user1.address, deadline
      );

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const lpAddr = await pool.lpToken();
      const lpToken = (await ethers.getContractAt("V2LPToken", lpAddr)) as unknown as V2LPToken;

      expect(await lpToken.balanceOf(user1.address)).to.be.gt(0n);
      expect(await lpToken.balanceOf(owner.address)).to.equal(0n);
    });

    it("reverts with zero amountADesired", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      await expect(
        router.addLiquidity(
          await tokenA.getAddress(), await tokenB.getAddress(),
          0n, INITIAL_B, 0n, 0n, owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: ZERO_AMOUNT");
    });

    it("reverts with zero amountBDesired", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      await expect(
        router.addLiquidity(
          await tokenA.getAddress(), await tokenB.getAddress(),
          INITIAL_A, 0n, 0n, 0n, owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: ZERO_AMOUNT");
    });
  });

  describe("addLiquidityETH", () => {
    it("creates WETH pair and adds liquidity in one transaction", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const ethAmount = ethers.parseEther("10");
      const tokenAmount = ethers.parseEther("20000");

      const tx = await router.addLiquidityETH(
        await tokenA.getAddress(),
        tokenAmount,
        0n,
        0n,
        owner.address,
        deadline,
        { value: ethAmount }
      );

      await tx.wait();

      const wethAddr = await weth.getAddress();
      const pairAddr = await factory.getPair(await tokenA.getAddress(), wethAddr);
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);

      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const lpAddr = await pool.lpToken();
      const lpToken = (await ethers.getContractAt("V2LPToken", lpAddr)) as unknown as V2LPToken;
      const lpBal = await lpToken.balanceOf(owner.address);
      expect(lpBal).to.be.gt(0n);
    });

    it("reverts with zero ETH", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        router.addLiquidityETH(
          await tokenA.getAddress(), ethers.parseEther("20000"), 0n, 0n, owner.address, deadline,
          { value: 0n }
        )
      ).to.be.revertedWith("V2Router: INSUFFICIENT_ETH");
    });

    it("returns correct amounts and liquidity", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const ethAmount = ethers.parseEther("10");
      const tokenAmount = ethers.parseEther("20000");

      const tx = await router.addLiquidityETH.staticCall(
        await tokenA.getAddress(), tokenAmount, 0n, 0n, owner.address, deadline,
        { value: ethAmount }
      );

      expect(tx.amountToken).to.equal(tokenAmount);
      expect(tx.liquidity).to.be.gt(0n);
    });

    it("sends LP tokens to specified recipient", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidityETH(
        await tokenA.getAddress(),
        ethers.parseEther("20000"), 0n, 0n, user1.address, deadline,
        { value: ethers.parseEther("10") }
      );

      const wethAddr = await weth.getAddress();
      const pairAddr = await factory.getPair(await tokenA.getAddress(), wethAddr);
      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const lpAddr = await pool.lpToken();
      const lpToken = (await ethers.getContractAt("V2LPToken", lpAddr)) as unknown as V2LPToken;

      expect(await lpToken.balanceOf(user1.address)).to.be.gt(0n);
      expect(await lpToken.balanceOf(owner.address)).to.equal(0n);
    });

    it("reverts when deadline expired", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const expiredDeadline = Math.floor(Date.now() / 1000) - 600;

      await expect(
        router.addLiquidityETH(
          await tokenA.getAddress(), ethers.parseEther("20000"), 0n, 0n, owner.address, expiredDeadline,
          { value: ethers.parseEther("10") }
        )
      ).to.be.revertedWith("V2Router: EXPIRED");
    });

    it("refunds excess ETH to sender", async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.addLiquidityETH(
        await tokenA.getAddress(), ethers.parseEther("20000"), 0n, 0n, owner.address, deadline,
        { value: ethers.parseEther("10") }
      );

      const ethBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await router.addLiquidityETH(
        await tokenA.getAddress(), ethers.parseEther("2000"), 0n, 0n, owner.address, deadline,
        { value: ethers.parseEther("5") }
      );
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ethBalanceAfter = await ethers.provider.getBalance(owner.address);

      const ethSpent = ethBalanceBefore - ethBalanceAfter - gasCost;
      expect(ethSpent).to.be.lt(ethers.parseEther("2"));
      expect(ethSpent).to.be.gt(0n);
    });
  });

  describe("swapExactTokensForTokens", () => {
    beforeEach(async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );
    });

    it("swaps tokenA for tokenB", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const balBBefore = await tokenB.balanceOf(owner.address);

      const amounts = await router.getAmountsOut(swapIn, [await tokenA.getAddress(), await tokenB.getAddress()]);

      await router.swapExactTokensForTokens(
        swapIn, 0n,
        [await tokenA.getAddress(), await tokenB.getAddress()],
        owner.address, deadline
      );

      const got = (await tokenB.balanceOf(owner.address)) - balBBefore;
      expect(got).to.equal(amounts[1]);
      expect(got).to.be.gt(0n);
    });

    it("reverts when output below minimum", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const hugeMin = ethers.parseEther("999999");

      await expect(
        router.swapExactTokensForTokens(
          swapIn, hugeMin,
          [await tokenA.getAddress(), await tokenB.getAddress()],
          owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: INSUFFICIENT_OUTPUT_AMOUNT");
    });

    it("reverts when deadline expired", async () => {
      const swapIn = ethers.parseEther("100");
      const expiredDeadline = Math.floor(Date.now() / 1000) - 600;

      await expect(
        router.swapExactTokensForTokens(
          swapIn, 0n,
          [await tokenA.getAddress(), await tokenB.getAddress()],
          owner.address, expiredDeadline
        )
      ).to.be.revertedWith("V2Router: EXPIRED");
    });

    it("reverts with zero amountIn", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        router.swapExactTokensForTokens(
          0n, 0n,
          [await tokenA.getAddress(), await tokenB.getAddress()],
          owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: ZERO_AMOUNT");
    });

    it("sends output to specified recipient", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await router.swapExactTokensForTokens(
        swapIn, 0n,
        [await tokenA.getAddress(), await tokenB.getAddress()],
        user1.address, deadline
      );

      expect(await tokenB.balanceOf(user1.address)).to.be.gt(0n);
    });

    it("deducts 0.3% fee correctly", async () => {
      const swapIn = ethers.parseEther("1000");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const amounts = await router.getAmountsOut(swapIn, [await tokenA.getAddress(), await tokenB.getAddress()]);

      const amountInWithFee = swapIn * 997n;
      const expectedOut = (amountInWithFee * INITIAL_B) / (INITIAL_A * 1000n + amountInWithFee);

      expect(amounts[1]).to.equal(expectedOut);
      expect(amounts[1]).to.be.lt(swapIn * INITIAL_B / INITIAL_A);
    });

    it("updates reserves correctly after swap", async () => {
      const swapIn = ethers.parseEther("1000");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;

      const [r0Before, r1Before] = await pool.getReserves();

      const amounts = await router.getAmountsOut(swapIn, [await tokenA.getAddress(), await tokenB.getAddress()]);

      await router.swapExactTokensForTokens(
        swapIn, 0n,
        [await tokenA.getAddress(), await tokenB.getAddress()],
        owner.address, deadline
      );

      const [r0After, r1After] = await pool.getReserves();

      const reserveChange = (r0After + r1After) - (r0Before + r1Before);
      expect(reserveChange).to.equal(swapIn - amounts[1]);
    });
  });

  describe("swapExactETHForTokens", () => {
    beforeEach(async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const ethAmount = ethers.parseEther("10");
      const tokenAmount = ethers.parseEther("20000");

      await router.addLiquidityETH(
        await tokenA.getAddress(), tokenAmount, 0n, 0n, owner.address, deadline,
        { value: ethAmount }
      );
    });

    it("swaps ETH for tokenA", async () => {
      const swapIn = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      const balBefore = await tokenA.balanceOf(owner.address);

      const amounts = await router.getAmountsOut(swapIn, [wethAddr, await tokenA.getAddress()]);

      await router.swapExactETHForTokens(
        0n, [wethAddr, await tokenA.getAddress()], owner.address, deadline,
        { value: swapIn }
      );

      const got = (await tokenA.balanceOf(owner.address)) - balBefore;
      expect(got).to.equal(amounts[1]);
    });

    it("reverts when path doesn't start with WETH", async () => {
      const swapIn = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      await expect(
        router.swapExactETHForTokens(
          0n, [await tokenA.getAddress(), wethAddr], owner.address, deadline,
          { value: swapIn }
        )
      ).to.be.revertedWith("V2Router: INVALID_PATH");
    });

    it("reverts when deadline expired", async () => {
      const swapIn = ethers.parseEther("1");
      const expiredDeadline = Math.floor(Date.now() / 1000) - 600;
      const wethAddr = await weth.getAddress();

      await expect(
        router.swapExactETHForTokens(
          0n, [wethAddr, await tokenA.getAddress()], owner.address, expiredDeadline,
          { value: swapIn }
        )
      ).to.be.revertedWith("V2Router: EXPIRED");
    });

    it("reverts with zero ETH", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      await expect(
        router.swapExactETHForTokens(
          0n, [wethAddr, await tokenA.getAddress()], owner.address, deadline,
          { value: 0n }
        )
      ).to.be.revertedWith("V2Router: INSUFFICIENT_ETH");
    });

    it("sends output to specified recipient", async () => {
      const swapIn = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      await router.swapExactETHForTokens(
        0n, [wethAddr, await tokenA.getAddress()], user1.address, deadline,
        { value: swapIn }
      );

      expect(await tokenA.balanceOf(user1.address)).to.be.gt(0n);
    });
  });

  describe("swapExactTokensForETH", () => {
    beforeEach(async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      const ethAmount = ethers.parseEther("10");
      const tokenAmount = ethers.parseEther("20000");

      await router.addLiquidityETH(
        await tokenA.getAddress(), tokenAmount, 0n, 0n, owner.address, deadline,
        { value: ethAmount }
      );
    });

    it("swaps tokenA for ETH (unwraps WETH)", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      const ethBalBefore = await ethers.provider.getBalance(owner.address);

      const amounts = await router.getAmountsOut(swapIn, [await tokenA.getAddress(), wethAddr]);

      const tx = await router.swapExactTokensForETH(
        swapIn, 0n,
        [await tokenA.getAddress(), wethAddr],
        owner.address, deadline
      );
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      const ethBalAfter = await ethers.provider.getBalance(owner.address);
      const ethReceived = ethBalAfter - ethBalBefore + gasCost;

      expect(ethReceived).to.equal(amounts[1]);
      expect(ethReceived).to.be.gt(0n);
    });

    it("reverts when path doesn't end with WETH", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      await expect(
        router.swapExactTokensForETH(
          swapIn, 0n,
          [await tokenA.getAddress(), await tokenB.getAddress()],
          owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: INVALID_PATH");
    });

    it("reverts with zero amountIn", async () => {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      await expect(
        router.swapExactTokensForETH(
          0n, 0n,
          [await tokenA.getAddress(), wethAddr],
          owner.address, deadline
        )
      ).to.be.revertedWith("V2Router: ZERO_AMOUNT");
    });

    it("sends ETH output to specified recipient", async () => {
      const swapIn = ethers.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const wethAddr = await weth.getAddress();

      const ethBalBefore = await ethers.provider.getBalance(user1.address);

      await router.swapExactTokensForETH(
        swapIn, 0n,
        [await tokenA.getAddress(), wethAddr],
        user1.address, deadline
      );

      const ethBalAfter = await ethers.provider.getBalance(user1.address);
      expect(ethBalAfter).to.be.gt(ethBalBefore);
    });
  });

  describe("getAmountsOut", () => {
    beforeEach(async () => {
      await tokenA.approve(await router.getAddress(), ethers.MaxUint256);
      await tokenB.approve(await router.getAddress(), ethers.MaxUint256);

      const deadline = Math.floor(Date.now() / 1000) + 600;
      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        INITIAL_A, INITIAL_B, 0n, 0n, owner.address, deadline
      );
    });

    it("returns correct amounts for single hop", async () => {
      const amountIn = ethers.parseEther("100");
      const amounts = await router.getAmountsOut(
        amountIn, [await tokenA.getAddress(), await tokenB.getAddress()]
      );

      expect(amounts[0]).to.equal(amountIn);
      expect(amounts[1]).to.be.gt(0n);

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pool = (await ethers.getContractAt("V2AMM", pairAddr)) as unknown as V2AMM;
      const [r0, r1] = await pool.getReserves();
      const token0Addr = await pool.token0();

      let reserveIn: bigint, reserveOut: bigint;
      if ((await tokenA.getAddress()) === token0Addr) {
        reserveIn = r0;
        reserveOut = r1;
      } else {
        reserveIn = r1;
        reserveOut = r0;
      }

      const amountInWithFee = amountIn * 997n;
      const expectedOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
      expect(amounts[1]).to.equal(expectedOut);
    });

    it("reverts for path with less than 2 tokens", async () => {
      await expect(
        router.getAmountsOut(ethers.parseEther("1"), [await tokenA.getAddress()])
      ).to.be.revertedWith("V2Router: INVALID_PATH");
    });

    it("reverts when pair doesn't exist", async () => {
      const MockTokenFactory = await ethers.getContractFactory("MockToken");
      const fake = (await MockTokenFactory.deploy("Fake", "FAKE", 18)) as unknown as MockToken;

      await expect(
        router.getAmountsOut(
          ethers.parseEther("1"),
          [await tokenA.getAddress(), await fake.getAddress()]
        )
      ).to.be.revertedWith("V2Router: PAIR_NOT_FOUND");
    });

    it("shows price impact for large trades", async () => {
      const smallAmount = ethers.parseEther("100");
      const largeAmount = ethers.parseEther("5000");

      const smallOut = await router.getAmountsOut(
        smallAmount, [await tokenA.getAddress(), await tokenB.getAddress()]
      );
      const largeOut = await router.getAmountsOut(
        largeAmount, [await tokenA.getAddress(), await tokenB.getAddress()]
      );

      const smallPrice = (smallOut[1] * 10000n) / smallAmount;
      const largePrice = (largeOut[1] * 10000n) / largeAmount;
      expect(largePrice).to.be.lt(smallPrice);
    });
  });

  describe("getAmountOut", () => {
    it("returns correct output for given reserves", async () => {
      const amountIn = ethers.parseEther("100");
      const reserveIn = ethers.parseEther("10000");
      const reserveOut = ethers.parseEther("20000");

      const out = await router.getAmountOut(amountIn, reserveIn, reserveOut);

      const amountInWithFee = amountIn * 997n;
      const expected = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);
      expect(out).to.equal(expected);
    });

    it("reverts for zero input", async () => {
      await expect(
        router.getAmountOut(0n, ethers.parseEther("10000"), ethers.parseEther("20000"))
      ).to.be.revertedWith("V2Router: ZERO_AMOUNT");
    });

    it("reverts for zero reserves", async () => {
      await expect(
        router.getAmountOut(ethers.parseEther("100"), 0n, ethers.parseEther("20000"))
      ).to.be.revertedWith("V2Router: NO_LIQUIDITY");
    });
  });
});
