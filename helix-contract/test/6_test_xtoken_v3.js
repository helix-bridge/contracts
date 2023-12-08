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

describe("xtoken tests", () => {
  before(async () => {
  });

  it("test_msglinebased_xtoken_flow", async function () {
      const [owner, relayer, user, slasher] = await ethers.getSigners();
      const dao = owner.address;
      const backingChainId = 31337;
      const issuingChainId = 31337;
      const nativeTokenAddress = "0x0000000000000000000000000000000000000000";

      const xTokens = {};

      // deploy mock msgline
      const mockMsglineContract = await ethers.getContractFactory("MockMessageLine");
      const mockBackingMsgline = await mockMsglineContract.deploy();
      await mockBackingMsgline.deployed();
      const mockIssuingMsgline = await mockMsglineContract.deploy();
      await mockIssuingMsgline.deployed();
      await mockBackingMsgline.setRemote(mockIssuingMsgline.address);
      await mockIssuingMsgline.setRemote(mockBackingMsgline.address);
      console.log("mock msgline deployed address:", mockBackingMsgline.address, mockIssuingMsgline.address);

      // deploy msgline messager
      const msglineMessagerContract = await ethers.getContractFactory("MsglineMessager");
      const backingMessager = await msglineMessagerContract.deploy(dao, mockBackingMsgline.address);
      await backingMessager.deployed();
      console.log("backing messager deployed address:", backingMessager.address);
      const issuingMessager = await msglineMessagerContract.deploy(dao, mockIssuingMsgline.address);
      await issuingMessager.deployed();
      console.log("issuing messager deployed address:", issuingMessager.address);

      // deploy backing
      const xTokenBackingContract = await ethers.getContractFactory("xTokenBacking");
      const backing = await xTokenBackingContract.deploy();
      await backing.deployed();
      console.log("backing deployed address:", backing.address);
      await backing.initialize(dao, "v1.0.0");

      // deploy issuing 
      const xTokenIssuingContract = await ethers.getContractFactory("xTokenIssuing");
      const issuing = await xTokenIssuingContract.deploy();
      await issuing.deployed();
      console.log("issuing deployed address:", issuing.address);
      await issuing.initialize(dao, "v1.0.0");

      await backingMessager.setRemoteMessager(issuingChainId, issuingChainId, issuingMessager.address);
      await issuingMessager.setRemoteMessager(backingChainId, backingChainId, backingMessager.address);
      await backingMessager.setWhiteList(backing.address, true);
      await issuingMessager.setWhiteList(issuing.address, true);

      await backing.setSendService(issuingChainId, issuing.address, backingMessager.address);
      await backing.setReceiveService(issuingChainId, issuing.address, backingMessager.address);
      await issuing.setSendService(backingChainId, backing.address, issuingMessager.address);
      await issuing.setReceiveService(backingChainId, backing.address, issuingMessager.address);
      console.log("configure backing & issuing finished");
      
      // use a mapping erc20 as original token
      const wethName = "Ethereum Wrapped ETH";
      const wethSymbol = "WETH";
      const wethContract = await ethers.getContractFactory("WToken");
      const weth = await wethContract.deploy(wethName, wethSymbol, 18);
      await weth.deployed();
      await backing.setwToken(weth.address);

      let guards = [];
      for (let i = 0; i < 3; i++) {
          const wallet = ethers.Wallet.createRandom();
          guards.push(wallet);
      }
      guards = guards.sort((x, y) => {
          return x.address.toLowerCase().localeCompare(y.address.toLowerCase())
      });

      const guardBackingContract = await ethers.getContractFactory("Guard");
      const backingGuard = await guardBackingContract.deploy([guards[0].address, guards[1].address, guards[2].address], 2, 60, backing.address);
      await backingGuard.deployed();
      const guardIssuingContract = await ethers.getContractFactory("Guard");
      const issuingGuard = await guardIssuingContract.deploy([guards[0].address, guards[1].address, guards[2].address], 2, 60, issuing.address);
      await issuingGuard.deployed();

      async function registerToken(
          originalTokenAddress,
          originalChainName,
          originalTokenName,
          originalTokenSymbol,
          originalTokenDecimals,
          dailyLimit
      ) {
          // register xtoken
          await issuing.registerxToken(
              backingChainId,
              originalTokenAddress,
              originalChainName,
              originalTokenName,
              originalTokenSymbol,
              originalTokenDecimals,
              dailyLimit
          );
          console.log("register xtoken finished");

          const xTokenSalt = await issuing.xTokenSalt(backingChainId, originalTokenAddress);
          const xTokenAddress = await issuing.xTokens(xTokenSalt);
          // register native token
          await backing.registerOriginalToken(
              issuingChainId,
              originalTokenAddress,
              xTokenAddress,
              dailyLimit
          );
          console.log("register original token finished, address:", xTokenAddress);
          xTokens[originalTokenAddress] = xTokenAddress;
          const xToken = await ethers.getContractAt("Erc20", xTokenAddress);
          await xToken.approve(issuing.address, ethers.utils.parseEther("1000000000"));
          return xTokenAddress;
      }

      async function balanceOf(tokenAddress, account) {
          if (tokenAddress == nativeTokenAddress) {
              return await ethers.provider.getBalance(account);
          } else {
              const token = await ethers.getContractAt("Erc20", tokenAddress);
              return await token.balanceOf(account);
          }
      }

      async function lockAndRemoteIssuing(
          originalAddress,
          recipient,
          amount,
          fee,
          usingGuard,
          result
      ) {
          const xTokenAddress = xTokens[originalAddress];

          const balanceRecipientBefore = await balanceOf(xTokenAddress, recipient);
          const balanceBackingBefore = await balanceOf(originalAddress, backing.address);

          const transaction = await backing.lockAndRemoteIssuing(
              issuingChainId,
              originalAddress,
              recipient,
              amount,
              0,
              {value: ethers.utils.parseEther(fee)}
          )
          const receipt = await transaction.wait();
          console.log("lockAndRemoteIssuing gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(xTokenAddress, recipient);
          const balanceBackingAfter = await balanceOf(originalAddress, backing.address);
          const messageId = await backingMessager.latestSentMessageId();
          const lockInfo = await backing.lockedMessages(messageId);

          expect(lockInfo.hash).not.to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
          expect(lockInfo.hasRefundForFailed).to.equal(false);
          if (result == true && !usingGuard) {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(amount);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          } else {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(0);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          }
      }

      async function burnAndRemoteUnlock(
          originalAddress,
          recipient,
          amount,
          fee,
          usingGuard,
          result
      ) {
          const xTokenAddress = xTokens[originalAddress];

          const balanceUserBefore = await balanceOf(xTokenAddress, owner.address);
          const balanceRecipientBefore = await balanceOf(originalAddress, recipient);
          const balanceBackingBefore = await balanceOf(originalAddress, backing.address);

          const transaction = await issuing.burnAndRemoteUnlock(
              xTokenAddress,
              recipient,
              amount,
              0,
              {value: ethers.utils.parseEther(fee)}
          );
          const receipt = await transaction.wait();
          console.log("burnAndRemoteUnlock gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(originalAddress, recipient);
          const balanceBackingAfter = await balanceOf(originalAddress, backing.address);
          const balanceUserAfter = await balanceOf(xTokenAddress, owner.address);

          const messageId = await issuingMessager.latestSentMessageId();
          const burnInfo = await issuing.burnMessages(messageId);
          expect(burnInfo.hash).not.to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
          expect(burnInfo.hasRefundForFailed).to.equal(false);
          expect(balanceUserBefore.sub(balanceUserAfter)).to.equal(amount);

          if (result && !usingGuard) {
              expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(amount);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(amount);
          } else {
              // if successfully unlock native token by guard
              if (nativeTokenAddress == originalAddress && result && usingGuard) {
                  expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(amount);
              } else {
                  expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(0);
              }
              expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(0);
          }
      }

      async function requestRemoteUnlockForIssuingFailure(
          transferId,
          originalToken,
          originalSender,
          amount,
          fee,
          result
      ) {
          const balanceBackingBefore = await balanceOf(originalToken, backing.address);
          const balanceSenderBefore = await balanceOf(originalToken, originalSender);
          const balanceSlasherBefore = await balanceOf(originalToken, slasher.address);
          const transaction = await issuing.connect(slasher).requestRemoteUnlockForIssuingFailure(
              transferId,
              backingChainId,
              originalToken,
              originalSender,
              amount,
              0,
              {
                  value: ethers.utils.parseEther(fee),
                  gasPrice: 10000000000,
              }
          );
          const balanceSenderAfter = await balanceOf(originalToken, originalSender);
          const balanceBackingAfter = await balanceOf(originalToken, backing.address);
          const balanceSlasherAfter = await balanceOf(originalToken, slasher.address);
          
          let receipt = await transaction.wait();
          let gasFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
          expect(balanceSlasherBefore.sub(balanceSlasherAfter)).to.be.equal(gasFee.add(ethers.utils.parseEther(fee)));

          const lockInfo = await backing.lockedMessages(transferId);
          expect(lockInfo.hash).not.to.equal("0x0000000000000000000000000000000000000000000000000000000000000000");
          if (result) {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.be.equal(amount);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.be.equal(amount);
              expect(lockInfo.hasRefundForFailed).to.equal(true);
          } else {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.be.equal(0);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.be.equal(0);
          }
      }

      async function requestRemoteIssuingForUnlockFailure(
          transferId,
          originalToken,
          originalSender,
          amount,
          fee,
          result
      ) {
          const xTokenAddress = xTokens[originalToken];

          const balanceSenderBefore = await balanceOf(xTokenAddress, originalSender);
          await backing.requestRemoteIssuingForUnlockFailure(
              transferId,
              issuingChainId,
              originalToken,
              originalSender,
              amount,
              0,
              {value: ethers.utils.parseEther(fee)}
          );
          const balanceSenderAfter = await balanceOf(xTokenAddress, originalSender);
          if (result) {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.equal(amount);
          } else {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.equal(0);
          }
      }

      async function guardClaim(
          guard,
          depositer,
          id,
          timestamp,
          wallets,
          token,
          recipient,
          amount
      ) {
          // encode value
          const structHash =
              ethUtil.keccak256(
                  abi.rawEncode(
                      ['bytes4', 'bytes'],
                      [abi.methodID('claim', [ 'uint256', 'uint256', 'address', 'address', 'uint256', 'bytes[]' ]),
                          abi.rawEncode(['uint256', 'uint256', 'address', 'address', 'uint256'],
                              [id, timestamp, token, recipient, amount])
                      ]
                  )
              );
          const dataHash = await guard.encodeDataHash(structHash);
          const signatures = wallets.map((wallet) => {
              const address = wallet.address;
              const privateKey = ethers.utils.arrayify(wallet.privateKey);
              const signatureECDSA = secp256k1.ecdsaSign(ethers.utils.arrayify(dataHash), privateKey);
              const ethRecID = signatureECDSA.recid + 27;
              const signature = Uint8Array.from(
                  signatureECDSA.signature.join().split(',').concat(ethRecID)
              );
              return ethers.utils.hexlify(signature);
          });
          const balanceBackingBefore = await balanceOf(token, depositer);
          const balanceRecipientBefore = await balanceOf(token, recipient);
          await guard.claim(id, timestamp, token, recipient, amount, signatures);
          const balanceBackingAfter = await balanceOf(token, depositer);
          const balanceRecipientAfter = await balanceOf(token, recipient);
          expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(amount);
          expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(amount);
      }

      await registerToken(
          nativeTokenAddress,
          "ethereum",
          "native token",
          "eth",
          18,
          1000
      );

      await expect(lockAndRemoteIssuing(
          nativeTokenAddress,
          owner.address,
          100,
          "0.9",
          false,
          true
      )).to.be.revertedWith("fee is not enough");

      // success lock and remote xtoken
      await lockAndRemoteIssuing(
          nativeTokenAddress,
          owner.address,
          500,
          "1.1",
          false,
          true
      );
      // success burn and remote unlock
      await burnAndRemoteUnlock(
          nativeTokenAddress,
          user.address,
          100,
          "1.1",
          false,
          true
      );

      // test refund failed if the message has been successed
      await expect(requestRemoteUnlockForIssuingFailure(
          await issuingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          100,
          "1.1",
          true
      )).to.be.revertedWith("success message can't refund for failed");
      await expect(requestRemoteIssuingForUnlockFailure(
          await backingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          100,
          "1.1",
          true
      )).to.be.revertedWith("success message can't refund for failed");

      // lock exceed daily limit
      await lockAndRemoteIssuing(
          nativeTokenAddress,
          owner.address,
          501,
          "1.1",
          false,
          false
      );
      // refund (when isssuing failed)
      await requestRemoteUnlockForIssuingFailure(
          await issuingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          501,
          "1.1",
          true
      );
      // the params not right
      // 1. amount
      await requestRemoteUnlockForIssuingFailure(
          await issuingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          500,
          "1.1",
          false
      );
      // receiver
      await requestRemoteUnlockForIssuingFailure(
          await issuingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          relayer.address,
          501,
          "1.1",
          false
      );
      // refund twice
      await requestRemoteUnlockForIssuingFailure(
          await issuingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          501,
          "1.1",
          false
      );
      // burn failed
      await mockBackingMsgline.setRecvFailed();
      await burnAndRemoteUnlock(
          nativeTokenAddress,
          user.address,
          100,
          "1.1",
          false,
          false
      );
      // invalid args
      await requestRemoteIssuingForUnlockFailure(
          await backingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          user.address,
          101,
          "1.1",
          false
      );
      // refund (when unlock failed)
      await requestRemoteIssuingForUnlockFailure(
          await backingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          100,
          "1.1",
          true
      );
      // refund twice
      await requestRemoteIssuingForUnlockFailure(
          await backingMessager.latestRecvMessageId(),
          nativeTokenAddress,
          owner.address,
          100,
          "1.1",
          false
      );

      // using guard
      await backing.updateGuard(backingGuard.address);
      await issuing.updateGuard(issuingGuard.address);

      // lock -> issuing using guard
      await lockAndRemoteIssuing(
          nativeTokenAddress,
          owner.address,
          10,
          "1.1",
          true,//using guard
          true
      );
      await guardClaim(
          issuingGuard,
          issuing.address,
          await issuingMessager.latestRecvMessageId(),
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          xTokens[nativeTokenAddress],
          owner.address,
          10
      );
      // burn -> unlock using guard (native token)
      await burnAndRemoteUnlock(
          nativeTokenAddress,
          user.address,
          20,
          "1.1",
          true, //using guard
          true
      );
      await guardClaim(
          backingGuard,
          backing.address,
          await backingMessager.latestRecvMessageId(),
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          // native token must be claimed by wtoken
          weth.address,
          user.address,
          20
      );
      // claim twice
      await expect(guardClaim(
          backingGuard,
          backing.address,
          await backingMessager.latestRecvMessageId(),
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          weth.address,
          user.address,
          20
      )).to.be.revertedWith("Guard: Invalid id to claim");
  });
});

