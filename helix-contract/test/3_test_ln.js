const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

chai.use(solidity);

async function getBlockTimestamp() {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
}

function getTransferId(
    lastTransferId,
    lastBlockHash,
    nonce,
    timestamp,
    remoteToken,
    receiver,
    amount
) {
    const encoded = ethers.utils.solidityPack([
        "bytes32",
        "bytes32",
        "uint48",
        "uint64",
        "address",
        "address",
        "uint112",
    ], [lastTransferId, lastBlockHash, nonce, timestamp, remoteToken, receiver, amount]);
    return ethUtil.keccak256(encoded);
}

describe("arb<>eth lnv2 bridge tests", () => {
  before(async () => {
  });

  it("test_lnv2_flow", async function () {
      // deploy inboundLane
      const inboxContract = await ethers.getContractFactory("MockArbitrumInbox");
      const inbox = await inboxContract.deploy();
      await inbox.deployed();
      console.log("deploy mock inbox success");
      //******* deploy inboundLane/outboundLane finished ********

      const [owner, relayer, other] = await ethers.getSigners();
      const dao = owner.address;
      const feeReceiver = "0x1000000000000000000000000000000000000001";
      const helixFee = 100;
      const initTokenBalance = 1000000;
      const penaltyLnCollateral = 100;
      var margin = 2000;
      const baseFee = 20;
      const liquidityFeeRate = 100;
      const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      //******* deploy lp bridge at ethereum *******
      const lnBridgeContractOnL2 = await ethers.getContractFactory("LnArbitrumBridgeOnL2");
      const lnBridgeOnL2 = await lnBridgeContractOnL2.deploy();
      await lnBridgeOnL2.deployed();
      await lnBridgeOnL2.initialize(dao);
      console.log("ln bridge on L2 address", lnBridgeOnL2.address);
      await lnBridgeOnL2.updateFeeReceiver(feeReceiver);

      const lnBridgeContractOnL1 = await ethers.getContractFactory("LnArbitrumBridgeOnL1");
      const lnBridgeOnL1 = await lnBridgeContractOnL1.deploy();
      await lnBridgeOnL1.deployed();
      await lnBridgeOnL1.initialize(dao, inbox.address);
      console.log("ln bridge on L1 address", lnBridgeOnL1.address);
      // init owner
      //******* deploy ln bridge at end ***************
      //
      await lnBridgeOnL2.setRemoteBridge(lnBridgeOnL1.address);
      await lnBridgeOnL1.setRemoteBridge(lnBridgeOnL2.address);

      const tokenNameOnEthereum = "Darwinia Ring On Ethereum";
      const tokenSymbolOnEthereum = "RING.e";
      const ethContract = await ethers.getContractFactory("Erc20");
      const ethToken = await ethContract.deploy(tokenNameOnEthereum, tokenSymbolOnEthereum, 18);
      await ethToken.deployed();

      const tokenNameOnArbitrum = "Darwinia Ring On Arbitrum";
      const tokenSymbolOnArbitrum = "RING.a";
      const arbContract = await ethers.getContractFactory("Erc20");
      const arbToken = await ethContract.deploy(tokenNameOnArbitrum, tokenSymbolOnArbitrum, 18);
      await arbToken.deployed();
      console.log("contract deploy finished");

      // 1. register token
      await lnBridgeOnL2.grantRole(lnBridgeOnL2.OPERATOR_ROLE(), owner.address);
      await lnBridgeOnL2.registerToken(
          arbToken.address,
          ethToken.address,
          helixFee,
          penaltyLnCollateral,
          18,
          18
      );
      console.log("register token finished");

      await ethToken.mint(feeReceiver, initTokenBalance);
      await arbToken.mint(feeReceiver, initTokenBalance);
      // 2. register lnbridger
      // 2.1 mint some tokens on source chain and target chain for relayer
      await ethToken.mint(relayer.address, initTokenBalance);
      await arbToken.mint(relayer.address, initTokenBalance);
      await ethToken.mint(other.address, initTokenBalance);
      await arbToken.mint(other.address, initTokenBalance);
      await ethToken.mint(owner.address, initTokenBalance);

      await arbToken.connect(relayer).approve(lnBridgeOnL2.address, initTokenBalance * 1000);
      await lnBridgeOnL2.connect(relayer).registerOrUpdateLnProvider(
          0, // tokenIndex
          margin, // margin
          baseFee, // basefee
          liquidityFeeRate // liquidity fee rate x/100,000
      );
      console.log("register provider finished");

      // 3. transfer and lock margin
      // 3.1 normal
      const transferAmount01 = 300;
      const expectedFee = Math.floor(transferAmount01 * 100 / 100000 + 20 + helixFee);
      // 3.1.1 lock
      await arbToken.connect(other).approve(lnBridgeOnL2.address, 1000000000);
      const lastBlockHash = (await ethers.provider.getBlock("latest")).hash;
      const lockTransaction = await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [initTransferId, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      );
      const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      let lockReceipt = await lockTransaction.wait();
      let lockGasUsed = lockReceipt.cumulativeGasUsed;
      console.log("transferAndLockMargin gas used", lockGasUsed);
      const transferId01 = getTransferId(
          initTransferId, // lastTransferId
          lastBlockHash, // lastBlockHash
          1, // nonce
          blockTimestamp,
          ethToken.address, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      // 3.1.2 relay
      await ethToken.connect(relayer).approve(lnBridgeOnL1.address, 1000000000);
      const relayTransaction = await lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
        [
          initTransferId, // lastTransferId
          lastBlockHash,
          transferAmount01,
          1, //nonce
          blockTimestamp,
          ethToken.address, // token
          other.address
        ],
        transferId01
      );
      let relayReceipt = await relayTransaction.wait();
      let relayGasUsed = relayReceipt.cumulativeGasUsed;
      console.log("relay gas used", relayGasUsed);

      // relay finished, check the id and balance
      // check balance
      // arbtoken: relayer -> lnbridge (margin)
      //           other -> relayer (transferAmount01 + baseFee + liquidityFeeRate * amount)
      //           other -> feeReceive (helixFee)
      // ethtoken: relayer -> other (transferAmount01)
      const relayerFee01 = baseFee + Math.floor(liquidityFeeRate * transferAmount01/100000);
      const relayerArbToken01 = initTokenBalance - margin + transferAmount01 + relayerFee01;
      const lnBridgeArbToken01 = margin;
      const otherArbToken01 = initTokenBalance - transferAmount01 - relayerFee01 - helixFee;
      const feeReceiverArbToken01 = initTokenBalance + helixFee;
      const relayerEthToken01 = initTokenBalance - transferAmount01;
      const otherEthToken01 = initTokenBalance + transferAmount01;
      expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbToken01);
      expect(await arbToken.balanceOf(lnBridgeOnL2.address)).to.equal(lnBridgeArbToken01);
      expect(await arbToken.balanceOf(other.address)).to.equal(otherArbToken01);
      expect(await arbToken.balanceOf(feeReceiver)).to.equal(feeReceiverArbToken01);
      expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthToken01);
      expect(await ethToken.balanceOf(other.address)).to.equal(otherEthToken01);
      // check transferId
      // source chain
      const lockInfo01 = await lnBridgeOnL2.lockInfos(transferId01);
      expect(lockInfo01.amountWithFeeAndPenalty).to.equal(transferAmount01 + relayerFee01 + penaltyLnCollateral);
      expect(lockInfo01.nonce).to.equal(1);
      // target chain
      const transferInfo01 = await lnBridgeOnL1.transferInfos(transferId01);
      expect(transferInfo01.nonce).to.equal(1);
      expect(transferInfo01.lastRefundNonce).to.equal(0);
      expect(transferInfo01.slasher).to.equal(zeroAddress);

      // refund 02
      // lock
      // must be continuous
      await expect(lnBridgeOnL2.connect(other).transferAndLockMargin(
        [initTransferId, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      )).to.be.revertedWith("snapshot expired");
      const lastBlockHash02 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId01, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      );
      const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId02 = getTransferId(
          transferId01, // lastTransferId
          lastBlockHash02, // lastBlockHash
          2, // nonce
          blockTimestamp02,
          ethToken.address, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      // cannot refund before expired
      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId01,
              lastBlockHash02,
              transferAmount01,
              2,
              blockTimestamp02,
              ethToken.address,
              other.address
          ],
          initTransferId,
          transferId01,
          0,
          0,
          200
      )).to.be.revertedWith("refund time not expired");
      await hre.network.provider.request({
          method: "evm_increaseTime",
          //params: [await lnBridgeOnL1.MIN_REFUND_TIMESTAMP() + 1],
          params: [18001],
      });
      // refund
      // start refund
      // 1. relayed transfer cannot refund, try to refund transfer01 failed
      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              initTransferId, // lastTransferId
              lastBlockHash, // lastBlockHash
              transferAmount01, // amount
              1, // nonce
              blockTimestamp,
              ethToken.address, // remoteToken
              other.address, // receiver
          ],
          transferId01,
          transferId01,
          0,
          0,
          0
      )).to.be.revertedWith("lnBridgeTarget:message exist");

      // mock sender address
      await lnBridgeOnL2.setRemoteBridgeAlias(inbox.address);
      // request success
      await ethToken.approve(lnBridgeOnL1.address, 1000000000);
      await lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId01,
              lastBlockHash02,
              transferAmount01,
              2,
              blockTimestamp02,
              ethToken.address,
              other.address
          ],
          initTransferId,
          transferId02,
          0,
          0,
          200
      );
      // check balance
      // arbtoken: other -> relayer (transferAmount01 + baseFee + liquidityFeeRate * transferAmount01)
      //           lnBridgeOnL2 -> owner (transferAmount01 + baseFee + liquidityFeeRate * transferAmount01 + penaltyLnCollateral)
      //           other -> feeReceive (helixFee)
      // ethtoken: owner -> other (transferAmount01)
      const relayerFee02 = baseFee + Math.floor(liquidityFeeRate * transferAmount01/100000);
      const relayerArbToken02 = relayerArbToken01 + transferAmount01 + relayerFee02;
      const lnBridgeArbToken02 = lnBridgeArbToken01 - transferAmount01 - relayerFee02 - penaltyLnCollateral;
      const otherArbToken02 = otherArbToken01 - transferAmount01 - relayerFee02 - helixFee;
      const feeReceiverArbToken02 = feeReceiverArbToken01 + helixFee;
      const ownerArbToken02 = transferAmount01 + relayerFee02 + penaltyLnCollateral;
      const relayerEthToken02 = relayerEthToken01;
      const otherEthToken02 = otherEthToken01 + transferAmount01;
      const ownerEthToken02 = initTokenBalance - transferAmount01;
      expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbToken02);
      expect(await arbToken.balanceOf(lnBridgeOnL2.address)).to.equal(lnBridgeArbToken02);
      expect(await arbToken.balanceOf(other.address)).to.equal(otherArbToken02);
      expect(await arbToken.balanceOf(feeReceiver)).to.equal(feeReceiverArbToken02);
      expect(await arbToken.balanceOf(owner.address)).to.equal(ownerArbToken02);
      expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthToken02);
      expect(await ethToken.balanceOf(other.address)).to.equal(otherEthToken02);
      expect(await ethToken.balanceOf(owner.address)).to.equal(ownerEthToken02);
      margin -= (transferAmount01 + relayerFee02 + penaltyLnCollateral);

      // check refund continous
      // 3 refund, 4 relayed, 5 refund
      // locks
      const lastBlockHash03 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId02, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      );
      const blockTimestamp03 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId03 = getTransferId(
          transferId02, // lastTransferId
          lastBlockHash03, // lastBlockHash
          3, // nonce
          blockTimestamp03,
          ethToken.address, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      const lastBlockHash04 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId03, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      );
      const blockTimestamp04 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId04 = getTransferId(
          transferId03, // lastTransferId
          lastBlockHash04, // lastBlockHash
          4, // nonce
          blockTimestamp04,
          ethToken.address, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      const lastBlockHash05 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId04, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address // receiver
      );
      const blockTimestamp05 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId05 = getTransferId(
          transferId04, // lastTransferId
          lastBlockHash05, // lastBlockHash
          5, // nonce
          blockTimestamp05,
          ethToken.address, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      // refund 3
      await hre.network.provider.request({
          method: "evm_increaseTime",
          //params: [await lnBridgeOnL1.MIN_REFUND_TIMESTAMP() + 1],
          params: [18001],
      });

      // slash 03 failed on remote
      await lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId02,
              lastBlockHash03,
              transferAmount01,
              3,
              blockTimestamp03,
              ethToken.address,
              other.address
          ],
          transferId02,
          transferId03,
          0,
          0,
          0
      );

      // relay 4
      await lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
        [
            transferId03, // lastTransferId
            lastBlockHash04,
            transferAmount01,
            4, //nonce
            blockTimestamp04,
            ethToken.address, // token
            other.address
        ],
        transferId04
      );
      // refund 5 must after 3
      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId04,
              lastBlockHash05,
              transferAmount01,
              5,
              blockTimestamp05,
              ethToken.address,
              other.address
          ],
          transferId04,
          transferId05,
          0,
          0,
          0
      )).to.be.revertedWith("invalid last refund nonce");

      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId04,
              lastBlockHash05,
              transferAmount01,
              5,
              blockTimestamp05,
              ethToken.address,
              other.address
          ],
          transferId03,
          transferId05,
          0,
          0,
          200
      )).to.be.revertedWith("arbitrum mock call failed");

      // retry 3
      await lnBridgeOnL1.retryRemoteRefund(
          transferId02,
          transferId03,
          0,
          0,
          200
      );

      // then refund 5
      await lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId04,
              lastBlockHash05,
              transferAmount01,
              5,
              blockTimestamp05,
              ethToken.address,
              other.address
          ],
          transferId03,
          transferId05,
          0,
          0,
          200
      );
      // cannot relay the refunded
      await expect(lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
          [
              transferId04, // lastTransferId
              lastBlockHash05,
              transferAmount01,
              5, //nonce
              blockTimestamp05,
              ethToken.address, // token
              other.address
          ],
          transferId05
      )).to.revertedWith("lnBridgeTarget:message exist");

      console.log("ln bridge test finished");
  });

  it("test_lnv2_native", async function () {
      // deploy inboundLane
      const inboxContract = await ethers.getContractFactory("MockArbitrumInbox");
      const inbox = await inboxContract.deploy();
      await inbox.deployed();
      console.log("deploy mock inbox success");
      //******* deploy inboundLane/outboundLane finished ********

      const [owner, relayer, other] = await ethers.getSigners();
      const dao = owner.address;
      const feeReceiver = "0x1000000000000000000000000000000000000001";
      const helixFee = 100;
      const initTokenBalance = 1000000;
      const penaltyLnCollateral = 100;
      var margin = 2000;
      const baseFee = 20;
      const liquidityFeeRate = 100;
      const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const nativeTokenAddress = "0x0000000000000000000000000000000000000000";
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      //******* deploy lp bridge at ethereum *******
      const lnBridgeContractOnL2 = await ethers.getContractFactory("LnArbitrumBridgeOnL2");
      const lnBridgeOnL2 = await lnBridgeContractOnL2.deploy();
      await lnBridgeOnL2.deployed();
      await lnBridgeOnL2.initialize(dao);
      console.log("ln bridge on L2 address", lnBridgeOnL2.address);
      await lnBridgeOnL2.updateFeeReceiver(feeReceiver);

      const lnBridgeContractOnL1 = await ethers.getContractFactory("LnArbitrumBridgeOnL1");
      const lnBridgeOnL1 = await lnBridgeContractOnL1.deploy();
      await lnBridgeOnL1.deployed();
      await lnBridgeOnL1.initialize(dao, inbox.address);
      console.log("ln bridge on L1 address", lnBridgeOnL1.address);
      // init owner
      //******* deploy ln bridge at end ***************
      //
      await lnBridgeOnL2.setRemoteBridge(lnBridgeOnL1.address);
      await lnBridgeOnL1.setRemoteBridge(lnBridgeOnL2.address);

      // eth on both ethereum and atbitrum are native token
      // 1. register native token
      await lnBridgeOnL2.grantRole(lnBridgeOnL2.OPERATOR_ROLE(), owner.address);
      await lnBridgeOnL2.registerToken(
          nativeTokenAddress,
          nativeTokenAddress,
          helixFee,
          penaltyLnCollateral,
          18,
          18
      );
      console.log("register native token finished");

      await lnBridgeOnL2.connect(relayer).registerOrUpdateLnProvider(
          0, // tokenIndex
          margin, // margin
          baseFee, // basefee
          liquidityFeeRate, // liquidity fee rate x/100,000
          { value: margin }
      );
      console.log("register provider finished");

      // 3. transfer and lock margin
      // 3.1 normal
      const transferAmount01 = 300;
      const expectedFee = Math.floor(transferAmount01 * 100 / 100000 + 20 + helixFee);
      // 3.1.1 lock
      const lastBlockHash = (await ethers.provider.getBlock("latest")).hash;
      const lockTransaction = await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [initTransferId, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      );
      const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
      let lockReceipt = await lockTransaction.wait();
      let lockGasUsed = lockReceipt.cumulativeGasUsed;
      console.log("transferAndLockMargin gas used", lockGasUsed);
      // 3.1.2 relay
      const balanceOtherBefore = await ethers.provider.getBalance(other.address);
      const balanceRelayBefore = await ethers.provider.getBalance(relayer.address);
      await hre.network.provider.request({
          method: "evm_increaseTime",
          params: [18001],
      });
      const transferId01 = getTransferId(
          initTransferId, // lastTransferId
          lastBlockHash, // lastBlockHash
          1, // nonce
          blockTimestamp,
          nativeTokenAddress, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      const relayTransaction = await lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
        [
          initTransferId, // lastTransferId
          lastBlockHash,
          transferAmount01,
          1, //nonce
          blockTimestamp,
          nativeTokenAddress, // token
          other.address
        ],
        transferId01,
        { value: transferAmount01 }
      );
      let relayReceipt = await relayTransaction.wait();
      let relayGasUsed = relayReceipt.cumulativeGasUsed;
      console.log("relay gas used", relayGasUsed);
      const balanceOtherAfter = await ethers.provider.getBalance(other.address);
      const balanceRelayAfter = await ethers.provider.getBalance(relayer.address);
      let gasFeeRelayer01 = relayReceipt.cumulativeGasUsed.mul(relayReceipt.effectiveGasPrice);
      // check balance
      expect(balanceOtherAfter.sub(balanceOtherBefore)).to.equal(transferAmount01);
      expect(balanceRelayBefore.sub(balanceRelayAfter).sub(gasFeeRelayer01)).to.equal(transferAmount01);

      // relay finished, check the id and balance
      // check balance
      // arbtoken: relayer -> lnbridge (margin)
      //           other -> relayer (transferAmount01 + baseFee + liquidityFeeRate * amount)
      //           other -> feeReceive (helixFee)
      // ethtoken: relayer -> other (transferAmount01)

      // check transferId
      // source chain
      
      const lockInfo01 = await lnBridgeOnL2.lockInfos(transferId01);
      const relayerFee01 = baseFee + Math.floor(liquidityFeeRate * transferAmount01/100000);
      expect(lockInfo01.amountWithFeeAndPenalty).to.equal(transferAmount01 + relayerFee01 + penaltyLnCollateral);
      expect(lockInfo01.nonce).to.equal(1);
      // target chain
      const transferInfo01 = await lnBridgeOnL1.transferInfos(transferId01);
      expect(transferInfo01.nonce).to.equal(1);
      expect(transferInfo01.lastRefundNonce).to.equal(0);
      expect(transferInfo01.slasher).to.equal(zeroAddress);

      // refund 02
      // lock
      // must be continuous
      await expect(lnBridgeOnL2.connect(other).transferAndLockMargin(
        [initTransferId, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      )).to.be.revertedWith("snapshot expired");
      const lastBlockHash02 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId01, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      );
      const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId02 = getTransferId(
          transferId01, // lastTransferId
          lastBlockHash02, // lastBlockHash
          2, // nonce
          blockTimestamp02,
          nativeTokenAddress, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      // refund
      // start refund
      // 1. relayed transfer cannot refund, try to refund transfer01 failed
      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              initTransferId,
              lastBlockHash,
              transferAmount01,
              1,
              blockTimestamp,
              nativeTokenAddress,
              other.address,
          ],
          initTransferId,
          transferId01,
          0,
          0,
          200
      )).to.be.revertedWith("lnBridgeTarget:message exist");

      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId01,
              lastBlockHash02,
              transferAmount01,
              2,
              blockTimestamp02,
              nativeTokenAddress,
              other.address,
          ],
          initTransferId,
          transferId02,
          0,
          0,
          200
      )).to.be.revertedWith("refund time not expired");

      // 3. wait for timeout
      await hre.network.provider.request({
          method: "evm_increaseTime",
          //params: [await lnBridgeOnL1.MIN_REFUND_TIMESTAMP() + 1],
          params: [18001],
      });
      // mock sender address
      await lnBridgeOnL2.setRemoteBridgeAlias(inbox.address);
      // request success
      const balanceOtherBeforeCancel = await ethers.provider.getBalance(other.address);
      const balanceBridgeBeforeCancel = await ethers.provider.getBalance(lnBridgeOnL2.address);
      await lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId01,
              lastBlockHash02,
              transferAmount01,
              2,
              blockTimestamp02,
              nativeTokenAddress,
              other.address,
          ],
          initTransferId,
          transferId02,
          0,
          0,
          200,
          { value: transferAmount01 }
      );
      const balanceOtherAfterCancel = await ethers.provider.getBalance(other.address);
      const balanceBridgeAfterCancel = await ethers.provider.getBalance(lnBridgeOnL2.address);
      const relayerFee02 = baseFee + Math.floor(liquidityFeeRate * transferAmount01/100000);
      margin -= (transferAmount01 + relayerFee02 + penaltyLnCollateral);
      margin -= (transferAmount01 + relayerFee02 + penaltyLnCollateral);
      // check balance
      // arbtoken: other -> relayer (transferAmount01 + baseFee + liquidityFeeRate * transferAmount01)
      //           slasher -> other (transferAmount01)
      //           other -> feeReceive (helixFee)
      expect(balanceOtherAfterCancel.sub(balanceOtherBeforeCancel)).to.equal(transferAmount01);
      expect(balanceBridgeBeforeCancel.sub(balanceBridgeAfterCancel)).to.equal(transferAmount01 + relayerFee02 + penaltyLnCollateral);
      // check refund continous
      // 3 refund, 4 relayed, 5 refund
      // locks
      const lastBlockHash03 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId02, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      );
      const blockTimestamp03 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId03 = getTransferId(
          transferId02, // lastTransferId
          lastBlockHash03, // lastBlockHash
          3, // nonce
          blockTimestamp03,
          nativeTokenAddress, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      const lastBlockHash04 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId03, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      );
      const blockTimestamp04 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId04 = getTransferId(
          transferId03, // lastTransferId
          lastBlockHash04, // lastBlockHash
          4, // nonce
          blockTimestamp04,
          nativeTokenAddress, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      const lastBlockHash05 = (await ethers.provider.getBlock("latest")).hash;
      await lnBridgeOnL2.connect(other).transferAndLockMargin(
        [transferId04, margin, expectedFee],
        0, // providerKey
        transferAmount01, // amount
        other.address, // receiver
        { value: transferAmount01 + expectedFee }
      );
      const blockTimestamp05 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId05 = getTransferId(
          transferId04, // lastTransferId
          lastBlockHash05, // lastBlockHash
          5, // nonce
          blockTimestamp05,
          nativeTokenAddress, // remoteToken
          other.address, // receiver
          transferAmount01, // amount
      );
      await hre.network.provider.request({
          method: "evm_increaseTime",
          //params: [await lnBridgeOnL1.MIN_REFUND_TIMESTAMP() + 1],
          params: [18001],
      });
      // refund 3 failed on remote
      await lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId02,
              lastBlockHash03,
              transferAmount01,
              3,
              blockTimestamp03,
              nativeTokenAddress,
              other.address
          ],
          transferId02,
          transferId03,
          0,
          0,
          0,
          { value: transferAmount01 }
      )
      // relay 4
      await lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
        [
          transferId03, // lastTransferId
          lastBlockHash04,
          transferAmount01,
          4, //nonce
          blockTimestamp04,
          nativeTokenAddress, // token
          other.address
        ],
        transferId04,
        { value: transferAmount01 }
      );
      // refund 5
      // refund 5 must after 3
      await expect(lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId04,
              lastBlockHash05,
              transferAmount01,
              5,
              blockTimestamp05,
              nativeTokenAddress,
              other.address
          ],
          transferId03,
          transferId05,
          0,
          0,
          200,
          { value: transferAmount01 }
      )).to.be.revertedWith("arbitrum mock call failed");

      // retry 3
      await lnBridgeOnL1.retryRemoteRefund(
          transferId02,
          transferId03,
          0,
          0,
          200
      );
      // then refund 5
      lnBridgeOnL1.slashAndRemoteRefund(
          [
              transferId04,
              lastBlockHash05,
              transferAmount01,
              5,
              blockTimestamp05,
              nativeTokenAddress,
              other.address
          ],
          transferId03,
          transferId05,
          0,
          0,
          200,
          { value: transferAmount01 }
      )
      // cannot relay the refunded
      await expect(lnBridgeOnL1.connect(relayer).transferAndReleaseMargin(
        [
          transferId04, // lastTransferId
          lastBlockHash05,
          transferAmount01,
          5, //nonce
          blockTimestamp05,
          nativeTokenAddress, // token
          other.address
        ],
        transferId05,
        { value: transferAmount01 }
      )).to.revertedWith("lnBridgeTarget:message exist");

      console.log("ln bridge test native finished");
  });
});
