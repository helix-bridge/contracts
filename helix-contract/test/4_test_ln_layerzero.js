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
    localChainId,
    remoteChainId,
    lastTransferId, // lastTransferId
    provider, // provider
    sourceToken, // sourceToken
    targetToken, // targetToken
    receiver, // receiver
    amount, // amount
) {
    const encoded = ethers.utils.solidityPack([
        "uint256",
        "uint256",
        "bytes32",
        "address",
        "address",
        "address",
        "address",
        "uint112",
    ], [localChainId, remoteChainId, lastTransferId, provider, sourceToken, targetToken, receiver, amount]);
    return ethUtil.keccak256(encoded);
}

function getProviderKey(
    remoteChainId,
    provider,
    sourceToken,
    remoteToken
) {
    const encode = ethers.utils.solidityPack([
        "uint256",
        "address",
        "address",
        "address",
    ], [remoteChainId, provider, sourceToken, remoteToken]);
    return ethUtil.keccak256(encode);
}

describe("eth->arb lnv2 layerzero bridge tests", () => {
  before(async () => {
  });

  it("test_lnv2_layerzero", async function () {
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
      const initSlashReserveFund = 1000;
      const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const transferAmount = 30;
      const ethChainId = 31337;
      const arbChainId = 31337;

      // deploy erc20 token contract
      const tokenNameOnEthereum = "Darwinia Ring On Ethereum";
      const tokenSymbolOnEthereum = "RING.e";
      const ethContract = await ethers.getContractFactory("Erc20");
      const ethToken = await ethContract.deploy(tokenNameOnEthereum, tokenSymbolOnEthereum, 18);
      await ethToken.deployed();

      const tokenNameOnArbitrum = "Darwinia Ring On Arbitrum";
      const tokenSymbolOnArbitrum = "RING.a";
      const arbContract = await ethers.getContractFactory("Erc20");
      const arbToken = await ethContract.deploy(tokenNameOnArbitrum, tokenSymbolOnArbitrum, 9);
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

      // deploy LayerZeroEndpointMock
      const endpointContract = await ethers.getContractFactory("LayerZeroEndpointMock");
      const endpoint = await endpointContract.deploy(ethChainId);
      await endpoint.deployed();
      console.log("deploy mock endpoint success");
      //******* deploy endpoint finished ********

      // deploy layerzero messager
      const lzMessagerContract = await ethers.getContractFactory("LayerZeroMessager");
      const lzMessagerEth = await lzMessagerContract.deploy(dao, endpoint.address);
      await lzMessagerEth.deployed();
      const lzMessagerArb = await lzMessagerContract.deploy(dao, endpoint.address);
      await lzMessagerArb.deployed();

      await lzMessagerEth.setRemoteMessager(arbChainId, arbChainId, lzMessagerArb.address);
      await lzMessagerArb.setRemoteMessager(ethChainId, ethChainId, lzMessagerEth.address);

      const lnDefaultBridgeContract = await ethers.getContractFactory("LnDefaultBridge");

      const lnDefaultBridgeEth = await lnDefaultBridgeContract.deploy();
      await lnDefaultBridgeEth.deployed();
      const lnDefaultBridgeArb = await lnDefaultBridgeContract.deploy();
      await lnDefaultBridgeArb.deployed();

      // configure
      // init
      // set fee receiver
      // register token
      await lnDefaultBridgeEth.initialize(dao);
      await lnDefaultBridgeEth.updateFeeReceiver(feeReceiver);
      await lnDefaultBridgeEth.setTokenInfo(
          arbChainId,
          ethToken.address,
          arbToken.address,
          protocolFee,
          penalty,
          18,
          18
      );

      await lnDefaultBridgeArb.initialize(dao);
      await lnDefaultBridgeArb.updateFeeReceiver(feeReceiver);
      await lnDefaultBridgeArb.setTokenInfo(
          arbChainId,
          arbToken.address,
          ethToken.address,
          protocolFee,
          penalty,
          18,
          18
      );
      // ******************* register token **************

      // set bridge infos
      await lzMessagerEth.authoriseAppCaller(lnDefaultBridgeEth.address, true);
      await lzMessagerArb.authoriseAppCaller(lnDefaultBridgeArb.address, true);
      await lnDefaultBridgeEth.setSendService(arbChainId, lnDefaultBridgeArb.address, lzMessagerEth.address);
      await lnDefaultBridgeArb.setReceiveService(ethChainId, lnDefaultBridgeEth.address, lzMessagerArb.address);
      console.log("deploy bridge finished");

      // provider 
      await ethToken.connect(relayer).approve(lnDefaultBridgeEth.address, initTokenBalance);
      await arbToken.connect(relayer).approve(lnDefaultBridgeArb.address, initTokenBalance);
      // register on source chain(set provider fee)
      await lnDefaultBridgeEth.connect(relayer).setProviderFee(
          arbChainId,
          ethToken.address,
          arbToken.address,
          baseFee,
          liquidityFeeRate
      );
      await lnDefaultBridgeArb.connect(relayer).depositProviderMargin(
          ethChainId,
          ethToken.address,
          arbToken.address,
          initMargin
      );
      await lnDefaultBridgeArb.connect(relayer).depositSlashFundReserve(
          ethChainId,
          ethToken.address,
          arbToken.address,
          initSlashReserveFund
      );

      async function getCurrentTransferId(lastTransferId) {
          const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId = getTransferId(
              ethChainId,
              arbChainId,
              lastTransferId, // lastTransferId
              relayer.address, // provider
              ethToken.address, // sourceToken
              arbToken.address, // targetToken
              user.address, // receiver
              transferAmount, // amount
          );

          // check transferId exist on source chain
          const lockInfo = await lnDefaultBridgeEth.lockInfos(transferId);
          expect(lockInfo.timestamp).to.equal(blockTimestamp);
          return transferId;
      }

      async function transfer(lastTransferId, withdrawNonce) {
          const totalFee = Number(await lnDefaultBridgeEth.totalFee(
              arbChainId,
              relayer.address,
              ethToken.address,
              arbToken.address,
              transferAmount
          ));
          const balanceOfUser = await ethToken.balanceOf(user.address);
          const balanceOfRelayer = await ethToken.balanceOf(relayer.address);
          const tx = await lnDefaultBridgeEth.connect(user).transferAndLockMargin(
              [
                  arbChainId,
                  relayer.address,
                  ethToken.address,
                  arbToken.address,
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
          const relayTransaction = await lnDefaultBridgeArb.connect(relayer).transferAndReleaseMargin(
              [
                  lastTransferId, // lastTransferId
                  relayer.address, // provider
                  ethToken.address, // sourceToken
                  arbToken.address, // targetToken
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              ethChainId,
              transferId
          );

          // check relay result
          const relayTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const fillInfo = await lnDefaultBridgeArb.fillTransfers(transferId);
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
          const fillInfoBefore = await lnDefaultBridgeArb.fillTransfers(expectedTransferId);
          const timestampBefore = fillInfoBefore.timestamp;
          const balanceOfUser = await arbToken.balanceOf(user.address);
          const balanceOfSlasher = await arbToken.balanceOf(slasher.address);
          const slashTransaction = await lnDefaultBridgeEth.connect(slasher).requestSlashAndRemoteRelease(
              [
                  lastTransferId,
                  relayer.address,
                  ethToken.address,
                  arbToken.address,
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              ethChainId,
              expectedTransferId,
              relayer.address
          );
          const relayTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const fillInfo = await lnDefaultBridgeArb.fillTransfers(expectedTransferId);
          const balanceOfUserAfter = await arbToken.balanceOf(user.address);
          const balanceOfSlasherAfter = await arbToken.balanceOf(slasher.address);
          if (timestampBefore > 0) {
              expect(fillInfo.timestamp).to.equal(timestampBefore);
              expect(balanceOfUserAfter - balanceOfUser).to.equal(0);
              expect(balanceOfSlasherAfter - balanceOfSlasher).to.equal(penalty/5);
          } else {
              const totalFee = Number(await lnDefaultBridgeEth.totalFee(
                  arbChainId,
                  relayer.address,
                  ethToken.address,
                  arbToken.address,
                  transferAmount
              ));
              expect(fillInfo.timestamp).to.equal(relayTimestamp);
              expect(balanceOfUserAfter - balanceOfUser).to.equal(transferAmount);
              expect(balanceOfSlasherAfter - balanceOfSlasher).to.equal(penalty + totalFee - protocolFee);
          }
          expect(fillInfo.slasher).to.equal(slasher.address);
          return slashTransaction;
      }

      async function withdraw(amount) {
          const providerKey = getProviderKey(ethChainId, relayer.address, ethToken.address, arbToken.address);
          const marginBefore = (await lnDefaultBridgeArb.tgtProviders(providerKey)).margin;
          const balanceOfRelayerBefore = await arbToken.balanceOf(relayer.address);
          const withdrawTransaction = await lnDefaultBridgeEth.connect(relayer).requestWithdrawMargin(
              ethChainId,
              ethToken.address,
              arbToken.address,
              amount,
              relayer.address
          );
          const balanceOfRelayerAfter = await arbToken.balanceOf(relayer.address);
          const marginAfter = (await lnDefaultBridgeArb.tgtProviders(providerKey)).margin;

          let successWithdrawAmount = amount;
          if (marginBefore.lt(amount)) {
              // if withdraw failed
              successWithdrawAmount = 0;
          }
          expect(balanceOfRelayerAfter - balanceOfRelayerBefore).to.equal(successWithdrawAmount);
          expect(marginBefore - marginAfter).to.equal(successWithdrawAmount);
          return successWithdrawAmount > 0;
      }

      // user lock
      await ethToken.connect(user).approve(lnDefaultBridgeEth.address, initTokenBalance);
      const totalFee = Number(await lnDefaultBridgeEth.totalFee(
          arbChainId,
          relayer.address,
          ethToken.address,
          arbToken.address,
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
      const relayerArbBalance = initTokenBalance - transferAmount - initMargin - initSlashReserveFund;
      expect(await ethToken.balanceOf(user.address)).to.equal(userEthBalance);
      expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthBalance);
      expect(await arbToken.balanceOf(user.address)).to.equal(userArbBalance);
      expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbBalance);
      console.log("normal lock and release test finished");

      // check unique and continuous
      await expect(transfer(initTransferId, 0)).to.be.revertedWith("snapshot expired:transfer");
      await expect(transfer(transferId01, 1)).to.be.revertedWith("snapshot expired:withdraw");

      const lockTransaction1 = await transfer(transferId01, 0)
      lockReceipt = await lockTransaction1.wait();
      lockGasUsed = lockReceipt.cumulativeGasUsed;
      console.log("transferAndLockMargin 01 gas used", lockGasUsed);
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
      // LayerZero can't revert on target
      //await expect(slash(transferId02, transferId03, blockTimestamp03)).to.be.revertedWith("receive call failed");
      console.log("check continuous success");

      // 2. slash when timeout, but relayed
      //await expect(slash(initTransferId, transferId01, blockTimestamp01)).to.be.revertedWith("receive call failed");
      // relay 02 && slash 02
      await relay(transferId01, transferId02, blockTimestamp02);
      // can't relay twice
      console.log("test relay twice error");
      await expect(relay(transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("transfer has been filled");
      // 3. slash when timeout but relayed(timeout)
      // can slash if relayed when timeout
      console.log("test can slash when relayed timeout");
      await slash(transferId01, transferId02, blockTimestamp02);
      // 4. slash when slash has finished
      // can't slash twice
      //await expect(slash(transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("receive call failed");
      // slash 03
      // 5. slash when timeout and not relayed
      // can slash if not relayed when timeout
      console.log("test slash when not relayed and timeout");
      await slash(transferId02, transferId03, blockTimestamp03);
      
      expect(await withdraw(15000)).to.equal(false);
      expect(await withdraw(5000)).to.equal(true);
      console.log("ln bridge test finished");
  });
});
