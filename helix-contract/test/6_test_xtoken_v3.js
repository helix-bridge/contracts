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
          const extData = usingGuard ? ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [user02.address, "0x"]) : "0x";
          const recipient = usingGuard ? issuingGuard.address : user02.address;
          const nonce = generateNonce();
          const xTokenAddress = xTokens[originalAddress];

          const balanceRecipientBefore = await balanceOf(xTokenAddress, recipient);
          const balanceBackingBefore = await balanceOf(originalAddress, backing.address);

          const transaction = await backing.connect(user01).lockAndXIssue(
              issuingChainId,
              originalAddress,
              recipient,
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
          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, originalAddress, user01.address, recipient, amount);
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
          const extData = usingGuard ? ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [user01.address, "0x"]) : "0x";
          const recipient = usingGuard ? backingGuard.address : user01.address;

          const nonce = generateNonce();
          const xTokenAddress = xTokens[originalAddress];

          const balanceUserBefore = await balanceOf(xTokenAddress, user02.address);
          const balanceRecipientBefore = await balanceOf(originalAddress, recipient);
          const balanceBackingBefore = await balanceOf(originalAddress, backing.address);

          const transaction = await issuing.connect(user02).burnAndXUnlock(
              xTokenAddress,
              recipient,
              amount,
              nonce,
              extData,
              0,
              {value: ethers.utils.parseEther(fee)}
          );
          const receipt = await transaction.wait();
          console.log("burnAndXUnlock gasUsed: ", receipt.cumulativeGasUsed);

          const balanceRecipientAfter = await balanceOf(originalAddress, recipient);
          const balanceBackingAfter = await balanceOf(originalAddress, backing.address);
          const balanceUserAfter = await balanceOf(xTokenAddress, user02.address);

          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, originalAddress, user02.address, recipient, amount);
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
          const originalSender = user01.address;
          //const recipient = user02.address;
          const balanceBackingBefore = await balanceOf(originalToken, backing.address);
          const balanceSenderBefore = await balanceOf(originalToken, originalSender);
          const transaction = await issuing.xRollbackLockAndXIssue(
              backingChainId,
              originalToken,
              originalSender,
              recipient,
              amount,
              nonce,
              0,
              {
                  value: ethers.utils.parseEther(fee),
                  gasPrice: 10000000000,
              }
          );
          const balanceSenderAfter = await balanceOf(originalToken, originalSender);
          const balanceBackingAfter = await balanceOf(originalToken, backing.address);
          
          let receipt = await transaction.wait();
          let gasFee = receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);

          const transferId = await backing.getTransferId(nonce, backingChainId, issuingChainId, originalToken, originalSender, recipient, amount);
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
          const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [recipient, "0x"]);
          // encode value
          const structHash =
              ethUtil.keccak256(
                  abi.rawEncode(
                      ['bytes4', 'bytes'],
                      [abi.methodID('claim', ['address',  'uint256', 'uint256', 'address', 'uint256', 'bytes', 'bytes[]' ]),
                          abi.rawEncode(['address', 'uint256', 'uint256', 'address', 'uint256', 'bytes'],
                              [depositer, id, timestamp, token, amount, ethers.utils.arrayify(extData)])
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
          await guard.claim(depositer, id, timestamp, token, amount, extData, signatures);
          const balanceBackingAfter = await balanceOf(token, depositer);
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
          nativeTokenAddress,
          "ethereum",
          "native token",
          "eth",
          18,
          1000
      );

      await expect(lockAndXIssue(
          nativeTokenAddress,
          100,
          "0.9",
          false,
          true
      )).to.be.revertedWith("fee is not enough");

      // success lock and remote xtoken
      const nonce01 = await lockAndXIssue(
          nativeTokenAddress,
          500,
          "1.1",
          false,
          true
      );
      // success burn and remote unlock
      const nonce02 = await burnAndXUnlock(
          nativeTokenAddress,
          100,
          "1.1",
          false,
          true
      );

      // test refund failed if the message has been successed
      await expect(xRollbackLockAndXIssue(
          nativeTokenAddress,
          500,
          nonce01,
          "1.1",
          true
      )).to.be.revertedWith("!conflict");
      await expect(xRollbackBurnAndXUnlock(
          nativeTokenAddress,
          100,
          nonce02,
          "1.1",
          true
      )).to.be.revertedWith("!conflict");

      // lock exceed daily limit
      const nonce03 = await lockAndXIssue(
          nativeTokenAddress,
          501,
          "1.1",
          false,
          false
      );
      // refund (when isssuing failed)
      await xRollbackLockAndXIssue(
          nativeTokenAddress,
          501,
          nonce03,
          "1.1",
          true
      );
      // the params not right
      // 1. amount
      await xRollbackLockAndXIssue(
          nativeTokenAddress,
          500,
          nonce03,
          "1.1",
          false
      );
      // receiver
      await xRollbackLockAndXIssue(
          nativeTokenAddress,
          501,
          nonce03,
          "1.1",
          false
      );
      // refund twice
      await xRollbackLockAndXIssue(
          nativeTokenAddress,
          501,
          nonce03,
          "1.1",
          false
      );
      // burn failed
      await mockBackingMsgline.setRecvFailed();
      const nonce04 = await burnAndXUnlock(
          nativeTokenAddress,
          100,
          "1.1",
          false,
          false
      );
      // invalid args
      await xRollbackBurnAndXUnlock(
          nativeTokenAddress,
          101,
          nonce04,
          "1.1",
          false
      );
      // refund (when unlock failed)
      await xRollbackBurnAndXUnlock(
          nativeTokenAddress,
          100,
          nonce04,
          "1.1",
          true
      );
      // refund twice
      await xRollbackBurnAndXUnlock(
          nativeTokenAddress,
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
          nativeTokenAddress,
          10,
          "1.1",
          true,//using guard
          true
      );
      const transferId = await backing.getTransferId(nonce05, backingChainId, issuingChainId, nativeTokenAddress, user01.address, issuingGuard.address, 10);
      await guardClaim(
          issuingGuard,
          issuing.address,
          transferId,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          xTokens[nativeTokenAddress],
          user02.address,
          10
      );
      // burn -> unlock using guard (native token)
      const nonce06 = await burnAndXUnlock(
          nativeTokenAddress,
          20,
          "1.1",
          true, //using guard
          true
      );
      const transferId06 = await backing.getTransferId(nonce06, backingChainId, issuingChainId, nativeTokenAddress, user02.address, backingGuard.address, 20);
      await guardClaim(
          backingGuard,
          backing.address,
          transferId06,
          await getBlockTimestamp(),
          [guards[0], guards[1]],
          // native token must be claimed by wtoken
          nativeTokenAddress,
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
          nativeTokenAddress,
          user01.address,
          20
      )).to.be.revertedWith("Guard: Invalid id to claim");

      // test message slashed
      await mockIssuingMsgline.setNeverDelivered();
      // this message will be never delivered
      const nonce07 = await lockAndXIssue(
          nativeTokenAddress,
          10,
          "1.1",
          true,
          false
      );

      await guardSetClaimTime(issuingGuard, 110011, [guards[0], guards[1]]);
      return;

      // test callback
      const swapTokenContract = await ethers.getContractFactory("Erc20");
      const swapToken = await swapTokenContract.deploy('swapped ETH', 'sETH', 18);
      await swapToken.deployed();

      const mockxTokenSwapContract = await ethers.getContractFactory("MockxTokenSwap");
      const mockxTokenSwap= await mockxTokenSwapContract.deploy(xTokens[nativeTokenAddress], swapToken.address, backing.address);
      await mockxTokenSwap.deployed();

      // there is guard
      {
          await backing.connect(user01).lockAndXIssue(
              issuingChainId,
              nativeTokenAddress,
              mockxTokenSwap.address,
              10,
              123456,
              user02.address,
              0,
              {value: ethers.utils.parseEther("1.1")}
          );
          // no right to mint swap token, can't claim
          const transferId = await backing.getTransferId(123456, backingChainId, issuingChainId, nativeTokenAddress, user01.address, mockxTokenSwap.address, 10);
          const blockTimestamp = await getBlockTimestamp();
          await expect(guardClaim(
              issuingGuard,
              issuing.address,
              transferId,
              blockTimestamp,
              [guards[0], guards[1]],
              xTokens[nativeTokenAddress],
              mockxTokenSwap.address,
              10,
              user02.address
          )).to.be.revertedWith("Ownable: caller is not the owner");
          // give mint right to swap contract 
          await swapToken.transferOwnership(mockxTokenSwap.address);
          const balanceBefore = await balanceOf(swapToken.address, user02.address);
          await guardClaim(
              issuingGuard,
              issuing.address,
              transferId,
              blockTimestamp,
              [guards[0], guards[1]],
              xTokens[nativeTokenAddress],
              mockxTokenSwap.address,
              10,
              user02.address
          )
          // user02 receive swapped token
          const balanceAfter = await balanceOf(swapToken.address, user02.address);
          expect(balanceBefore).to.equal(0);
          expect(balanceAfter).to.equal(10);
      }
      
      // no guard
      {
          await issuing.updateGuard("0x0000000000000000000000000000000000000000");
          await mockxTokenSwap.transferOwnership(swapToken.address, owner.address);
          // failed because swap contract has no right to mint token
          await backing.connect(user01).lockAndXIssue(
              issuingChainId,
              nativeTokenAddress,
              mockxTokenSwap.address,
              100,
              123456,
              user02.address,
              0,
              {value: ethers.utils.parseEther("1.1")}
          );
          // issuing contract has no right to mint swap token, this can be revert
          await xRollbackLockAndXIssue(
              nativeTokenAddress,
              100,
              123456,
              "1.1",
              true,
              mockxTokenSwap.address
          );
          // give mint right to issuing
          await swapToken.transferOwnership(mockxTokenSwap.address);
          const balanceBefore = await balanceOf(swapToken.address, user02.address);
          await backing.connect(user01).lockAndXIssue(
              issuingChainId,
              nativeTokenAddress,
              mockxTokenSwap.address,
              100,
              1234567,
              user02.address,
              0,
              {value: ethers.utils.parseEther("1.1")}
          )
          // user02 receive swapped token
          const balanceAfter = await balanceOf(swapToken.address, user02.address);
          expect(balanceBefore).to.equal(10);
          expect(balanceAfter).to.equal(110);
      }
  });
});

