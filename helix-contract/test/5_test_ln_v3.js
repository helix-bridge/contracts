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

describe("lnv3 bridge tests", () => {
  before(async () => {
  });

  it("test_lnv3_flow", async function () {
      const [owner, relayer, user, slasher] = await ethers.getSigners();
      const dao = owner.address;
      const protocolFee = 100;
      const penalty = 200;
      const nullAddress = "0x0000000000000000000000000000000000000000";
      const nativeTokenAddress = nullAddress;
      const baseFee = 300;
      const liquidityFeeRate = 1;
      const initTokenBalance = 1000000;
      const initPenalty = 10000;
      const transferAmount = 3000;
      const ethChainId = 31337;
      const arbChainId = 31337;
      const transferLimit = 10000;

      // deploy erc20 token contract
      const tokenNameOnEthereum = "Darwinia Ring On Ethereum";
      const tokenSymbolOnEthereum = "RING.e";
      const ethContract = await ethers.getContractFactory("Erc20");
      const ethToken = await ethContract.deploy(tokenNameOnEthereum, tokenSymbolOnEthereum, 18);
      await ethToken.deployed();

      const tokenNameOnArbitrum = "Darwinia Ring On Arbitrum";
      const tokenSymbolOnArbitrum = "RING.a";
      const arbContract = await ethers.getContractFactory("Erc20");
      const arbToken = await ethContract.deploy(tokenNameOnArbitrum, tokenSymbolOnArbitrum, 17);
      await arbToken.deployed();
      console.log("contract deploy erc20 finished");

      // use Erc20 token address as unreachable contract address(can't receive native token)
      const unreachableContract = arbToken.address;

      const tokenNameNativeOnEthereum = "Ethereum Native Token";
      const tokenSymbolNativeOnEthereum = "ETH";
      const tokenNameNativeOnArbitrum = "Arbitrum Native Token";
      const tokenSymbolNativeOnArbitrum = "aETH";

      // mint some tokens on source chain and target chain for relayer
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

      
      const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3");

      const ethBridge = await bridgeContract.deploy();
      await ethBridge.deployed();
      await ethBridge.initialize(dao, '0x');
      const arbBridge = await bridgeContract.deploy();
      await arbBridge.deployed();
      await arbBridge.initialize(dao, '0x');

      // eth -> arb messager service
      console.log("deploy etherum to arbitrum l1->l2 message service");
      const eth2arbSendServiceContract = await ethers.getContractFactory("Eth2ArbSendService");
      const eth2arbSendService = await eth2arbSendServiceContract.deploy(dao, inbox.address, arbChainId);
      await eth2arbSendService.deployed();
      const eth2arbRecvServiceContract = await ethers.getContractFactory("MockEth2ArbReceiveService");
      const eth2arbRecvService = await eth2arbRecvServiceContract.deploy(dao, ethChainId);
      await eth2arbRecvService.deployed();

      await eth2arbSendService.setRemoteMessager(eth2arbRecvService.address);
      await eth2arbRecvService.setRemoteMessagerAlias(inbox.address);

      // arb -> eth message service
      console.log("deploy arbitrum to ethereum layerzero message service");
      const endpointContract = await ethers.getContractFactory("LayerZeroEndpointMock");
      const endpoint = await endpointContract.deploy(arbChainId);
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
      console.log("messager service deploy finished");

      console.log("configure message service for token bridge");
      // authorise
      await eth2arbSendService.setWhiteList(ethBridge.address, true);
      await eth2arbRecvService.setWhiteList(arbBridge.address, true);
      await lzMessagerEth.setWhiteList(ethBridge.address, true);
      await lzMessagerArb.setWhiteList(arbBridge.address, true);

      await ethBridge.setSendService(arbChainId, arbBridge.address, eth2arbSendService.address);
      await ethBridge.setReceiveService(arbChainId, arbBridge.address, lzMessagerEth.address);
      await arbBridge.setSendService(ethChainId, ethBridge.address, lzMessagerArb.address);
      await arbBridge.setReceiveService(ethChainId, ethBridge.address, eth2arbRecvService.address);

      // configure
      // register token
      console.log("register token info");
      await ethBridge.registerTokenInfo(
          arbChainId,
          ethToken.address,
          arbToken.address,
          protocolFee,
          penalty,
          18,
          17,
          1 // index
      );
      await arbBridge.registerTokenInfo(
          ethChainId,
          arbToken.address,
          ethToken.address,
          protocolFee,
          penalty,
          17,
          18,
          1
      );

      // native token
      await ethBridge.registerTokenInfo(
          arbChainId,
          nativeTokenAddress,
          nativeTokenAddress,
          protocolFee,
          penalty,
          18,
          18,
          2
      );

      await arbBridge.registerTokenInfo(
          ethChainId,
          nativeTokenAddress,
          nativeTokenAddress,
          protocolFee,
          penalty,
          18,
          18,
          2
      );

      console.log("provider register");
      // provider 
      await ethToken.connect(relayer).approve(ethBridge.address, initTokenBalance);
      await arbToken.connect(relayer).approve(arbBridge.address, initTokenBalance);
      // register on source chain
      // register
      await arbBridge.connect(relayer).registerLnProvider(
          ethChainId,
          arbToken.address,
          ethToken.address,
          baseFee,
          liquidityFeeRate,
          transferLimit
      );
      // deposit penalty reserve
      await arbBridge.connect(relayer).depositPenaltyReserve(
          arbToken.address,
          initPenalty
      );

      const tx = await ethBridge.connect(relayer).registerLnProvider(
          arbChainId,
          ethToken.address,
          arbToken.address,
          baseFee,
          liquidityFeeRate,
          transferLimit
      );
      let lockReceipt = await tx.wait();
      let lockGasUsed = lockReceipt.cumulativeGasUsed;
      console.log("register lnProvider usedGas", lockGasUsed);
      // deposit penalty reserve
      await ethBridge.connect(relayer).depositPenaltyReserve(
          ethToken.address,
          initPenalty
      );

      await arbBridge.connect(relayer).registerLnProvider(
          ethChainId,
          nativeTokenAddress,
          nativeTokenAddress,
          baseFee,
          liquidityFeeRate,
          transferLimit
      );
      // deposit penalty reserve
      await arbBridge.connect(relayer).depositPenaltyReserve(
          nativeTokenAddress,
          initPenalty,
          { value: initPenalty }
      );

      await ethBridge.connect(relayer).registerLnProvider(
          arbChainId,
          nativeTokenAddress,
          nativeTokenAddress,
          baseFee,
          liquidityFeeRate,
          transferLimit
      );
      // deposit penalty reserve
      await ethBridge.connect(relayer).depositPenaltyReserve(
          nativeTokenAddress,
          initPenalty,
          { value: initPenalty }
      );

      async function getChainInfo(direction, isNative) {
          if (direction === 'eth2arb') {
              let srcToken = ethToken.address;
              let dstToken = arbToken.address;
              if (isNative) {
                  srcToken = nativeTokenAddress;
                  dstToken = nativeTokenAddress;
              }
              return {
                  srcChainId: ethChainId,
                  dstChainId: arbChainId,
                  srcToken: srcToken,
                  dstToken: dstToken,
                  srcBridge: ethBridge,
                  dstBridge: arbBridge,
                  extParams: relayer.address,
              };
          } else {
              let srcToken = arbToken.address;
              let dstToken = ethToken.address;
              if (isNative) {
                  srcToken = nativeTokenAddress;
                  dstToken = nativeTokenAddress;
              }
              return {
                  srcChainId: arbChainId,
                  dstChainId: ethChainId,
                  srcToken: srcToken,
                  dstToken: dstToken,
                  srcBridge: arbBridge,
                  dstBridge: ethBridge,
                  extParams: await eth2arbSendService.encodeParams(0, 200, 200, relayer.address),
              };
          }
      }

      async function getTargetAmount(direction, sourceAmount, isNative) {
          if (isNative) {
              return sourceAmount;
          }
          if (direction === 'eth2arb') {
              return sourceAmount/(10);
          } else {
              return sourceAmount * 10;
          }
      }

      async function balanceOf(tokenAddress, account) {
          if (tokenAddress == nativeTokenAddress) {
              return await ethers.provider.getBalance(account);
          } else {
              const token = await ethers.getContractAt("Erc20", tokenAddress);
              return await token.balanceOf(account);
          }
      }

      // balance
      // srcChain: user -> source bridge contract [amount + providerFee + protocolFee]
      async function transfer(direction, timestamp, isNative, receiver = user.address) {
          const chainInfo = await getChainInfo(direction, isNative);
          const totalFee = Number(await chainInfo.srcBridge.totalFee(
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken,
              chainInfo.dstToken,
              transferAmount
          ));
          const balanceOfUser = await balanceOf(chainInfo.srcToken, user.address);
          const balanceOfBackingBefore = await balanceOf(chainInfo.srcToken, chainInfo.srcBridge.address);
          const params = [
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken,
              chainInfo.dstToken,
              totalFee,
              transferAmount,
              receiver,
              timestamp,
          ];
          let value = 0;
          if (isNative) {
              value = totalFee + transferAmount;
          }
          const tx = await chainInfo.srcBridge.connect(user).lockAndRemoteRelease(
              params,
              { value: value }
          );
          const balanceOfUserAfter = await balanceOf(chainInfo.srcToken, user.address);
          const balanceOfBackingAfter = await balanceOf(chainInfo.srcToken, chainInfo.srcBridge.address);
          let lockReceipt = await tx.wait();
          let lockGasUsed = lockReceipt.cumulativeGasUsed;
          let gasFee = lockReceipt.cumulativeGasUsed.mul(lockReceipt.effectiveGasPrice);
          console.log("transferAndLockMargin gas used", lockGasUsed, lockReceipt.effectiveGasPrice, gasFee);
          if (!isNative) {
              expect(balanceOfUser.sub(balanceOfUserAfter)).to.equal(totalFee + transferAmount);
          } else {
              expect(balanceOfUser.sub(balanceOfUserAfter).sub(gasFee)).to.equal(totalFee + transferAmount);
          }
          expect(balanceOfBackingAfter - balanceOfBackingBefore).to.equal(totalFee + transferAmount);
          const targetAmount = await getTargetAmount(direction, transferAmount, isNative);
          return await chainInfo.srcBridge.getTransferId(
              params,
              targetAmount
          );
      }

      // balance
      // on target: relayer -> user
      async function relay(direction, transferId, timestamp, isNative, receiver = user.address) {
          const chainInfo = await getChainInfo(direction, isNative);
          const balanceOfUser = await balanceOf(chainInfo.dstToken, user.address);
          const balanceOfRelayer = await balanceOf(chainInfo.dstToken, relayer.address);
          const balanceOfDao = await balanceOf(chainInfo.dstToken, dao);
          const targetAmount = await getTargetAmount(direction, transferAmount, isNative);
          let value = 0;
          if (isNative) {
              value = targetAmount;
          }
          const relayTransaction = await chainInfo.dstBridge.connect(relayer).relay(
              [
                  chainInfo.srcChainId,
                  relayer.address, // provider
                  chainInfo.srcToken, // sourceToken
                  chainInfo.dstToken, // targetToken
                  transferAmount,
                  targetAmount,
                  receiver,
                  timestamp,
              ],
              transferId,
              true,
              { value: value }
          );

          // check relay result
          //const fillInfo = await chainInfo.dstBridge.fillTransfers(transferId);
          //expect(fillInfo.timestamp).to.equal(relayTimestamp);
          const slashInfo = await chainInfo.dstBridge.slashInfos(transferId);
          expect(slashInfo.slasher).to.equal(nullAddress);
          const balanceOfUserAfter = await balanceOf(chainInfo.dstToken, user.address);
          const balanceOfRelayerAfter = await balanceOf(chainInfo.dstToken, relayer.address);
          const userBalanceDiffer = receiver == user.address ? targetAmount : 0;
          expect(balanceOfUserAfter.sub(balanceOfUser)).to.equal(userBalanceDiffer);

          let relayReceipt = await relayTransaction.wait();
          let relayGasUsed = relayReceipt.cumulativeGasUsed;
          let gasFee = relayReceipt.cumulativeGasUsed.mul(relayReceipt.effectiveGasPrice);
          if (!isNative) {
              expect(balanceOfRelayer - balanceOfRelayerAfter).to.equal(targetAmount);
          } else {
              expect(balanceOfRelayer.sub(balanceOfRelayerAfter).sub(gasFee)).to.equal(targetAmount);
              if (receiver == unreachableContract) {
                  const balanceOfDaoAfter = await balanceOf(chainInfo.dstToken, dao);
                  expect(balanceOfDaoAfter.sub(balanceOfDao)).to.equal(targetAmount);
              }
          }

          console.log("relay gas used", relayGasUsed);
      }

      async function slash(direction, expectedTransferId, timestamp, isNative, receiver = user.address) {
          const chainInfo = await getChainInfo(direction, isNative);
          const dstToken = await ethers.getContractAt("Erc20", chainInfo.dstToken);
          await dstToken.connect(slasher).approve(chainInfo.dstBridge.address, initTokenBalance);

          const balanceOfUser = await balanceOf(chainInfo.dstToken, user.address);
          const balanceOfSlasher = await balanceOf(chainInfo.dstToken, slasher.address);
          const balanceOfSlasherOnSrc = await balanceOf(chainInfo.srcToken, slasher.address);
          const targetAmount = await getTargetAmount(direction, transferAmount, isNative);
          const balanceOfDao = await balanceOf(chainInfo.dstToken, dao);

          const feePrepaid = ethers.utils.parseEther("0.01");
          let value = feePrepaid;
          if (isNative) {
              value = feePrepaid.add(targetAmount);
          }

          const slashTransaction = await chainInfo.dstBridge.connect(slasher).requestSlashAndRemoteRelease(
              [
                  chainInfo.srcChainId,
                  relayer.address,
                  chainInfo.srcToken,
                  chainInfo.dstToken,
                  transferAmount,
                  targetAmount,
                  receiver,
                  timestamp,
              ],
              expectedTransferId,
              feePrepaid,
              chainInfo.extParams,
              {value: value}
          );
          
          let slashReceipt = await slashTransaction.wait();
          let slashGasUsed = slashReceipt.cumulativeGasUsed;
          let gasFee = slashReceipt.cumulativeGasUsed.mul(slashReceipt.effectiveGasPrice);

          const slashInfo = await chainInfo.dstBridge.slashInfos(expectedTransferId);
          const balanceOfUserAfter = await balanceOf(chainInfo.dstToken, user.address);
          const balanceOfSlasherAfter = await balanceOf(chainInfo.dstToken, slasher.address);
          const balanceOfSlasherAfterOnSrc = await balanceOf(chainInfo.srcToken, slasher.address);
          const totalFee = Number(await chainInfo.srcBridge.totalFee(
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken,
              chainInfo.dstToken,
              transferAmount
          ));
          const userBalanceDiffer = receiver == user.address ? targetAmount : 0;
          expect(balanceOfUserAfter.sub(balanceOfUser)).to.equal(userBalanceDiffer);
          if (!isNative) {
              expect(balanceOfSlasher - balanceOfSlasherAfter).to.equal(targetAmount);
              expect(balanceOfSlasherAfterOnSrc - balanceOfSlasherOnSrc).to.equal(transferAmount + penalty + totalFee - protocolFee);
          } else {
              expect(balanceOfSlasherAfter.sub(balanceOfSlasher).add(feePrepaid).add(gasFee)).to.equal(penalty + totalFee - protocolFee);
              if (receiver == unreachableContract) {
                  const balanceOfDaoAfter = await balanceOf(chainInfo.dstToken, dao);
                  expect(balanceOfDaoAfter.sub(balanceOfDao)).to.equal(targetAmount);
              }
          }
          expect(slashInfo.slasher).to.equal(slasher.address);
          return slashTransaction;
      }

      async function withdraw(direction, transferIds, result, isNative) {
          const chainInfo = await getChainInfo(direction, isNative);

          let totalWithdrawAmount = 0;
          for (const transferId of transferIds) {
              const lockInfo = await chainInfo.srcBridge.lockInfos(transferId);
              totalWithdrawAmount += Number(lockInfo.amountWithFeeAndPenalty) - penalty;
          }

          const balanceOfRelayerBefore = await balanceOf(chainInfo.srcToken, relayer.address);
          const balanceOfBackingBefore = await balanceOf(chainInfo.srcToken, chainInfo.srcBridge.address);
          const feePrepaid = ethers.utils.parseEther("0.01");
          const withdrawTransaction = await chainInfo.dstBridge.connect(relayer).requestWithdrawLiquidity(
              chainInfo.srcChainId,
              transferIds,
              relayer.address,
              chainInfo.extParams,
              {value: feePrepaid}
          );
          const balanceOfRelayerAfter = await balanceOf(chainInfo.srcToken, relayer.address);
          const balanceOfBackingAfter = await balanceOf(chainInfo.srcToken, chainInfo.srcBridge.address);

          if (result) {
              expect(balanceOfRelayerAfter - balanceOfRelayerBefore).to.equal(totalWithdrawAmount);
              expect(balanceOfBackingBefore - balanceOfBackingAfter).to.equal(totalWithdrawAmount);
          } else {
              expect(balanceOfRelayerAfter - balanceOfRelayerBefore).to.equal(0);
              expect(balanceOfBackingBefore - balanceOfBackingAfter).to.equal(0);
          }
      }

      // eth -> arb
      {
          await ethToken.connect(user).approve(ethBridge.address, initTokenBalance);
          // test normal transfer and relay
          // 1. transfer from eth to arb
          let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId01 = await transfer('eth2arb', timestamp, false);
          const blockTimestamp01 = (await ethers.provider.getBlock("latest")).timestamp;
          // 2. relay "transfer from eth to arb"
          await relay('eth2arb', transferId01, timestamp, false);
          // 3. repeat relay
          await expect(relay('eth2arb', transferId01, timestamp, false)).to.be.revertedWith("transfer has been filled");

          // test slash
          // 1. slash a relayed tx
          await expect(slash("eth2arb", transferId01, timestamp, false)).to.be.revertedWith("transfer has been filled");
          // 2. slash a normal unrelayed tx
          const transferId02 = await transfer('eth2arb', blockTimestamp01, false);
          const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
          // 2.1. slash when not expired
          await expect(slash("eth2arb", transferId02, blockTimestamp01, false)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [3601],
          });
          // 2.2. slashed
          await slash("eth2arb", transferId02, blockTimestamp01, false);

          // withdraw
          await withdraw('eth2arb', [transferId01], true, false);
          // withdraw twice failed
          await withdraw('eth2arb', [transferId01], false, false);
          // withdraw a slashed transfer failed
          await withdraw('eth2arb', [transferId02], false, false);
          console.log("eth2arb test finished");
      }

      // test arb2eth direction
      {
          let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          await arbToken.connect(user).approve(arbBridge.address, initTokenBalance);
          const transferId11 = await transfer('arb2eth', timestamp, false);
          const blockTimestamp11 = (await ethers.provider.getBlock("latest")).timestamp;
          await relay('arb2eth', transferId11, timestamp, false);
          await expect(relay('arb2eth', transferId11, timestamp, false)).to.be.revertedWith("transfer has been filled");

          await expect(slash("arb2eth", transferId11, timestamp, false)).to.be.revertedWith("transfer has been filled");
          const transferId12 = await transfer('arb2eth', blockTimestamp11, false);
          const blockTimestamp12 = (await ethers.provider.getBlock("latest")).timestamp;
          await expect(slash("arb2eth", transferId12, blockTimestamp11, false)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [3601],
          });
          await slash("arb2eth", transferId12, blockTimestamp11, false);
          console.log("arb2eth test finished");
      }

      // test native token
      {
          let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId21 = await transfer('arb2eth', timestamp, true);
          const blockTimestamp21 = (await ethers.provider.getBlock("latest")).timestamp;
          await relay('arb2eth', transferId21, timestamp, true);
          await expect(relay('arb2eth', transferId21, timestamp, true)).to.be.revertedWith("transfer has been filled");

          await expect(slash("arb2eth", transferId21, timestamp, true)).to.be.revertedWith("transfer has been filled");
          const transferId22 = await transfer('arb2eth', blockTimestamp21, true);
          const blockTimestamp22 = (await ethers.provider.getBlock("latest")).timestamp;
          await expect(slash("arb2eth", transferId22, blockTimestamp21, true)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [3601],
          });
          await slash("arb2eth", transferId22, blockTimestamp21, true);
          console.log("test finished");
      }

      // test unreachable native token
      {
          await arbBridge.connect(relayer).providerUnpause(
            ethChainId,
            nativeTokenAddress,
            nativeTokenAddress,
          );
          let timestamp = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId31 = await transfer('arb2eth', timestamp, true, unreachableContract);
          const blockTimestamp31 = (await ethers.provider.getBlock("latest")).timestamp;
          await relay('arb2eth', transferId31, timestamp, true, unreachableContract);

          const transferId32 = await transfer('arb2eth', blockTimestamp31, true, unreachableContract);
          const blockTimestamp32 = (await ethers.provider.getBlock("latest")).timestamp;
          await expect(slash("arb2eth", transferId32, blockTimestamp31, true, unreachableContract)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [3601],
          });
          await slash("arb2eth", transferId32, blockTimestamp31, true, unreachableContract);
          console.log("test finished");
      }
  });
});
