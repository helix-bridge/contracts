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
      await ethBridge.initialize(dao);
      const arbBridge = await bridgeContract.deploy();
      await arbBridge.deployed();
      await arbBridge.initialize(dao);

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
      await eth2arbSendService.authoriseAppCaller(ethBridge.address, true);
      await eth2arbRecvService.authoriseAppCaller(arbBridge.address, true);
      await lzMessagerEth.authoriseAppCaller(ethBridge.address, true);
      await lzMessagerArb.authoriseAppCaller(arbBridge.address, true);

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

      await ethBridge.connect(relayer).registerLnProvider(
          arbChainId,
          ethToken.address,
          arbToken.address,
          baseFee,
          liquidityFeeRate,
          transferLimit
      );
      // deposit penalty reserve
      await ethBridge.connect(relayer).depositPenaltyReserve(
          ethToken.address,
          initPenalty
      );

      async function getChainInfo(direction) {
          if (direction === 'eth2arb') {
              return {
                  srcChainId: ethChainId,
                  dstChainId: arbChainId,
                  srcToken: ethToken,
                  dstToken: arbToken,
                  srcBridge: ethBridge,
                  dstBridge: arbBridge,
                  extParams: relayer.address,
              };
          } else {
              return {
                  srcChainId: arbChainId,
                  dstChainId: ethChainId,
                  srcToken: arbToken,
                  dstToken: ethToken,
                  srcBridge: arbBridge,
                  dstBridge: ethBridge,
                  extParams: await eth2arbSendService.encodeParams(0, 200, 200, relayer.address),
              };
          }
      }

      async function getTargetAmount(direction, sourceAmount) {
          if (direction === 'eth2arb') {
              return sourceAmount/(10);
          } else {
              return sourceAmount * 10;
          }
      }

      async function getCurrentTransferId(direction, lastTransferId) {
          const chainInfo = await getChainInfo(direction);

          const srcProvider = await chainInfo.srcBridge.srcProviderStates(
              await chainInfo.srcBridge.getProviderStateKey(
                  chainInfo.srcToken.address,
                  relayer.address
              )
          );

          const targetAmount = await getTargetAmount(direction, transferAmount);
          const transferId = await chainInfo.srcBridge.getTransferId(
              [
                  chainInfo.dstChainId,
                  relayer.address, // provider
                  chainInfo.srcToken.address, // sourceToken
                  chainInfo.dstToken.address, // targetToken
                  0,
                  transferAmount, // amount
                  user.address, // receiver
              ],
              srcProvider.nonce,
              targetAmount
          );

          // check transferId exist on source chain
          const lockInfo = await chainInfo.srcBridge.lockInfos(transferId);
          expect(lockInfo.timestamp).to.equal(blockTimestamp);
          return transferId;
      }

      // balance
      // srcChain: user -> source bridge contract [amount + providerFee + protocolFee]
      async function transfer(direction, nonce) {
          const chainInfo = await getChainInfo(direction);
          const totalFee = Number(await chainInfo.srcBridge.totalFee(
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken.address,
              chainInfo.dstToken.address,
              transferAmount
          ));
          const balanceOfUser = await chainInfo.srcToken.balanceOf(user.address);
          const params = [
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken.address,
              chainInfo.dstToken.address,
              totalFee,
              transferAmount,
              user.address,
              nonce,
          ];
          const tx = await chainInfo.srcBridge.connect(user).lockAndRemoteRelease(
              params,
          );
          const balanceOfUserAfter = await chainInfo.srcToken.balanceOf(user.address);
          expect(balanceOfUser - balanceOfUserAfter).to.equal(totalFee + transferAmount);
          let lockReceipt = await tx.wait();
          let lockGasUsed = lockReceipt.cumulativeGasUsed;
          console.log("transferAndLockMargin gas used", lockGasUsed);
          const targetAmount = await getTargetAmount(direction, transferAmount);
          return await chainInfo.srcBridge.getTransferId(
              params,
              targetAmount
          );
      }

      // balance
      // on target: relayer -> user
      async function relay(direction, transferId, nonce) {
          const chainInfo = await getChainInfo(direction);
          const balanceOfUser = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfRelayer = await chainInfo.dstToken.balanceOf(relayer.address);
          const targetAmount = await getTargetAmount(direction, transferAmount);
          const relayTransaction = await chainInfo.dstBridge.connect(relayer).transferAndReleaseMargin(
              [
                  chainInfo.srcChainId,
                  relayer.address, // provider
                  chainInfo.srcToken.address, // sourceToken
                  chainInfo.dstToken.address, // targetToken
                  transferAmount,
                  targetAmount,
                  user.address,
                  nonce,
              ],
              transferId,
              true
          );

          // check relay result
          //const fillInfo = await chainInfo.dstBridge.fillTransfers(transferId);
          //expect(fillInfo.timestamp).to.equal(relayTimestamp);
          const slashInfo = await chainInfo.dstBridge.slashInfos(transferId);
          expect(slashInfo.slasher).to.equal(nullAddress);
          const balanceOfUserAfter = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await chainInfo.dstToken.balanceOf(relayer.address);
          expect(balanceOfUserAfter - balanceOfUser).to.equal(targetAmount);
          expect(balanceOfRelayer - balanceOfRelayerAfter).to.equal(targetAmount);

          let relayReceipt = await relayTransaction.wait();
          let relayGasUsed = relayReceipt.cumulativeGasUsed;
          console.log("relay gas used", relayGasUsed);
      }

      async function slash(direction, nonce, expectedTransferId, timestamp) {
          const chainInfo = await getChainInfo(direction);
          let blockTimestamp = timestamp;
          if (blockTimestamp === null) { 
              blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          }
          const balanceOfUser = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfSlasher = await chainInfo.dstToken.balanceOf(slasher.address);
          const balanceOfSlasherOnSrc = await chainInfo.srcToken.balanceOf(slasher.address);
          const targetAmount = await getTargetAmount(direction, transferAmount);

          await chainInfo.dstToken.connect(slasher).approve(chainInfo.dstBridge.address, initTokenBalance);

          const encoded = ethers.utils.solidityPack([
              "bytes32",
              "uint64",
          ], [expectedTransferId, blockTimestamp]);
          const expectedIdWithTimestamp = ethUtil.keccak256(encoded);

          const slashTransaction = await chainInfo.dstBridge.connect(slasher).requestSlashAndRemoteRelease(
              [
                  chainInfo.srcChainId,
                  relayer.address,
                  chainInfo.srcToken.address,
                  chainInfo.dstToken.address,
                  transferAmount,
                  targetAmount,
                  user.address,
                  nonce,
              ],
              blockTimestamp,
              expectedTransferId,
              expectedIdWithTimestamp,
              chainInfo.extParams
          );
          

          const slashInfo = await chainInfo.dstBridge.slashInfos(expectedTransferId);
          const balanceOfUserAfter = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfSlasherAfter = await chainInfo.dstToken.balanceOf(slasher.address);
          const balanceOfSlasherAfterOnSrc = await chainInfo.srcToken.balanceOf(slasher.address);
          const totalFee = Number(await chainInfo.srcBridge.totalFee(
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken.address,
              chainInfo.dstToken.address,
              transferAmount
          ));
          expect(balanceOfUserAfter - balanceOfUser).to.equal(targetAmount);
          expect(balanceOfSlasher - balanceOfSlasherAfter).to.equal(targetAmount);
          expect(slashInfo.slasher).to.equal(slasher.address);
          expect(balanceOfSlasherAfterOnSrc - balanceOfSlasherOnSrc).to.equal(transferAmount + penalty + totalFee - protocolFee);
          return slashTransaction;
      }

      async function withdraw(direction, lastTransferId, amount) {
          const chainInfo = await getChainInfo(direction);
          const providerKey = getProviderKey(chainInfo.dstChainId, relayer.address, chainInfo.srcToken.address, chainInfo.dstToken.address);
          const marginBefore = (await chainInfo.srcBridge.srcProviders(providerKey)).config.margin;

          const balanceOfRelayerBefore = await chainInfo.srcToken.balanceOf(relayer.address);
          const withdrawTransaction = await chainInfo.dstBridge.connect(relayer).requestWithdrawMargin(
              chainInfo.srcChainId,
              lastTransferId,
              chainInfo.srcToken.address,
              chainInfo.dstToken.address,
              amount,
              chainInfo.extParams,
          );
          const balanceOfRelayerAfter = await chainInfo.srcToken.balanceOf(relayer.address);
          const marginAfter = (await chainInfo.srcBridge.srcProviders(providerKey)).config.margin;

          let successWithdrawAmount = amount;
          if (marginBefore.lt(amount)) {
              // if withdraw failed
              successWithdrawAmount = 0;
          }
          expect(balanceOfRelayerAfter - balanceOfRelayerBefore).to.equal(successWithdrawAmount);
          expect(marginBefore - marginAfter).to.equal(successWithdrawAmount);
          return successWithdrawAmount > 0;
      }

      // eth -> arb
      {
          await ethToken.connect(user).approve(ethBridge.address, initTokenBalance);
          // test normal transfer and relay
          // 1. transfer from eth to arb
          const transferId01 = await transfer('eth2arb', 1);
          const blockTimestamp01 = (await ethers.provider.getBlock("latest")).timestamp;
          // 2. relay "transfer from eth to arb"
          await relay('eth2arb', transferId01, 1);
          // 3. repeat relay
          await expect(relay('eth2arb', transferId01, 1)).to.be.revertedWith("transfer has been filled");

          // test slash
          // 1. slash a relayed tx
          await expect(slash("eth2arb", 1, transferId01, blockTimestamp01)).to.be.revertedWith("transfer has been filled");
          // 2. slash a normal unrelayed tx
          const transferId02 = await transfer('eth2arb', 2);
          const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
          // 2.1. slash when not expired
          await expect(slash("eth2arb", 2, transferId02, blockTimestamp02)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [18001],
          });
          // 2.2. slashed
          await slash("eth2arb", 2, transferId02, blockTimestamp02);
      }

      // test arb2eth direction
      {
          await arbToken.connect(user).approve(arbBridge.address, initTokenBalance);
          const transferId11 = await transfer('arb2eth', 1);
          const blockTimestamp11 = (await ethers.provider.getBlock("latest")).timestamp;
          await relay('arb2eth', transferId11, 1);
          await expect(relay('arb2eth', transferId11, 1)).to.be.revertedWith("transfer has been filled");

          await expect(slash("arb2eth", 1, transferId11, blockTimestamp11)).to.be.revertedWith("transfer has been filled");
          const transferId12 = await transfer('arb2eth', 2);
          const blockTimestamp12 = (await ethers.provider.getBlock("latest")).timestamp;
          await expect(slash("arb2eth", 2, transferId12, blockTimestamp12)).to.be.revertedWith("time not expired");
          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [18001],
          });
          await slash("arb2eth", 2, transferId12, blockTimestamp12);
          console.log("test finished");
      }
  });
});
