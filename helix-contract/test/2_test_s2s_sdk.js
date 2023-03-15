const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");

chai.use(solidity);

describe("sub<>sub mapping token tests", () => {
  before(async () => {
  });

  it("test_s2s_with_sdk_erc20", async function () {
      const remoteReceiveGasLimit = 1000000;
      const remoteSpecVersion = 1902;
      const fee = ethers.utils.parseEther("1.0");

      // deploy wCRAB contract
      const wTokenContract = await ethers.getContractFactory("WToken");
      const wCrab = await wTokenContract.deploy("Wrapped Crab Token", "wCRAB", 18);
      await wCrab.deployed();

      const [owner] = await ethers.getSigners();
      await wCrab.deposit({ value: 10000 });

      // deploy message handle 
      // backing -> mtf message nonce
      const backingStartNonce = 100;
      // mtf -> backing message nonce
      const mtfStartNonce = 200;
      const messageHandleContract = await ethers.getContractFactory("MockSub2SubMessageEndpoint");
      const backingMessageHandle = await messageHandleContract.deploy(backingStartNonce, mtfStartNonce);
      await backingMessageHandle.deployed();
      const mtfMessageHandle = await messageHandleContract.deploy(mtfStartNonce, 100);
      await mtfMessageHandle.deployed();
      await backingMessageHandle.setRemoteHelix(mtfMessageHandle.address);
      await mtfMessageHandle.setRemoteHelix(backingMessageHandle.address);
      console.log("finish deploy & config endpoint");

      // deploy backing
      const backingContract = await ethers.getContractFactory("Erc20Sub2SubBacking");
      const backing = await backingContract.deploy();
      await backing.deployed();
      await backing.initialize(backingMessageHandle.address);
      //await backing.setMessageHandle(backingMessageHandle.address);
      await backing.setChainName("crab smart chain");
      await backingMessageHandle.grantRole(backingMessageHandle.CALLER_ROLE(), backing.address);
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);
      await backing.setWToken(wCrab.address);
      console.log("finish deploy & config backing");

      // deploy mapping token factory
      const mtfContract = await ethers.getContractFactory("Erc20Sub2SubMappingTokenFactory");
      const mtf = await mtfContract.deploy();
      await mtf.deployed();
      await mtf.initialize(mtfMessageHandle.address);
      //await mtf.setMessageHandle(mtfMessageHandle.address);
      await mtfMessageHandle.grantRole(mtfMessageHandle.CALLER_ROLE(), mtf.address);
      console.log("finish deploy & config mtf");

      await backing.setRemoteMappingTokenFactory(mtf.address);
      await mtf.setRemoteBacking(backing.address);

      // register
      // backing: nonce += 1
      await backing.register(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          wCrab.address,
          await wCrab.name(),
          await wCrab.symbol(),
          await wCrab.decimals(),
          10000,
          { value: fee }
      );

      expect(await mtf.tokenLength()).to.equal(1);
      const mappingWktonAddress = await mtf.allMappingTokens(0);
      await mtf.setMappingNativeWrappedToken(mappingWktonAddress);
      var mappedToken = await ethers.getContractAt("Erc20", mappingWktonAddress);
      console.log("finish register token");
      // lock and remote issue
      // 1. failed on source chain
      const receiver = owner.address;
      await expect(backing.lockAndRemoteIssuing(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        wCrab.address,
        receiver,
        1000,
        { value: fee }
      )).to.be.revertedWith("Transaction reverted without a reason string");
      console.log("test lock revert finished");
      // 2. success
      // must approve first
      await wCrab.approve(backing.address, 100000);
      // change daily limit
      // backing: nonce += 2
      await backing.lockAndRemoteIssuing(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        wCrab.address,
        receiver,
        1000,
        { value: fee }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      console.log("test lock success finished");
      // 3. test failed and unlock failed, update daily limit
      // 3.1 unlock the successed remote message should be failed
      await expect(mtf.remoteUnlockFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 2,
          wCrab.address,
          owner.address,
          1000,
          { value: fee }
      )).to.be.revertedWith("MTF:success message can't refund for failed");
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000);
      console.log("test lock refund failed finished");
      // 3.2 unlock the failed remote message should be success
      await mtf.changeDailyLimit(mappingWktonAddress, 0);
      // backing: nonce += 2
      await backing.lockAndRemoteIssuing(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        wCrab.address,
        receiver,
        1000,
        { value: fee }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 2000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      console.log("test lock success finished");
      
      // mtf: nonce += 0
      await mtf.remoteUnlockFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 3,
          wCrab.address,
          owner.address,
          1000,
          { value: ethers.utils.parseEther("1.2") }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000);
      // retry failed
      // mtf: nonce += 1
      await mtf.remoteUnlockFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 3,
          wCrab.address,
          owner.address,
          1000,
          { value: fee }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000);

      // burn and unlock
      // 1. success
      await mappedToken.approve(mtf.address, 100000);
      // mtf: nonce += 2
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // 2. unlock when failed
      // 2.1 can't unlock when success
      await expect(backing.remoteIssuingFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mtfStartNonce + 3,
          mappedToken.address,
          owner.address,
          100,
          { value: fee }
      )).to.be.revertedWith("Backing:success message can't refund for failed");
      // 2.2 can unlock when failed
      await backing.changeDailyLimit(wCrab.address, 0);
      // mtf: nonce += 3
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );
      backing.remoteIssuingFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mtfStartNonce + 4,
          mappedToken.address,
          owner.address,
          100,
          { value: fee }
      )
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);
      // retry failed
      backing.remoteIssuingFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mtfStartNonce + 4,
          mappedToken.address,
          owner.address,
          100,
          { value: fee }
      )
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // mtf: nonce += 5
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );

      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 200);

      // test update laneId
      // 1. old message can be used to proof failed unlock
      await backingMessageHandle.setInboundLane("0xffffffff");
      await backingMessageHandle.setOutboundLane("0xffffffff");
      await mtfMessageHandle.setInboundLane("0xffffffff");
      await mtfMessageHandle.setOutboundLane("0xffffffff");
      await backing.remoteIssuingFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mtfStartNonce + 5,
          mappedToken.address,
          owner.address,
          100,
          { value: fee }
      )
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // 2. new message can be proved by new transferId
      // mtf: nonce == 1
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 200);
      await backing.remoteIssuingFailure(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          "0xFFFFFFFF0000000000000001",
          mappedToken.address,
          owner.address,
          100,
          { value: fee }
      )
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // 3. new message can be accepted
      await backing.changeDailyLimit(wCrab.address, 1000);
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 200);
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 200);

      // collision test
      // new laneId nonce = 3
      // the old laneId receive a message(nonce=3) successed
      await mtf.burnAndRemoteUnlock(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          mappingWktonAddress,
          owner.address,
          100,
          { value: fee }
      );
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 300);
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 300);

      console.log("start to test native token");

      // restore laneId
      await backingMessageHandle.setInboundLane("0x00000000");
      await backingMessageHandle.setOutboundLane("0x00000000");
      await mtfMessageHandle.setInboundLane("0x00000000");
      await mtfMessageHandle.setOutboundLane("0x00000000");
      // test native token lock
      await mtf.changeDailyLimit(mappingWktonAddress, 10000);
      await backing.changeDailyLimit(wCrab.address, 10000);
      await expect(backing.lockAndRemoteIssuingNative(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        receiver,
        1000,
        { value: fee }
      )).to.be.revertedWith("Backing:the fee is not enough");

      await backing.lockAndRemoteIssuingNative(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        receiver,
        1000,
        { value: ethers.utils.parseEther("1.1") }
      );
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 300);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000 - 300 + 1000);
      console.log("finish test lock native token");
      // test native token burn
      const newReceiver = "0x85E566c75207095b117e91e4890e016Af05dc048";
      await mtf.burnAndRemoteUnlockNative(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          newReceiver,
          123,
          { value: fee }
      );
      expect(await ethers.provider.getBalance(newReceiver)).to.equal(123);
      expect(await wCrab.balanceOf(owner.address)).to.equal(10000 - 1000 + 300);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 300 + 1000 - 123);
      console.log("finish test burn native token");
      // test native token lock failed
      await mtf.changeDailyLimit(mappingWktonAddress, 0);
      
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const transaction01 = await backing.lockAndRemoteIssuingNative(
        remoteSpecVersion,
        remoteReceiveGasLimit,
        receiver,
        1000,
        { value: ethers.utils.parseEther("1.1") }
      );
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000 - 300 + 1000 - 123);

      const balance01 = await ethers.provider.getBalance(owner.address);
      let receipt01 = await transaction01.wait();
      let gasFee01 = receipt01.cumulativeGasUsed.mul(receipt01.effectiveGasPrice);
      expect(balance01.add(gasFee01).add(1000).add(fee)).to.equal(balanceBefore);
      // lock refund
      const transaction02 = await mtf.remoteUnlockFailureNative(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 7,
          owner.address,
          1000,
          { value: fee }
      );
      const balance02 = await ethers.provider.getBalance(owner.address);
      let receipt02 = await transaction02.wait();
      let gasFee02 = receipt02.cumulativeGasUsed.mul(receipt02.effectiveGasPrice);
      expect(balance01.sub(balance02).sub(fee).add(1000)).to.equal(gasFee02);
      console.log("finish test refund native token");
      // refund failed(duplicate)
      const transaction03 = await mtf.remoteUnlockFailureNative(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 7,
          owner.address,
          1000,
          { value: fee }
      );
      const balance03 = await ethers.provider.getBalance(owner.address);
      let receipt03 = await transaction03.wait();
      let gasFee03 = receipt03.cumulativeGasUsed.mul(receipt03.effectiveGasPrice);
      expect(balance02.sub(balance03).sub(fee)).to.equal(gasFee03);
      // invalid nonce
      await expect(mtf.remoteUnlockFailureNative(
          remoteSpecVersion,
          remoteReceiveGasLimit,
          backingStartNonce + 8,
          owner.address,
          1000,
          { value: fee }
      )).to.be.revertedWith("MTF:the message is not checked by message layer");
      console.log("finish test s2s mapping token");
  });

  it("test_s2s_migration", async function () {
      const erc20Contract = await ethers.getContractFactory("Erc20");
      const deprecatedToken = await erc20Contract.deploy("Darwinia xRing Deprecated Token", "xRing", 9);
      await deprecatedToken.deployed();

      const migrationToken = await erc20Contract.deploy("Darwinia xRing Deprecated Token", "xRing", 18);
      await migrationToken.deployed();

      const migrationContract = await ethers.getContractFactory("Erc20Sub2SubMigration");
      const migration = await migrationContract.deploy(deprecatedToken.address, migrationToken.address);
      await migration.deployed();

      const [owner] = await ethers.getSigners();
      await deprecatedToken.mint(owner.address, 1000e9);
      expect(await deprecatedToken.balanceOf(owner.address)).to.equal(1000e9);
      await migrationToken.mint(migration.address, ethers.utils.parseEther("10000"));
      expect(await migrationToken.balanceOf(migration.address)).to.equal(ethers.utils.parseEther("10000"));

      await deprecatedToken.approve(migration.address, 1000e9);
      await migration.migrateAll();
      expect(await deprecatedToken.balanceOf(owner.address)).to.equal(0);
      expect(await deprecatedToken.balanceOf(migration.address)).to.equal(1000e9);
      expect(await migrationToken.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("1000"));
      expect(await migrationToken.balanceOf(migration.address)).to.equal(ethers.utils.parseEther("9000"));

      const migrationToLowDecimals = await migrationContract.deploy(migrationToken.address, deprecatedToken.address);
      await migrationToLowDecimals.deployed();
      await migrationToken.approve(migrationToLowDecimals.address, ethers.utils.parseEther("10000"));
      await deprecatedToken.mint(migrationToLowDecimals.address, 10000e9);
      await migrationToLowDecimals.migrateAll();
      expect(await migrationToken.balanceOf(owner.address)).to.equal(0);
      expect(await deprecatedToken.balanceOf(owner.address)).to.equal(1000e9);
      expect(await migrationToken.balanceOf(migrationToLowDecimals.address)).to.equal(ethers.utils.parseEther("1000"));
      expect(await deprecatedToken.balanceOf(migrationToLowDecimals.address)).to.equal(9000e9);
  });
});

