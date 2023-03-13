const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");

chai.use(solidity);

describe("smart<>para mapping token tests", () => {
  before(async () => {
  });

  it("test_para_with_sdk_native", async function () {
      const remoteWeight = 1000000000;
      const remoteSpecVersion = 1902;

      const [owner] = await ethers.getSigners();

      // deploy message handle 
      const outboundStartNonce = 100;
      const inboundStartNonce = 10;
      const endpointContract = await ethers.getContractFactory("MockDarwinia2ParaMessageEndpoint");
      const endpoint = await endpointContract.deploy(outboundStartNonce, inboundStartNonce);
      await endpoint.deployed();

      // deploy backing
      const backingContract = await ethers.getContractFactory("NativeParachainBacking");
      const backing = await backingContract.deploy();
      await backing.deployed();
      await backing.initialize(endpoint.address);
      await backing.setPrunSize(3);
      await backing.setAcceptNonceAllowSize(3);
      await endpoint.setBacking(backing.address);

      // 1. failed on source chain
      const receiver = "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";
      await expect(backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          100,
          { value: 149 }
      )).to.be.revertedWith("Backing:the fee is not enough");

      await backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          100,
          { value: 150 }
      );
      await backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          200,
          { value: 251 }
      );
      expect((await backing.lockedMessages(outboundStartNonce + 1)).amount).to.equal(100);
      expect((await backing.lockedMessages(outboundStartNonce + 2)).amount).to.equal(200);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(300);

      // receive
      const fragment = backingContract.interface.getFunction("unlockFromRemote");
      const calldata = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 10, [outboundStartNonce + 1], 0]);
      await endpoint.recvMessage(calldata);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(290);
      expect((await backing.lockedMessages(outboundStartNonce + 1)).amount).to.equal(0);
      expect((await backing.lockedMessages(outboundStartNonce + 2)).amount).to.equal(200);
      expect(await backing.minReservedLockedMessageNonce()).to.equal(outboundStartNonce + 2);
      expect(await backing.acceptNonceSize()).to.equal(1);
      expect(await backing.acceptNonceAt(0)).to.equal(inboundStartNonce + 1);
      const calldata2 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 10, [outboundStartNonce + 2], inboundStartNonce + 2]);
      await endpoint.recvMessage(calldata2);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(280);
      expect((await backing.lockedMessages(outboundStartNonce + 1)).amount).to.equal(0);
      expect((await backing.lockedMessages(outboundStartNonce + 2)).amount).to.equal(0);
      expect(await backing.minReservedLockedMessageNonce()).to.equal(outboundStartNonce + 3);
      expect(await backing.acceptNonceSize()).to.equal(1);
      expect(await backing.acceptNonceAt(0)).to.equal(inboundStartNonce + 2);

      const calldata3 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 2], inboundStartNonce + 2]);
      await endpoint.recvMessage(calldata3);
      const calldata4 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 2], inboundStartNonce + 2]);
      await endpoint.recvMessage(calldata4);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(278);
      expect(await backing.acceptNonceSize()).to.equal(3);
      expect(await backing.acceptNonceAt(0)).to.equal(inboundStartNonce + 2);
      expect(await backing.acceptNonceAt(1)).to.equal(inboundStartNonce + 3);
      expect(await backing.acceptNonceAt(2)).to.equal(inboundStartNonce + 4);
      const calldata5 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 2], inboundStartNonce + 4]);
      await endpoint.recvMessage(calldata5);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(277);
      expect(await backing.acceptNonceSize()).to.equal(2);
      expect(await backing.acceptNonceAt(0)).to.equal(inboundStartNonce + 4);
      expect(await backing.acceptNonceAt(1)).to.equal(inboundStartNonce + 5);
      const calldata6 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 2], inboundStartNonce + 4]);
      await endpoint.recvMessage(calldata6);
      const calldata7 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 2], inboundStartNonce + 5]);
      await endpoint.recvMessage(calldata7);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(275);
      expect(await backing.acceptNonceSize()).to.equal(3);
      expect(await backing.acceptNonceAt(0)).to.equal(inboundStartNonce + 5);
      expect(await backing.acceptNonceAt(1)).to.equal(inboundStartNonce + 6);
      expect(await backing.acceptNonceAt(2)).to.equal(inboundStartNonce + 7);
      
      // refund local
      await backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          200,
          { value: 251 }
      );
      await backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          200,
          { value: 251 }
      );
      await backing.lockAndRemoteIssuing(
          remoteSpecVersion,
          remoteWeight,
          receiver,
          200,
          { value: 251 }
      );
      expect((await backing.lockedMessages(outboundStartNonce + 1)).amount).to.equal(0);
      expect((await backing.lockedMessages(outboundStartNonce + 2)).amount).to.equal(0);
      expect((await backing.lockedMessages(outboundStartNonce + 3)).amount).to.equal(200);
      expect((await backing.lockedMessages(outboundStartNonce + 4)).amount).to.equal(200);
      expect((await backing.lockedMessages(outboundStartNonce + 5)).amount).to.equal(200);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(875);
      const calldata8 = backingContract.interface.encodeFunctionData(
          fragment,
          [owner.address, 1, [outboundStartNonce + 4], inboundStartNonce + 6]);
      await endpoint.recvMessage(calldata8);
      expect(await backing.acceptNonceSize()).to.equal(3);
      expect((await backing.lockedMessages(outboundStartNonce + 4)).amount).to.equal(0);
      expect(await ethers.provider.getBalance(backing.address)).to.equal(874);
      // has been pruned
      await expect(backing.handleUnlockFailureLocal(
          outboundStartNonce + 4
      )).to.be.revertedWith("Backing: the locked message has been refund");
      // not delivered
      await expect(backing.handleUnlockFailureLocal(
          outboundStartNonce + 5
      )).to.be.revertedWith("Backing: the failure nonce invalid");
      // success
      await backing.handleUnlockFailureLocal(outboundStartNonce + 3);
  });
});

