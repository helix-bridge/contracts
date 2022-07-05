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
      const remoteCallWeight = 800000000;

      // deploy kton contract
      const erc20Contract = await ethers.getContractFactory("MappingERC20");
      const wkton = await erc20Contract.deploy();
      await wkton.deployed();
      await wkton.initialize("Darwinia wkton", "WKTON", 18);

      const mappingToken = await erc20Contract.deploy();
      await mappingToken.deployed();

      const [owner] = await ethers.getSigners();
      wkton.mint(owner.address, 10000);

      // deploy message handle 
      // backing -> mtf message nonce
      const backingStartNonce = 100;
      // mtf -> backing message nonce
      const mtfStartNonce = 200;
      const messageHandleContract = await ethers.getContractFactory("MockSub2SubMessageHandle");
      const backingMessageHandle = await messageHandleContract.deploy(backingStartNonce, mtfStartNonce);
      await backingMessageHandle.deployed();
      const mtfMessageHandle = await messageHandleContract.deploy(200, 100);
      await mtfMessageHandle.deployed();
      await backingMessageHandle.setRemoteHelix(mtfMessageHandle.address);
      await mtfMessageHandle.setRemoteHelix(backingMessageHandle.address);

      // deploy backing
      const backingContract = await ethers.getContractFactory("Erc20Sub2SubBacking");
      const backing = await backingContract.deploy();
      await backing.deployed();
      await backing.initialize(backingMessageHandle.address);
      //await backing.setMessageHandle(backingMessageHandle.address);
      await backing.setChainName("pangolin smart");
      await backingMessageHandle.grantRole(backingMessageHandle.CALLER_ROLE(), backing.address);
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);

      // deploy mapping token factory
      const mtfContract = await ethers.getContractFactory("Erc20Sub2SubMappingTokenFactory");
      const mtf = await mtfContract.deploy();
      await mtf.deployed();
      await mtf.initialize(mtfMessageHandle.address);
      //await mtf.setMessageHandle(mtfMessageHandle.address);
      await mtf.setTokenContractLogic(1, mappingToken.address);
      await mtf.setTokenContractLogic(2, mappingToken.address);
      await mtfMessageHandle.grantRole(mtfMessageHandle.CALLER_ROLE(), mtf.address);

      await backing.setRemoteMappingTokenFactory(mtf.address);
      await mtf.setRemoteBacking(backing.address);

      // register
      // backing: nonce += 1
      await backing.register(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          wkton.address,
          await wkton.name(),
          await wkton.symbol(),
          await wkton.decimals()
      );

      expect(await mtf.tokenLength()).to.equal(1);
      const mappingWktonAddress = await mtf.allMappingTokens(0);
      var mappedToken = await ethers.getContractAt("MappingERC20", mappingWktonAddress);
      // lock and remote issue
      // 1. failed on source chain
      const receiver = owner.address;
      await expect(backing.lockAndRemoteIssuing(
        remoteReceiveGasLimit,
        remoteSpecVersion,
        remoteCallWeight,
        wkton.address,
        receiver,
        1000)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      // 2. success
      // must approve first
      await wkton.approve(backing.address, 100000);
      // change daily limit
      await mtf.changeDailyLimit(mappingWktonAddress, 10000);
      // backing: nonce += 2
      await backing.lockAndRemoteIssuing(
        remoteReceiveGasLimit,
        remoteSpecVersion,
        remoteCallWeight,
        wkton.address,
        receiver,
        1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      // 3. test failed and unlock failed, update daily limit
      // 3.1 unlock the successed remote message should be failed
      await expect(mtf.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          backingStartNonce + 2,
          wkton.address,
          owner.address,
          1000)).to.be.revertedWith("MappingTokenFactory:success message can't refund for failed");
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      // 3.2 unlock the failed remote message should be success
      await mtf.changeDailyLimit(mappingWktonAddress, 0);
      // backing: nonce += 2
      await backing.lockAndRemoteIssuing(
        remoteReceiveGasLimit,
        remoteSpecVersion,
        remoteCallWeight,
        wkton.address,
        receiver,
        1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 2000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      
      // mtf: nonce += 0
      await mtf.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          backingStartNonce + 3,
          wkton.address,
          owner.address,
          1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      // retry failed
      // mtf: nonce += 1
      await mtf.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          backingStartNonce + 3,
          wkton.address,
          owner.address,
          1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);

      // burn and unlock
      // 1. success
      await backing.changeDailyLimit(wkton.address, 100000);
      await mappedToken.approve(mtf.address, 100000);
      // mtf: nonce += 2
      await mtf.burnAndRemoteUnlock(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          mappingWktonAddress,
          owner.address,
          100
      );
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // 2. unlock when failed
      // 2.1 can't unlock when success
      await expect(backing.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          mtfStartNonce + 3,
          mappedToken.address,
          owner.address,
          100)).to.be.revertedWith("Backing:success message can't refund for failed");
      // 2.2 can unlock when failed
      await backing.changeDailyLimit(wkton.address, 0);
      // mtf: nonce += 3
      await mtf.burnAndRemoteUnlock(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          mappingWktonAddress,
          owner.address,
          100
      );
      backing.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          mtfStartNonce + 4,
          mappedToken.address,
          owner.address,
          100)
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);
      // retry failed
      backing.handleFailedRemoteOperation(
          remoteReceiveGasLimit,
          remoteSpecVersion,
          remoteCallWeight,
          mtfStartNonce + 4,
          mappedToken.address,
          owner.address,
          100)
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);
  });
});

