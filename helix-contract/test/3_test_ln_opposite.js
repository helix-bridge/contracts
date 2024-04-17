const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const { config } = require("hardhat");

chai.use(solidity);

// ethereum -> arbitrum using arbitrum L1->L2 message
// arbitrum -> ethereum using layerzero message

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

      // deploy inboundLane
      const inboxContract = await ethers.getContractFactory("MockArbitrumInbox");
      const inbox = await inboxContract.deploy();
      await inbox.deployed();
      console.log("deploy mock inbox success");
      //******* deploy inboundLane/outboundLane finished ********

      
      const bridgeContract = await ethers.getContractFactory("LnOppositeBridge");

      const ethBridge = await bridgeContract.deploy();
      await ethBridge.deployed();
      await ethBridge.initialize(dao);
      await ethBridge.updateFeeReceiver(feeReceiver);
      const arbBridge = await bridgeContract.deploy();
      await arbBridge.deployed();
      await arbBridge.initialize(dao);
      await arbBridge.updateFeeReceiver(feeReceiver);

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
      await ethBridge.setTokenInfo(
          arbChainId,
          ethToken.address,
          arbToken.address,
          protocolFee,
          penalty,
          18,
          18
      );
      await arbBridge.setTokenInfo(
          ethChainId,
          arbToken.address,
          ethToken.address,
          protocolFee,
          penalty,
          18,
          18
      );

      console.log("provider register");
      // provider 
      await ethToken.connect(relayer).approve(ethBridge.address, initTokenBalance);
      await arbToken.connect(relayer).approve(arbBridge.address, initTokenBalance);
      // register on source chain
      await arbBridge.connect(relayer).updateProviderFeeAndMargin(
          ethChainId,
          arbToken.address,
          ethToken.address,
          initMargin,
          baseFee,
          liquidityFeeRate
      );

      await ethBridge.connect(relayer).updateProviderFeeAndMargin(
          arbChainId,
          ethToken.address,
          arbToken.address,
          initMargin,
          baseFee,
          liquidityFeeRate
      );

      async function signFee(privateKey, fee, expire) {
          const key = ethers.utils.arrayify(privateKey);
          const messageHash = ethers.utils.solidityKeccak256(['uint112', 'uint64'], [fee, expire]);
          const wallet = new ethers.Wallet(privateKey);
          const dataHash = ethers.utils.solidityKeccak256(['bytes', 'bytes'], [ethers.utils.toUtf8Bytes('\x19Ethereum Signed Message:\n32'), messageHash]);
          const signatureECDSA = secp256k1.ecdsaSign(ethers.utils.arrayify(dataHash), key);
          const ethRecID = signatureECDSA.recid + 27;
          const signature = Uint8Array.from(
              signatureECDSA.signature.join().split(',').concat(ethRecID)
          );
          return ethers.utils.hexlify(signature);
      }

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

      async function getCurrentTransferId(direction, lastTransferId) {
          const chainInfo = await getChainInfo(direction);
          const blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          
          const transferId = getTransferId(
              chainInfo.srcChainId,
              chainInfo.dstChainId,
              lastTransferId, // lastTransferId
              relayer.address, // provider
              chainInfo.srcToken.address, // sourceToken
              chainInfo.dstToken.address, // targetToken
              user.address, // receiver
              transferAmount, // amount
          );

          // check transferId exist on source chain
          const lockInfo = await chainInfo.srcBridge.lockInfos(transferId);
          expect(lockInfo.timestamp).to.equal(blockTimestamp);
          return transferId;
      }

      async function transfer(direction, lastTransferId, leftMargin) {
          const chainInfo = await getChainInfo(direction);
          const totalFee = Number(await chainInfo.srcBridge.totalFee(
              chainInfo.dstChainId,
              relayer.address,
              chainInfo.srcToken.address,
              chainInfo.dstToken.address,
              transferAmount
          ));
          const balanceOfUser = await chainInfo.srcToken.balanceOf(user.address);
          const balanceOfRelayer = await chainInfo.srcToken.balanceOf(relayer.address);
          const tx = await chainInfo.srcBridge.connect(user).transferAndLockMargin(
              [
                  chainInfo.dstChainId,
                  relayer.address,
                  chainInfo.srcToken.address,
                  chainInfo.dstToken.address,
                  lastTransferId,
                  totalFee,
                  leftMargin
              ],
              transferAmount,
              user.address,
          );
          const balanceOfUserAfter = await chainInfo.srcToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await chainInfo.srcToken.balanceOf(relayer.address);
          expect(balanceOfUser - balanceOfUserAfter).to.equal(totalFee + transferAmount);
          expect(balanceOfRelayerAfter - balanceOfRelayer).to.equal(transferAmount + totalFee - protocolFee);
          return tx;
      }

      async function relay(direction, lastTransferId, transferId, timestamp) {
          const chainInfo = await getChainInfo(direction);
          let blockTimestamp = timestamp;
          if (blockTimestamp === null) { 
              blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          }
          const balanceOfUser = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfRelayer = await chainInfo.dstToken.balanceOf(relayer.address);
          const relayTransaction = await chainInfo.dstBridge.connect(relayer).transferAndReleaseMargin(
              [
                  lastTransferId, // lastTransferId
                  relayer.address, // provider
                  chainInfo.srcToken.address, // sourceToken
                  chainInfo.dstToken.address, // targetToken
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              chainInfo.srcChainId,
              transferId
          );

          // check relay result
          const relayTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          //const fillInfo = await chainInfo.dstBridge.fillTransfers(transferId);
          //expect(fillInfo.timestamp).to.equal(relayTimestamp);
          const slashInfo = await chainInfo.dstBridge.slashInfos(transferId);
          expect(slashInfo.slasher).to.equal(nullAddress);
          const balanceOfUserAfter = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await chainInfo.dstToken.balanceOf(relayer.address);
          expect(balanceOfUserAfter - balanceOfUser).to.equal(transferAmount);
          expect(balanceOfRelayer - balanceOfRelayerAfter).to.equal(transferAmount);
          return relayTransaction;
      }

      async function slash(direction, lastTransferId, expectedTransferId, timestamp) {
          const chainInfo = await getChainInfo(direction);
          let blockTimestamp = timestamp;
          if (blockTimestamp === null) { 
              blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
          }
          const balanceOfUser = await chainInfo.dstToken.balanceOf(user.address);
          const balanceOfSlasher = await chainInfo.dstToken.balanceOf(slasher.address);
          const balanceOfSlasherOnSrc = await chainInfo.srcToken.balanceOf(slasher.address);
          const slashTransaction = await chainInfo.dstBridge.connect(slasher).requestSlashAndRemoteRelease(
              [
                  lastTransferId,
                  relayer.address,
                  chainInfo.srcToken.address,
                  chainInfo.dstToken.address,
                  transferAmount,
                  blockTimestamp,
                  user.address
              ],
              chainInfo.srcChainId,
              expectedTransferId,
              chainInfo.extParams,
              { value: ethers.utils.parseEther("0.01") }
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
          expect(balanceOfUserAfter - balanceOfUser).to.equal(transferAmount);
          expect(balanceOfSlasher - balanceOfSlasherAfter).to.equal(transferAmount);
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
              { value: ethers.utils.parseEther("0.01") }
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
          const totalFee = Number(await ethBridge.totalFee(
              arbChainId,
              relayer.address,
              ethToken.address,
              arbToken.address,
              transferAmount
          ));
          // 1. transfer from eth to arb
          const lockTransaction = await transfer('eth2arb', initTransferId, initMargin);
          let lockReceipt = await lockTransaction.wait();
          let lockGasUsed = lockReceipt.cumulativeGasUsed;
          console.log("transferAndLockMargin gas used", lockGasUsed);
          const blockTimestamp01 = (await ethers.provider.getBlock("latest")).timestamp;

          const transferId01 = await getCurrentTransferId('eth2arb', initTransferId);

          // 2. relay "transfer from eth to arb"
          const relayTransaction = await relay('eth2arb', initTransferId, transferId01, null);
          let relayReceipt = await relayTransaction.wait();
          let relayGasUsed = relayReceipt.cumulativeGasUsed;
          console.log("relay gas used", relayGasUsed);

          // check balance
          const userEthBalance = initTokenBalance - transferAmount - totalFee;
          const relayerEthBalance = initTokenBalance + transferAmount + totalFee - protocolFee - initMargin ;
          const userArbBalance = initTokenBalance + transferAmount;
          const relayerArbBalance = initTokenBalance - transferAmount - initMargin;
          expect(await ethToken.balanceOf(user.address)).to.equal(userEthBalance);
          expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthBalance);
          expect(await arbToken.balanceOf(user.address)).to.equal(userArbBalance);
          expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbBalance);
          console.log("normal lock and release test finished");

          // check unique and continuous
          await expect(transfer("eth2arb", initTransferId, initMargin)).to.be.revertedWith("snapshot expired");
          await expect(transfer("eth2arb", transferId01, initMargin + 1)).to.be.revertedWith("margin updated");

          const lockTransaction1 = await transfer("eth2arb", transferId01, initMargin)
          lockReceipt = await lockTransaction1.wait();
          lockGasUsed = lockReceipt.cumulativeGasUsed;
          console.log("transferAndLockMargin 01 gas used", lockGasUsed);
          const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId02 = await getCurrentTransferId("eth2arb", transferId01);
          await transfer("eth2arb", transferId02, 0)
          const blockTimestamp03 = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId03 = await getCurrentTransferId("eth2arb", transferId02);

          // release transfer02 failed
          await expect(relay("eth2arb", transferId02, transferId03, null)).to.be.revertedWith("previous fill not exist");
          // 1. slash when not timeout
          await expect(slash("eth2arb", transferId02, transferId03, null)).to.be.revertedWith("slash time not expired");

          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [18001],
          });
          await expect(slash("eth2arb", transferId02, transferId03, blockTimestamp03)).to.be.revertedWith("previous fill not exist");
          console.log("check continuous success");

          // 2. slash when timeout, but relayed
          await expect(slash("eth2arb", initTransferId, transferId01, blockTimestamp01)).to.be.revertedWith("fill exist");
          // relay 02 && slash 02
          await relay("eth2arb", transferId01, transferId02, blockTimestamp02);
          // can't relay twice
          await expect(relay("eth2arb", transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("fill exist");
          // 3. slash when timeout but relayed(timeout)
          // can't slash event if relayed when timeout
          await expect(slash("eth2arb", transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("fill exist");
          // slash 03
          // 4. slash when timeout and not relayed
          // can slash if not relayed when timeout
          await arbToken.connect(slasher).approve(arbBridge.address, initTokenBalance);
          await slash("eth2arb", transferId02, transferId03, blockTimestamp03);
          
          expect(await withdraw('eth2arb', transferId03, 15000)).to.equal(false);
          expect(await withdraw('eth2arb', transferId03, 5000)).to.equal(true);
          console.log("ln bridge test eth2arb finished");
      }

      // test arb2eth direction
      {
          await arbToken.connect(user).approve(arbBridge.address, initTokenBalance);
          const totalFee = Number(await arbBridge.totalFee(
              ethChainId,
              relayer.address,
              arbToken.address,
              ethToken.address,
              transferAmount
          ));
          // 1. transfer from eth to arb
          const userArbBalanceBefore = await arbToken.balanceOf(user.address);
          const relayerArbBalanceBefore = await arbToken.balanceOf(relayer.address);
          const userEthBalanceBefore = await ethToken.balanceOf(user.address);
          const relayerEthBalanceBefore = await ethToken.balanceOf(relayer.address);

          const lockTransaction = await transfer('arb2eth', initTransferId, 0);
          let lockReceipt = await lockTransaction.wait();
          let lockGasUsed = lockReceipt.cumulativeGasUsed;
          console.log("transferAndLockMargin gas used", lockGasUsed);
          const blockTimestamp01 = (await ethers.provider.getBlock("latest")).timestamp;

          const transferId01 = await getCurrentTransferId('arb2eth', initTransferId);

          // 2. relay "transfer from eth to arb"
          const relayTransaction = await relay('arb2eth', initTransferId, transferId01, null);
          let relayReceipt = await relayTransaction.wait();
          let relayGasUsed = relayReceipt.cumulativeGasUsed;
          console.log("relay gas used", relayGasUsed);

          console.log("total fee", totalFee);
          // check balance
          const userArbBalance = userArbBalanceBefore - totalFee - transferAmount;
          const relayerArbBalance = relayerArbBalanceBefore.add(totalFee).sub(protocolFee).add(transferAmount);
          const userEthBalance = userEthBalanceBefore.add(transferAmount);
          const relayerEthBalance = relayerEthBalanceBefore - transferAmount;
          expect(await arbToken.balanceOf(user.address)).to.equal(userArbBalance);
          expect(await arbToken.balanceOf(relayer.address)).to.equal(relayerArbBalance);
          expect(await ethToken.balanceOf(user.address)).to.equal(userEthBalance);
          expect(await ethToken.balanceOf(relayer.address)).to.equal(relayerEthBalance);
          console.log("normal lock and release test finished");

          // check unique and continuous
          await expect(transfer("arb2eth", initTransferId, initMargin)).to.be.revertedWith("snapshot expired");
          await expect(transfer("arb2eth", transferId01, initMargin + 1)).to.be.revertedWith("margin updated");

          const lockTransaction1 = await transfer("arb2eth", transferId01, initMargin)
          lockReceipt = await lockTransaction1.wait();
          lockGasUsed = lockReceipt.cumulativeGasUsed;
          console.log("transferAndLockMargin 01 gas used", lockGasUsed);
          const blockTimestamp02 = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId02 = await getCurrentTransferId("arb2eth", transferId01);
          await transfer("arb2eth", transferId02, 0)
          const blockTimestamp03 = (await ethers.provider.getBlock("latest")).timestamp;
          const transferId03 = await getCurrentTransferId("arb2eth", transferId02);

          // release transfer02 failed
          await expect(relay("arb2eth", transferId02, transferId03, null)).to.be.revertedWith("previous fill not exist");
          // 1. slash when not timeout
          await expect(slash("arb2eth", transferId02, transferId03, null)).to.be.revertedWith("slash time not expired");

          await hre.network.provider.request({
              method: "evm_increaseTime",
              params: [18001],
          });
          await expect(slash("arb2eth", transferId02, transferId03, blockTimestamp03)).to.be.revertedWith("previous fill not exist");
          console.log("check continuous success");

          // 2. slash when timeout, but relayed
          await expect(slash("arb2eth", initTransferId, transferId01, blockTimestamp01)).to.be.revertedWith("fill exist");
          // relay 02 && slash 02
          await relay("arb2eth", transferId01, transferId02, blockTimestamp02);
          // can't relay twice
          await expect(relay("arb2eth", transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("fill exist");
          // 3. slash when timeout but relayed(timeout)
          // can't slash event if relayed when timeout
          await expect(slash("arb2eth", transferId01, transferId02, blockTimestamp02)).to.be.revertedWith("fill exist");
          // slash 03
          // 4. slash when timeout and not relayed
          // can slash if not relayed when timeout
          await ethToken.connect(slasher).approve(ethBridge.address, initTokenBalance);
          console.log("try slash normal");
          await slash("arb2eth", transferId02, transferId03, blockTimestamp03);
          
          await expect(withdraw('arb2eth', transferId03, 15000)).to.be.revertedWith("arbitrum mock call failed");
          expect(await withdraw('arb2eth', transferId03, 5000)).to.equal(true);
          console.log("ln bridge test finished");

          // !warning there is a bug for lnv2 to slash a native token cross transfer with opposite bridge
      }

      // test signed baseFee
      {
          const dynamicBaseFee = 1234;
          const expire = await getBlockTimestamp() + 100;
          const totalFee = Number(await arbBridge.dynamicTotalFee(
              ethChainId,
              relayer.address,
              arbToken.address,
              ethToken.address,
              transferAmount,
              dynamicBaseFee
          ));
          const providerKey = getProviderKey(ethChainId, relayer.address, arbToken.address, ethToken.address);
          const providerInfo = await arbBridge.srcProviders(providerKey);
          const lastTransferId = providerInfo.lastTransferId;
          const leftMargin = providerInfo.config.margin;
          const relayerPrivateKey = config.networks.hardhat.accounts[1].privateKey;
          const signature = await signFee(relayerPrivateKey, dynamicBaseFee, expire);
          const balanceOfUser = await arbToken.balanceOf(user.address);
          const balanceOfRelayer = await arbToken.balanceOf(relayer.address);
          const tx = await arbBridge.connect(user).transferAndLockMarginWithDynamicFee(
              [
                  ethChainId,
                  relayer.address,
                  arbToken.address,
                  ethToken.address,
                  lastTransferId,
                  totalFee,
                  leftMargin
              ],
              transferAmount,
              user.address,
              dynamicBaseFee,
              expire,
              signature
          );
          const recipient = await tx.wait();
          gasUsed = recipient.cumulativeGasUsed;
          console.log("transferAndLockMarginWithDynamicFee gas used", gasUsed);
          const balanceOfUserAfter = await arbToken.balanceOf(user.address);
          const balanceOfRelayerAfter = await arbToken.balanceOf(relayer.address);
          expect(balanceOfUser - balanceOfUserAfter).to.equal(totalFee + transferAmount);
          expect(balanceOfRelayerAfter - balanceOfRelayer).to.equal(transferAmount + totalFee - protocolFee);
      }
  });
});
