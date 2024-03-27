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
      const [owner, user01, user02] = await ethers.getSigners();
      const dao = owner.address;
      const backingChainId = 31337;
      const issuingChainId = 31337;
      const nativeTokenAddress = "0x0000000000000000000000000000000000000000";
      const nullAddress = "0x0000000000000000000000000000000000000000";
      let globalNonce = 10001;

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
      const msglineMessagerContract = await ethers.getContractFactory("MsgportMessager");
      const backingMessager = await msglineMessagerContract.deploy(dao, mockBackingMsgline.address);
      await backingMessager.deployed();
      console.log("backing messager deployed address:", backingMessager.address);
      const issuingMessager = await msglineMessagerContract.deploy(dao, mockIssuingMsgline.address);
      await issuingMessager.deployed();
      console.log("issuing messager deployed address:", issuingMessager.address);

      // deploy backing
      const xTokenBackingContract = await ethers.getContractFactory("XTokenBacking");
      const backing = await xTokenBackingContract.deploy();
      await backing.deployed();
      console.log("backing deployed address:", backing.address);
      await backing.initialize(dao, "v1.0.0");

      // deploy issuing 
      const xTokenIssuingContract = await ethers.getContractFactory("XTokenIssuing");
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
      
      let guards = [];
      for (let i = 0; i < 3; i++) {
          const wallet = ethers.Wallet.createRandom();
          guards.push(wallet);
      }
      guards = guards.sort((x, y) => {
          return x.address.toLowerCase().localeCompare(y.address.toLowerCase())
      });

      const guardBackingContract = await ethers.getContractFactory("GuardV3");
      const backingGuard = await guardBackingContract.deploy([guards[0].address, guards[1].address, guards[2].address], owner.address, 2, 60);
      await backingGuard.deployed();
      await backingGuard.setDepositor(backing.address, true);
      const guardIssuingContract = await ethers.getContractFactory("GuardV3");
      const issuingGuard = await guardIssuingContract.deploy([guards[0].address, guards[1].address, guards[2].address], owner.address, 2, 60);
      await issuingGuard.deployed();
      await issuingGuard.setDepositor(issuing.address, true);

      // deploy wtoken
      const wtokenContract = await ethers.getContractFactory("WToken");
      const wtoken = await wtokenContract.deploy("wtoken test", "WETH", 18);
      await wtoken.deployed();

      // deposit and approve
      await wtoken.connect(user01).deposit({ value: ethers.utils.parseEther("1") });
      await wtoken.connect(user01).approve(backing.address, ethers.utils.parseEther("1"));

      // deploy wtoken convertor
      const wtokenConvertorContract = await ethers.getContractFactory("WTokenConvertor")
      const wtokenConvertor = await wtokenConvertorContract.deploy(wtoken.address, backing.address);
      await wtokenConvertor.deployed();

      function generateNonce() {
          globalNonce += 1;
          return globalNonce;
      }

      async function registerToken(
          originalTokenAddress,
          originalChainName,
          originalTokenName,
          originalTokenSymbol,
          originalTokenDecimals,
          dailyLimit
      ) {
          const erc20Contract = await ethers.getContractFactory("Erc20");
          const erc20 = await erc20Contract.deploy(
              `[${originalTokenName}[${originalChainName}>`,
              `x${originalTokenSymbol}`,
              originalTokenDecimals
          );
          await erc20.deployed();

          await issuing.updateXToken(
              backingChainId,
              originalTokenAddress,
              erc20.address
          );
          await issuing.setDailyLimit(
              erc20.address,
              dailyLimit
          );
          await erc20.transferOwnership(issuing.address);

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
          await xToken.connect(user02).approve(issuing.address, ethers.utils.parseEther("1000000000"));
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

      async function lockAndXIssue(
          originalAddress,
          amount,
          fee,
          usingGuard,
          result
      ) {
          // local encode or use guard contract to encode
          //const extData = usingGuard ? ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [user02.address, "0x"]) : "0x";
          const extData = usingGuard ? await issuingGuard.encodeExtData(user02.address, "0x") : "0x";
          const recipient = usingGuard ? issuingGuard.address : user02.address;
          const nonce = generateNonce();
          const xTokenAddress = xTokens[originalAddress];

          const balanceRecipientBefore = await balanceOf(xTokenAddress, recipient);
          const balanceBackingBefore = await balanceOf(originalAddress, backing.address);

          const transaction = await backing.connect(user01).lockAndXIssue(
              issuingChainId,
              originalAddress,
              recipient,
              user01.address,
              amount,
              nonce,
              extData,
              0,
              {value: ethers.utils.parseEther(fee)}
          )
          const receipt = await transaction.wait();
          console.log("lockAndXIssue gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(xTokenAddress, recipient);
          const balanceBackingAfter = await balanceOf(originalAddress, backing.address);
          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, originalAddress, user01.address, recipient, user01.address, amount);
          const requestInfo = await backing.requestInfos(transferId);
          expect(requestInfo.isRequested).to.equal(true);
          expect(requestInfo.hasRefundForFailed).to.equal(false);
          if (result == true) {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(amount);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          } else {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(0);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          }
          return nonce;
      }

      // using wtoken convertor
      async function lockAndXIssueNative(
          amount,
          fee,
          usingGuard,
          result
      ) {
          const wtokenAddress = wtoken.address;
          //const extData = usingGuard ? ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [user02.address, "0x"]) : "0x";
          const extData = usingGuard ? await issuingGuard.encodeExtData(user02.address, "0x") : "0x";
          const recipient = usingGuard ? issuingGuard.address : user02.address;
          const nonce = generateNonce();
          const xTokenAddress = xTokens[wtokenAddress];

          const balanceRecipientBefore = await balanceOf(xTokenAddress, recipient);
          const balanceBackingBefore = await balanceOf(wtokenAddress, backing.address);

          const transaction = await wtokenConvertor.connect(user01).lockAndXIssue(
              issuingChainId,
              recipient,
              user01.address,
              amount,
              nonce,
              extData,
              0,
              {value: ethers.utils.parseEther(fee)}
          );

          const receipt = await transaction.wait();
          console.log("lockAndXIssue native gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(xTokenAddress, recipient);
          const balanceBackingAfter = await balanceOf(wtokenAddress, backing.address);
          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, wtokenAddress, wtokenConvertor.address, recipient, user01.address, amount);
          const requestInfo = await backing.requestInfos(transferId);
          expect(requestInfo.isRequested).to.equal(true);
          expect(requestInfo.hasRefundForFailed).to.equal(false);
          if (result == true) {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(amount);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          } else {
              expect(balanceRecipientAfter - balanceRecipientBefore).to.equal(0);
              expect(balanceBackingAfter - balanceBackingBefore).to.equal(amount);
          }
          return nonce;
      }

      async function burnAndXUnlock(
          originalAddress,
          amount,
          fee,
          usingGuard,
          result
      ) {
          const usingConvertor = originalAddress == nativeTokenAddress;
          const msgToken = usingConvertor ? wtoken.address : originalAddress;

          //const usingGuardAndConvertorExtData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [wtokenConvertor.address, user01.address]);
          const usingGuardAndConvertorExtData = await backingGuard.encodeExtData(wtokenConvertor.address, user01.address);
          //const usingOnlyGuard = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [user01.address, "0x"]);
          const usingOnlyGuard = await backingGuard.encodeExtData(user01.address, "0x");
          const usingOnlyConvertor = user01.address;
          const usingNothingExtData = "0x";

          const extData = usingGuard?(usingConvertor?usingGuardAndConvertorExtData:usingOnlyGuard):(usingConvertor?usingOnlyConvertor:usingNothingExtData);

          const recipient = usingGuard ? backingGuard.address : (usingConvertor ? wtokenConvertor.address : user01.address);
          const tokenReceiver = usingGuard ? backingGuard.address : user01.address;

          const recvToken = usingGuard ? msgToken : originalAddress;

          const nonce = generateNonce();
          const xTokenAddress = xTokens[msgToken];

          const balanceUserBefore = await balanceOf(xTokenAddress, user02.address);
          const balanceRecipientBefore = await balanceOf(recvToken, tokenReceiver);
          const balanceBackingBefore = await balanceOf(msgToken, backing.address);

          const transaction = await issuing.connect(user02).burnAndXUnlock(
              xTokenAddress,
              recipient,
              user02.address,
              amount,
              nonce,
              extData,
              0,
              {value: ethers.utils.parseEther(fee)}
          );
          const receipt = await transaction.wait();
          console.log("burnAndXUnlock gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(recvToken, tokenReceiver);
          const balanceBackingAfter = await balanceOf(msgToken, backing.address);
          const balanceUserAfter = await balanceOf(xTokenAddress, user02.address);

          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, msgToken, user02.address, recipient, user02.address, amount);
          const requestInfo = await issuing.requestInfos(transferId);
          expect(requestInfo.isRequested).to.equal(true);
          expect(requestInfo.hasRefundForFailed).to.equal(false);
          expect(balanceUserBefore.sub(balanceUserAfter)).to.equal(amount);

          if (result) {
              expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(amount);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(amount);
          } else {
              // if successfully unlock native token by guard
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(0);
              expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(0);
          }
          return nonce;
      }

      async function xRollbackLockAndXIssue(
          originalToken,
          amount,
          nonce,
          fee,
          result,
          recipient = user02.address
      ) {
          const msgToken = originalToken == nativeTokenAddress ? wtoken.address : originalToken;
          const msgSender = originalToken == nativeTokenAddress ? wtokenConvertor.address : user01.address;
          const originalSender = user01.address;
          //const recipient = user02.address;
          const balanceBackingBefore = await balanceOf(msgToken, backing.address);
          const balanceSenderBefore = await balanceOf(originalToken, originalSender);
          const transaction = await issuing.xRollbackLockAndXIssue(
              backingChainId,
              msgToken,
              msgSender,
              recipient,
              user01.address,
              amount,
              nonce,
              0,
              {
                  value: ethers.utils.parseEther(fee),
                  gasPrice: 10000000000,
              }
          );
          const balanceSenderAfter = await balanceOf(originalToken, originalSender);
          const balanceBackingAfter = await balanceOf(msgToken, backing.address);
          
          let receipt = await transaction.wait();
          let gasFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, msgToken, msgSender, recipient, user01.address, amount);
          const requestInfo = await backing.requestInfos(transferId);
          if (result) {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.be.equal(amount);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.be.equal(amount);
              expect(requestInfo.isRequested).to.equal(true);
              expect(requestInfo.hasRefundForFailed).to.equal(true);
          } else {
              expect(balanceSenderAfter.sub(balanceSenderBefore)).to.be.equal(0);
              expect(balanceBackingBefore.sub(balanceBackingAfter)).to.be.equal(0);
          }
      }

      async function xRollbackBurnAndXUnlock(
          originalToken,
          amount,
          nonce,
          fee,
          result
      ) {
          const originalSender = user02.address;
          const recipient = user01.address;

          const xTokenAddress = xTokens[originalToken];

          const balanceSenderBefore = await balanceOf(xTokenAddress, originalSender);
          await backing.xRollbackBurnAndXUnlock(
              issuingChainId,
              originalToken,
              originalSender,
              recipient,
              user02.address,
              amount,
              nonce,
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
          const usingConvertor = nativeTokenAddress == token;
          const msgToken = usingConvertor ? wtoken.address : token;
          let extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [recipient, "0x"]);
          if (usingConvertor) {
              extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [wtokenConvertor.address, recipient]);
          }
          // encode value
          const structHash =
              ethUtil.keccak256(
                  abi.rawEncode(
                      ['bytes4', 'bytes'],
                      [abi.methodID('claim', ['address',  'uint256', 'uint256', 'address', 'uint256', 'bytes', 'bytes[]' ]),
                          abi.rawEncode(['address', 'uint256', 'uint256', 'address', 'uint256', 'bytes'],
                              [depositer, id, timestamp, msgToken, amount, ethers.utils.arrayify(extData)])
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
          const balanceBackingBefore = await balanceOf(msgToken, depositer);
          const balanceRecipientBefore = await balanceOf(token, recipient);
          await guard.claim(depositer, id, timestamp, msgToken, amount, extData, signatures);
          const balanceBackingAfter = await balanceOf(msgToken, depositer);
          const balanceRecipientAfter = await balanceOf(token, recipient);
          expect(balanceBackingBefore.sub(balanceBackingAfter)).to.equal(0);
          expect(balanceRecipientAfter.sub(balanceRecipientBefore)).to.equal(amount);
      }

      async function guardSetClaimTime(
          guard,
          timestamp,
          wallets
      ) {
          // encode value
          const nonce = await guard.nonce();
          console.log(nonce);
          const structHash =
              ethUtil.keccak256(
                  abi.rawEncode(
                      ['bytes4', 'bytes', 'uint256'],
                      [abi.methodID('setMaxUnclaimableTime', ['uint256', 'bytes[]' ]),
                          abi.rawEncode(['uint256'], [timestamp]),
                          Number(nonce)
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
          const timeBefore = await guard.maxUnclaimableTime();
          expect((timeBefore.sub(timestamp)).lt(0));
          await guard.setMaxUnclaimableTime(timestamp, signatures);
          const timeAfter = await guard.maxUnclaimableTime();
          expect(timeAfter).to.equal(timestamp);
      }

      await registerToken(
          wtoken.address,
          "ethereum",
          "wrapped token",
          "weth",
          18,
          1000
      );

      await expect(lockAndXIssue(
          wtoken.address,
          100,
          "0.9",
          false,
          true
      )).to.be.revertedWith("fee is not enough");

      // success lock and remote xtoken
      const nonce01 = await lockAndXIssue(
          wtoken.address,
          500,
          "1.1",
          false,
          true
      );
      // success burn and remote unlock
      const nonce02 = await burnAndXUnlock(
          wtoken.address,
          100,
          "1.1",
          false,
          true
      );
      // test refund failed if the message has been successed
      await expect(xRollbackLockAndXIssue(
          wtoken.address,
          500,
          nonce01,
          "1.1",
          true
      )).to.be.revertedWith("!conflict");
      await expect(xRollbackBurnAndXUnlock(
          wtoken.address,
          100,
          nonce02,
          "1.1",
          true
      )).to.be.revertedWith("!conflict");

      // lock exceed daily limit
      const nonce03 = await lockAndXIssue(
          wtoken.address,
          501,
          "1.1",
          false,
          false
      );
      // refund (when isssuing failed)
      await xRollbackLockAndXIssue(
          wtoken.address,
          501,
          nonce03,
          "1.1",
          true
      );
      // the params not right
      // 1. amount
      await xRollbackLockAndXIssue(
          wtoken.address,
          500,
          nonce03,
          "1.1",
          false
      );
      // receiver
      await xRollbackLockAndXIssue(
          wtoken.address,
          501,
          nonce03,
          "1.1",
          false
      );
      // refund twice
      await xRollbackLockAndXIssue(
          wtoken.address,
          501,
          nonce03,
          "1.1",
          false
      );
      // burn failed
      await mockBackingMsgline.setRecvFailed();
      const nonce04 = await burnAndXUnlock(
          wtoken.address,
          100,
          "1.1",
          false,
          false
      );
      // invalid args
      await xRollbackBurnAndXUnlock(
          wtoken.address,
          101,
          nonce04,
          "1.1",
          false
      );
      // refund (when unlock failed)
      await xRollbackBurnAndXUnlock(
          wtoken.address,
          100,
          nonce04,
          "1.1",
          true
      );
      // refund twice
      await xRollbackBurnAndXUnlock(
          wtoken.address,
          100,
          nonce04,
          "1.1",
          false
      );

      // using guard
      await backing.updateGuard(backingGuard.address);
      await issuing.updateGuard(issuingGuard.address);
      // if set guard, the recipient must be guard and the real recipient is filled in extData

      // lock -> issuing using guard
      const nonce05 = await lockAndXIssue(
          wtoken.address,
          10,
          "1.1",
          true,//using guard
          true
      );
      const transferId = await backing.getTransferId(nonce05, backingChainId, issuingChainId, wtoken.address, user01.address, issuingGuard.address, user01.address, 10);
      await guardClaim(
          issuingGuard,
          issuing.address,
          transferId,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          xTokens[wtoken.address],
          user02.address,
          10
      );
      // burn -> unlock using guard (native token)
      const nonce06 = await burnAndXUnlock(
          wtoken.address,
          20,
          "1.1",
          true, //using guard
          true
      );
      const transferId06 = await backing.getTransferId(nonce06, backingChainId, issuingChainId, wtoken.address, user02.address, backingGuard.address, user02.address, 20);
      await guardClaim(
          backingGuard,
          backing.address,
          transferId06,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          // native token must be claimed by wtoken
          wtoken.address,
          user01.address,
          20
      );
      // claim twice
      await expect(guardClaim(
          backingGuard,
          backing.address,
          transferId06,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          wtoken.address,
          user01.address,
          20
      )).to.be.revertedWith("Guard: Invalid id to claim");

      // test message slashed
      await mockIssuingMsgline.setNeverDelivered();
      // this message will be never delivered
      const nonce07 = await lockAndXIssue(
          wtoken.address,
          10,
          "1.1",
          true,
          false
      );

      await guardSetClaimTime(issuingGuard, 110011, [guards[0], guards[1]]);

      // test native token
      const nonceN1 = await lockAndXIssueNative(
          100,
          "1.1",
          true,
          true
      );

      const transferIdN1 = await backing.getTransferId(nonceN1, backingChainId, issuingChainId, wtoken.address, wtokenConvertor.address, issuingGuard.address, user01.address, 100);
      await guardClaim(
          issuingGuard,
          issuing.address,
          transferIdN1,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          // native token must be claimed by wtoken
          xTokens[wtoken.address],
          user02.address,
          100
      );

      // exceed daily limit
      const nonceN2 = await lockAndXIssueNative(
          10000,
          "1.1",
          true,
          false
      );

      // refund
      await xRollbackLockAndXIssue(
          nativeTokenAddress,
          10000,
          nonceN2,
          "1.1",
          true,
          issuingGuard.address
      );

      const nonceN3 = await burnAndXUnlock(
          nativeTokenAddress,
          100,
          "1.1",
          true,
          true
      );
      const transferIdN3 = await backing.getTransferId(nonceN3, backingChainId, issuingChainId, wtoken.address, user02.address, backingGuard.address, user02.address, 100);
      await guardClaim(
          backingGuard,
          backing.address,
          transferIdN3,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          // native token must be claimed by wtoken
          nativeTokenAddress,
          user01.address,
          100
      );

      await backing.updateGuard(nullAddress);
      await burnAndXUnlock(
          nativeTokenAddress,
          100,
          "1.1",
          false,
          true
      );
      console.log("unit test finish");
  });
});

