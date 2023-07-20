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
    lastTransferId, // lastTransferId
    provider, // provider
    sourceToken, // sourceToken
    targetToken, // targetToken
    receiver, // receiver
    timestamp,
    amount, // amount
) {
    const encoded = ethers.utils.solidityPack([
        "bytes32",
        "address",
        "address",
        "address",
        "address",
        "uint64",
        "uint112",
    ], [lastTransferId, provider, sourceToken, targetToken, receiver, timestamp, amount]);
    return ethUtil.keccak256(encoded);
}

describe("eth->arb lnv2 positive bridge tests", () => {
  before(async () => {
  });

  it("test_lnv2_flow", async function () {
      const [owner, relayer, user, slasher] = await ethers.getSigners();
      const dao = owner.address;
      const protocolFee = 100;
      const penalty = 200;
      const feeReceiver = "0x1000000000000000000000000000000000000001";
      const nullAddress = "0x0000000000000000000000000000000000000000";
      const baseFee = 300;
      const liquidityFeeRate = 1;
      const initTokenBalance = 1000000;
      const initMargin = 10000;
      const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const transferAmount = 30;

      // deploy erc20 token contract
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
      console.log("contract deploy erc20 finished");

      // mint some tokens on source chain and target chain for relayer
      await ethToken.mint(feeReceiver, initTokenBalance);
      await arbToken.mint(feeReceiver, initTokenBalance);
      await ethToken.mint(relayer.address, initTokenBalance);
      await arbToken.mint(relayer.address, initTokenBalance);
      await ethToken.mint(user.address, initTokenBalance);
      await arbToken.mint(user.address, initTokenBalance);
      await ethToken.mint(owner.address, initTokenBalance);
      await arbToken.mint(owner.address, initTokenBalance);
      await ethToken.mint(slasher.address, initTokenBalance);
      await arbToken.mint(slasher.address, initTokenBalance);

      // deploy inboundLane
      const inboxContract = await ethers.getContractFactory("MockArbitrumInbox");
      const inbox = await inboxContract.deploy();
      await inbox.deployed();
      console.log("deploy mock inbox success");
      //******* deploy inboundLane/outboundLane finished ********

      const eth2arbSourceContract = await ethers.getContractFactory("Eth2ArbSource");
      const eth2arbSource = await eth2arbSourceContract.deploy();
      await eth2arbSource.deployed();

      // configure
      // init
      // set fee receiver
      // register token
      await eth2arbSource.initialize(dao, inbox.address);
      await eth2arbSource.updateFeeReceiver(feeReceiver);
      await eth2arbSource.setTokenInfo(
          ethToken.address,
          arbToken.address,
          protocolFee,
          penalty,
          18,
          18
      );

      const eth2arbTargetContract = await ethers.getContractFactory("Eth2ArbTarget");
      const eth2arbTarget = await eth2arbTargetContract.deploy();
      await eth2arbTarget.deployed();
      await eth2arbTarget.initialize(dao);

      await eth2arbSource.setRemoteBridge(eth2arbTarget.address);
      await eth2arbTarget.setRemoteBridge(eth2arbSource.address);
      await eth2arbTarget.setRemoteBridgeAlias(inbox.address);
      console.log("deploy bridge finished");

      // provider 
      await ethToken.connect(relayer).approve(eth2arbSource.address, initTokenBalance);
      await arbToken.connect(relayer).approve(eth2arbTarget.address, initTokenBalance);
      // register on source chain(set provider fee)
      await eth2arbSource.connect(relayer).setProviderFee(
          ethToken.address,
          baseFee,
          liquidityFeeRate
      );
      await eth2arbTarget.connect(relayer).depositProviderMargin(
          ethToken.address,
          arbToken.address,
          initMargin
      );

      async function getCurrentTransferId(lastTransferId) {
          const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId = getTransferId(
              lastTransferId, // lastTransferId
              relayer.address, // provider
              ethToken.address, // sourceToken
              arbToken.address, // targetToken
              user.address, // receiver
              blockTimestamp,
              transferAmount, // amount
          );

          // check transferId exist on source chain
          const lockInfo = await eth2arbSource.lockInfos(transferId);
          expect(lockInfo.isLocked).to.equal(true);
          return transferId;
      }

      async function transfer(lastTransferId, withdrawNonce) {
          const totalFee = Number(await eth2arbSource.totalFee(
              relayer.address,
              ethToken.address,
              transferAmount
          ));
          const balanceOfUser = await ethToken.balanceOf(user.address);
          const balanceOfRelayer = await ethToken.balanceOf(relayer.address);
          const tx = await eth2arbSource.connect(user).transferAndLockMargin(
              [
                  relayer.address,
                  ethToken.address,
                  lastTransferId,
                  totalFee,
                  withdrawNonce
              ],
              transferAmount,
              user.address,
          );
          const balanceOfUserAfter = await ethToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await ethToken.balanceOf(relayer.address);
          expect(balanceOfUser - balanceOfUserAfter).to.equal(totalFee + transferAmount);
          expect(balanceOfRelayerAfter - balanceOfRelayer).to.equal(transferAmount + totalFee - protocolFee);
          return tx;
      }

      async function relay(lastTransferId, transferId, timestamp) {
          let blockTimestamp = timestamp;
          if (blockTimestamp === null) { 
              blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          }
          const balanceOfUser = await arbToken.balanceOf(user.address);
          const balanceOfRelayer = await arbToken.balanceOf(relayer.address);
          const relayTransaction = await eth2arbTarget.connect(relayer).transferAndReleaseMargin(
              [
                  lastTransferId, // lastTransferId
                  relayer.address, // provider
                  ethToken.address, // sourceToken
                  arbToken.address, // targetToken
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              transferId
          );

          // check relay result
          const relayTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const fillInfo = await eth2arbTarget.fillTransfers(transferId);
          expect(fillInfo.timestamp).to.equal(relayTimestamp);
          expect(fillInfo.slasher).to.equal(nullAddress);
          const balanceOfUserAfter = await arbToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await arbToken.balanceOf(relayer.address);
          expect(balanceOfUserAfter - balanceOfUser).to.equal(transferAmount);
          expect(balanceOfRelayer - balanceOfRelayerAfter).to.equal(transferAmount);
          return relayTransaction;
      }

      async function slash(lastTransferId, expectedTransferId, timestamp) {
          let blockTimestamp = timestamp;
          if (blockTimestamp === null) { 
              blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          }
          const fillInfoBefore = await eth2arbTarget.fillTransfers(expectedTransferId);
          const timestampBefore = fillInfoBefore.timestamp;
          const balanceOfUser = await arbToken.balanceOf(user.address);
          const balanceOfSlasher = await arbToken.balanceOf(slasher.address);
          const slashTransaction = await eth2arbSource.connect(slasher).slashAndRemoteRelease(
              [
                  lastTransferId,
                  relayer.address,
                  ethToken.address,
                  arbToken.address,
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              expectedTransferId,
              0,
              0,
              200
          );
          const relayTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const fillInfo = await eth2arbTarget.fillTransfers(expectedTransferId);
          const balanceOfUserAfter = await arbToken.balanceOf(user.address);
          const balanceOfSlasherAfter = await arbToken.balanceOf(slasher.address);
          if (timestampBefore > 0) {
              expect(fillInfo.timestamp).to.equal(timestampBefore);
              expect(balanceOfUserAfter - balanceOfUser).to.equal(0);
              expect(balanceOfSlasherAfter - balanceOfSlasher).to.equal(penalty);
          } else {
              const totalFee = Number(await eth2arbSource.totalFee(
                  relayer.address,
                  ethToken.address,
                  transferAmount
              ));
              expect(fillInfo.timestamp).to.equal(relayTimestamp);
              expect(balanceOfUserAfter - balanceOfUser).to.equal(transferAmount);
              expect(balanceOfSlasherAfter - balanceOfSlasher).to.equal(penalty + totalFee);
          }
          expect(fillInfo.slasher).to.equal(slasher.address);
          return slashTransaction;
      }

      // user lock
      await ethToken.connect(user).approve(eth2arbSource.address, initTokenBalance);
      const totalFee = Number(await eth2arbSource.totalFee(
          relayer.address,
          ethToken.address,
          transferAmount
      ));
      const lockTransaction = await transfer(initTransferId, 0);
      let lockReceipt = await lockTransaction.wait();
      let lockGasUsed = lockReceipt.cumulativeGasUsed;
      console.log("transferAndLockMargin gas used", lockGasUsed);
      const blockTimestamp01 = (await ethers.provider.getBlock("latest")).timestamp;

      const transferId01 = await getCurrentTransferId(initTransferId);

      const relayTransaction = await relay(initTransferId, transferId01, null);
      let relayReceipt = await relayTransaction.wait();
      let relayGasUsed = relayReceipt.cumulativeGasUsed;
      console.log("relay gas used", relayGasUsed);

      // check balance
      const userEthBalance = initTokenBalance - transferAmount - totalFee;
      const relayerEthBalance = initTokenBalance + transferAmount + totalFee - protocolFee;
      const userArbBalance = initTokenBalance + transferAmount;
      const relayerArbBalance = initTokenBalance - transferAmount - initMargin;
      expect(await ethToken.balanceOf(user.address)).to.equal(userEthBalance);
      expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthBalance);
      expect(await arbToken.balanceOf(user.address)).to.equal(userArbBalance);
      expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbBalance);
      console.log("normal lock and release test finished");

      // check unique and continuous
      await expect(transfer(initTransferId, 0)).to.be.revertedWith("snapshot expired:transfer");
      await expect(transfer(transferId01, 1)).to.be.revertedWith("snapshot expired:withdraw");

      await transfer(transferId01, 0)
      const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId02 = await getCurrentTransferId(transferId01);
      await transfer(transferId02, 0)
      const blockTimestamp03 = (await ethers.provider.getBlock("latest")).timestamp;
      const transferId03 = await getCurrentTransferId(transferId02);

      // release transfer02 failed
      await expect(relay(transferId02, transferId03, null)).to.be.revertedWith("last transfer not filled");
      // 1. slash when not timeout
      await expect(slash(transferId02, transferId03, null)).to.be.revertedWith("invalid timestamp");

      await hre.network.provider.request({
          method: "evm_increaseTime",
          params: [18001],
      });
      await expect(slash(transferId02, transferId03, blockTimestamp03)).to.be.revertedWith("arbitrum mock call failed");
      console.log("check continuous success");

      // 2. slash when timeout, but relayed
      await expect(slash(initTransferId, transferId01, blockTimestamp01)).to.be.revertedWith("arbitrum mock call failed");
      // relay 02 && slash 02
      await relay(transferId01, transferId02, blockTimestamp02);
      // can't relay twice
      await expect(relay(transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("transfer has been filled");
      // 3. slash when timeout but relayed(timeout)
      // can slash if relayed when timeout
      await slash(transferId01, transferId02, blockTimestamp02);
      // 4. slash when slash has finished
      // can't slash twice
      await expect(slash(transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("arbitrum mock call failed");
      // slash 03
      // 5. slash when timeout and not relayed
      // can slash if not relayed when timeout
      await slash(transferId02, transferId03, blockTimestamp03);
      
      console.log("ln bridge test finished");
  });
});
