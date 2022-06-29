const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");

chai.use(solidity);

describe("sub<>sub mapping token tests", () => {
  before(async () => {
  });

  it("test_s2s_with_sdk_erc20", async function () {
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
      const backingContract = await ethers.getContractFactory("Erc20BackingSupportUnlockFailed");
      const backing = await backingContract.deploy();
      await backing.deployed();
      await backing.initialize(backingMessageHandle.address);
      await backing.initStorage();
      //await backing.setMessageHandle(backingMessageHandle.address);
      await backing.setChainName("pangolin smart");
      await backingMessageHandle.grantRole(backingMessageHandle.CALLER_ROLE(), backing.address);
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);

      // deploy mapping token factory
      const mtfContract = await ethers.getContractFactory("Erc20MappingTokenFactorySupportUnlockFailed");
      const mtf = await mtfContract.deploy();
      await mtf.deployed();
      await mtf.initialize(mtfMessageHandle.address);
      await mtf.initStorage();
      //await mtf.setMessageHandle(mtfMessageHandle.address);
      await mtf.setTokenContractLogic(1, mappingToken.address);
      await mtf.setTokenContractLogic(2, mappingToken.address);
      await mtfMessageHandle.grantRole(mtfMessageHandle.CALLER_ROLE(), mtf.address);

      await backing.setRemoteMappingTokenFactory(mtf.address);
      await mtf.setRemoteBacking(backing.address);

      // register
      // backing: nonce += 0
      await backing.register(
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
        wkton.address,
        receiver,
        1000)).to.be.revertedWith("ERC20: transfer amount exceeds allowance");
      // 2. success
      // must approve first
      await wkton.approve(backing.address, 100000);
      // change daily limit
      await mtf.changeDailyLimit(mappingWktonAddress, 10000);
      // backing: nonce += 1
      await backing.lockAndRemoteIssuing(
        wkton.address,
        receiver,
        1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      // 3. test failed and unlock failed, update daily limit
      // 3.1 unlock the successed remote message should be failed
      let proof = [];
      for (let i = 0; i < 64; i++) {
          proof.push(await backing.zero_hashes(i));
      }
      await expect(mtf.handleFailedRemoteOperation(
          backingStartNonce + 1,
          wkton.address,
          owner.address,
          1000,
          proof,
          0)).to.be.revertedWith("MappingTokenFactory:the message is already success");
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      // 3.2 unlock the failed remote message should be success
      await mtf.changeDailyLimit(mappingWktonAddress, 0);
      // backing: nonce += 2
      await backing.lockAndRemoteIssuing(
        wkton.address,
        receiver,
        1000);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 2000);
      expect(await mappedToken.balanceOf(receiver)).to.equal(1000);
      
      let proof_success = [];
      const message = ethers.utils.solidityPack(["address", "address", "uint256"], [wkton.address, owner.address, 1000])
      proof_success.push(await backing.hash(message));
      for (let i = 1; i < 64; i++) {
          proof_success.push(await backing.zero_hashes(i));
      }
      // mtf: nonce += 0
      await mtf.handleFailedRemoteOperation(backingStartNonce + 2, wkton.address, owner.address, 1000, proof_success, 1);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);
      // retry failed
      // mtf: nonce += 1
      await mtf.handleFailedRemoteOperation(backingStartNonce + 2, wkton.address, owner.address, 1000, proof_success, 1);
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000);

      // burn and unlock
      // 1. success
      await backing.changeDailyLimit(wkton.address, 100000);
      await mappedToken.approve(mtf.address, 100000);
      // mtf: nonce += 2
      await mtf.burnAndRemoteUnlock(
          mappingWktonAddress,
          owner.address,
          100
      );
      expect(await wkton.balanceOf(owner.address)).to.equal(10000 - 1000 + 100);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // 2. unlock when failed
      // 2.1 can't unlock when success
      await expect(backing.handleFailedRemoteOperation(
          mtfStartNonce + 2,
          mappedToken.address,
          owner.address,
          100,
          proof,
          0)).to.be.revertedWith("Backing:the message is already success");
      // 2.2 can unlock when failed
      await backing.changeDailyLimit(wkton.address, 0);
      // mtf: nonce += 3
      await mtf.burnAndRemoteUnlock(
          mappingWktonAddress,
          owner.address,
          100
      );
      let burn_proof_success = [];
      const burn_message = ethers.utils.solidityPack(["address", "address", "uint256"], [mappedToken.address, owner.address, 100])
      burn_proof_success.push(await mtf.hash(burn_message));
      for (let i = 1; i < 64; i++) {
          burn_proof_success.push(await mtf.zero_hashes(i));
      }
      backing.handleFailedRemoteOperation(
          mtfStartNonce + 3,
          mappedToken.address,
          owner.address,
          100,
          burn_proof_success,
          1)
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);
      // retry failed
      backing.handleFailedRemoteOperation(
          mtfStartNonce + 3,
          mappedToken.address,
          owner.address,
          100,
          burn_proof_success,
          1)
      expect(await mappedToken.balanceOf(owner.address)).to.equal(1000 - 100);
  });
});

