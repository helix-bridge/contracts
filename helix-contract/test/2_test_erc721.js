const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

chai.use(solidity);

describe("darwinia<>bsc erc721 mapping token tests", () => {
  before(async () => {
  });

  it("test_supporting_confirm_flow", async function () {
      // lane
      // darwinia chain position 1
      // bsc chain position      2
      // darwinia inboundLanePosition  1 <-----> 1 outboundLanePosition bsc
      // darwinia outboundLanePosition 2 <-----> 2 inboundLanePosition  bsc
      // from darwinia to bsc
      
      //*******      deploy inboundLane/outboundLane     ********
      // deploy inboundLane
      const inboundLaneContract = await ethers.getContractFactory("MockInboundLane");
      const darwiniaInboundLane = await inboundLaneContract.deploy(1, 1, 2, 1);
      await darwiniaInboundLane.deployed();
      const bscInboundLane = await inboundLaneContract.deploy(2, 2, 1, 2);
      await bscInboundLane.deployed();
      console.log("deploy mock inboundLane success");
      // deploy outboundLane
      const outboundLaneContract = await ethers.getContractFactory("MockOutboundLane");
      const darwiniaOutboundLane = await outboundLaneContract.deploy(1, 2, 2, 2, bscInboundLane.address);
      await darwiniaOutboundLane.deployed();
      const bscOutboundLane = await outboundLaneContract.deploy(2, 1, 1, 1, darwiniaInboundLane.address);
      await bscOutboundLane.deployed();
      console.log("deploy mock outboundLane success");
      //******* deploy inboundLane/outboundLane finished ********

      // deploy fee market
      const feeMarketContract = await ethers.getContractFactory("MockFeeMarket");
      const feeMarket = await feeMarketContract.deploy();
      await feeMarket.deployed();
      //****** deploy fee market *****

      // deploy darwiniaMessageEndpoint
      const messageEndpointContract = await ethers.getContractFactory("DarwiniaMessageEndpoint");
      const darwiniaMessageEndpoint = await messageEndpointContract.deploy();
      await darwiniaMessageEndpoint.deployed();
      const bscMessageEndpoint = await messageEndpointContract.deploy();
      await bscMessageEndpoint.deployed();
      //******* deploy darwiniaMessageEndpoint ******
      // configure darwiniaMessageEndpoint
      await darwiniaMessageEndpoint.setBridgeInfo(2, bscMessageEndpoint.address);
      await darwiniaMessageEndpoint.setFeeMarket(feeMarket.address);
      await darwiniaMessageEndpoint.setInboundLane(darwiniaInboundLane.address);
      await darwiniaMessageEndpoint.setOutboundLane(darwiniaOutboundLane.address);
      await bscMessageEndpoint.setBridgeInfo(1, darwiniaMessageEndpoint.address);
      await bscMessageEndpoint.setFeeMarket(feeMarket.address);
      await bscMessageEndpoint.setInboundLane(bscInboundLane.address);
      await bscMessageEndpoint.setOutboundLane(bscOutboundLane.address);
      // end configure

      // deploy erc721 serializer, local and remote
      const monkeyAttrContract = await ethers.getContractFactory("Erc721MonkeyAttributeSerializer");
      const monkeyAttrContractOnBsc = await monkeyAttrContract.deploy();
      await monkeyAttrContractOnBsc.deployed();
      const monkeyAttrContractOnDarwinia = await monkeyAttrContract.deploy();
      await monkeyAttrContractOnDarwinia.deployed();
      console.log("deploy erc721 attribute serializer success");
      //******* deploy mapping token factory at bsc *******
      // deploy mapping token factory
      const mapping_token_factory = await ethers.getContractFactory("Erc721MappingTokenFactorySupportingConfirm");
      const mtf = await mapping_token_factory.deploy();
      await mtf.deployed();
      console.log("mapping-token-factory address", mtf.address);
      // init owner
      await mtf.initialize(bscMessageEndpoint.address);
      //******* deploy mapping token factory  end *******

      //******* deploy backing at darwinia ********
      backingContract = await ethers.getContractFactory("Erc721BackingSupportingConfirm");
      const backing = await backingContract.deploy();
      await backing.deployed();
      console.log("backing address", backing.address);
      // init owner
      await backing.initialize(darwiniaMessageEndpoint.address);
      //******* deploy backing end ***************

      //********** configure mapping-token-factory ***********
      await mtf.setRemoteBacking(backing.address);
      await bscMessageEndpoint.grantRole(bscMessageEndpoint.CALLER_ROLE(), mtf.address);
      //************ configure mapping-token end *************

      //********* configure backing **************************
      await backing.setRemoteMappingTokenFactory(mtf.address);
      const [owner] = await ethers.getSigners();
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);
      await darwiniaMessageEndpoint.grantRole(darwiniaMessageEndpoint.CALLER_ROLE(), backing.address);
      //********* configure backing end   ********************

      // this contract can be any erc721 contract. We use MappingToken as an example
      const originalContract = await ethers.getContractFactory("Erc721MappingToken");
      const originalToken = await originalContract.deploy(monkeyAttrContractOnBsc.address);
      await originalToken.deployed();
      await monkeyAttrContractOnDarwinia.setAttr(1001, 18, 60);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // test register not enough fee
      await expect(backing.registerErc721Token(
          originalToken.address,
          monkeyAttrContractOnDarwinia.address,
          monkeyAttrContractOnBsc.address,
          {value: ethers.utils.parseEther("9.9999999999")}
      )).to.be.revertedWith("DarwiniaMessageEndpoint:not enough fee to pay");
      // test register successed
      await backing.registerErc721Token(
          originalToken.address,
          monkeyAttrContractOnDarwinia.address,
          monkeyAttrContractOnBsc.address,
          {value: ethers.utils.parseEther("10.0")});
      // check not exist
      expect((await backing.registeredTokens(originalToken.address)).token).to.equal(zeroAddress);
      // confirmed
      await darwiniaOutboundLane.mock_confirm(1);
      // check register successed
      expect((await backing.registeredTokens(originalToken.address)).token).to.equal(originalToken.address);
      expect(await mtf.tokenLength()).to.equal(1);
      const mappingTokenAddress = await mtf.allMappingTokens(0);
      
      // check unregistered
      expect((await backing.registeredTokens(zeroAddress)).token).to.equal(zeroAddress);
      expect(await mtf.tokenLength()).to.equal(1);

      // test lock
      await originalToken.mint(owner.address, 1001);
      await originalToken.approve(backing.address, 1001);
      
      var mappedToken = await ethers.getContractAt("Erc721MappingToken", mappingTokenAddress);
      // test lock successful
      await expect(backing.lockAndRemoteIssuing(
          originalToken.address,
          owner.address,
          [1001],
          {value: ethers.utils.parseEther("9.999999999")}
      )).to.be.revertedWith("not enough fee to pay");
      // balance before
      expect(await originalToken.ownerOf(1001)).to.equal(owner.address);
      expect(await mappedToken.totalSupply()).to.equal(0);
      await backing.lockAndRemoteIssuing(originalToken.address, owner.address, [1001], {value: ethers.utils.parseEther("10.0")});
      await darwiniaOutboundLane.mock_confirm(2);
      // check lock and remote successed
      expect(await originalToken.ownerOf(1001)).to.equal(backing.address);
      expect(await mappedToken.totalSupply()).to.equal(1);
      expect(await mappedToken.tokenOfOwnerByIndex(owner.address, 0)).to.equal(1001);
      expect(await mappedToken.tokenByIndex(0)).to.equal(1001);
      // check issuing successed
      expect(await mappedToken.ownerOf(1001)).to.equal(owner.address);
      expect(await monkeyAttrContractOnBsc.getAge(1001)).to.equal(18);
      expect(await monkeyAttrContractOnBsc.getWeight(1001)).to.equal(60);

      // update attr
      await monkeyAttrContractOnBsc.setAttr(1001, 19, 70);

      // test burn and unlock
      await originalToken.transferOwnership(backing.address);
      //approve to mapping-token-factory
      await mappedToken.approve(mtf.address, 1001);
      expect(await mappedToken.ownerOf(1001)).to.equal(owner.address);
      await mtf.burnAndRemoteUnlockWaitingConfirm(mappingTokenAddress, owner.address, [1001], {value: ethers.utils.parseEther("10.0")});
      // before confirmed
      expect(await mappedToken.ownerOf(1001)).to.equal(mtf.address);
      // after confirmed
      await bscOutboundLane.mock_confirm(1);
      expect(await mappedToken.totalSupply()).to.equal(0);
      expect(await originalToken.ownerOf(1001)).to.equal(owner.address);
      expect(await monkeyAttrContractOnDarwinia.getAge(1001)).to.equal(19);
      expect(await monkeyAttrContractOnDarwinia.getWeight(1001)).to.equal(70);
  });

  it("test_unsupporting_confirm_flow", async function () {
      const ethMsgBusContract = await ethers.getContractFactory("MockcBridgeMsgBus");
      const ethMsgBus = await ethMsgBusContract.deploy();
      await ethMsgBus.deployed();
      const bscMsgBusContract = await ethers.getContractFactory("MockcBridgeMsgBus");
      const bscMsgBus = await bscMsgBusContract.deploy();
      await bscMsgBus.deployed();
      await ethMsgBus.setRemoteMsgBus(bscMsgBus.address);
      await bscMsgBus.setRemoteMsgBus(ethMsgBus.address);
      await ethMsgBus.setRemoteChainId(97);
      await bscMsgBus.setRemoteChainId(5);

      // deploy cBridgeMessageEndpoint
      const messageEndpointContract = await ethers.getContractFactory("cBridgeMessageEndpoint");
      const ethMessageEndpoint = await messageEndpointContract.deploy();
      await ethMessageEndpoint.deployed();
      const bscMessageEndpoint = await messageEndpointContract.deploy();
      await bscMessageEndpoint.deployed();
      /******* deploy darwiniaMessageEndpoint ******/

      // configure cBridgeMessageEndpoint
      await ethMessageEndpoint.setMessageBus(ethMsgBus.address);
      await ethMsgBus.setReceiver(ethMessageEndpoint.address);
      await bscMessageEndpoint.setMessageBus(bscMsgBus.address);
      await bscMsgBus.setReceiver(bscMessageEndpoint.address);
      await ethMessageEndpoint.setBridgeInfo(5, bscMessageEndpoint.address);
      await bscMessageEndpoint.setBridgeInfo(97, ethMessageEndpoint.address);
      // end configure

      // deploy erc721 serializer, local and remote
      const monkeyAttrContract = await ethers.getContractFactory("Erc721MonkeyAttributeSerializer");
      const monkeyAttrContractOnBsc = await monkeyAttrContract.deploy();
      await monkeyAttrContractOnBsc.deployed();
      const monkeyAttrContractOnDarwinia = await monkeyAttrContract.deploy();
      await monkeyAttrContractOnDarwinia.deployed();
      console.log("deploy erc721 attribute serializer success");
      /******* deploy mapping token factory at bsc *******/
      // deploy mapping token factory
      const mapping_token_factory = await ethers.getContractFactory("Erc721MappingTokenFactoryUnsupportingConfirm");
      const mtf = await mapping_token_factory.deploy();
      await mtf.deployed();
      console.log("mapping-token-factory address", mtf.address);
      // init owner
      await mtf.initialize(bscMessageEndpoint.address);
      /******* deploy mapping token factory  end *******/

      /******* deploy backing at darwinia ********/
      backingContract = await ethers.getContractFactory("Erc721BackingUnsupportingConfirm");
      const backing = await backingContract.deploy();
      await backing.deployed();
      console.log("backing address", backing.address);
      // init owner
      await backing.initialize(ethMessageEndpoint.address);
      /******* deploy backing end ***************/

      //********** configure mapping-token-factory ***********
      await mtf.setRemoteBacking(backing.address);
      await bscMessageEndpoint.grantRole(bscMessageEndpoint.CALLER_ROLE(), mtf.address);
      //************ configure mapping-token end *************

      //********* configure backing **************************
      await backing.setRemoteMappingTokenFactory(mtf.address);
      const [owner] = await ethers.getSigners();
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);
      await ethMessageEndpoint.grantRole(ethMessageEndpoint.CALLER_ROLE(), backing.address);
      //********* configure backing end   ********************

      // this contract can be any erc721 contract. We use MappingToken as an example
      const originalContract = await ethers.getContractFactory("Erc721MappingToken");
      const originalToken = await originalContract.deploy(monkeyAttrContractOnBsc.address);
      await originalToken.deployed();
      await monkeyAttrContractOnDarwinia.setAttr(1001, 18, 60);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // test register successed
      await backing.registerErc721Token(
          originalToken.address,
          monkeyAttrContractOnDarwinia.address,
          monkeyAttrContractOnBsc.address,
          {value: ethers.utils.parseEther("10.0")});
      // check register successed
      expect((await backing.registeredTokens(originalToken.address)).token).to.equal(originalToken.address);
      expect(await mtf.tokenLength()).to.equal(1);
      const mappingTokenAddress = await mtf.allMappingTokens(0);
      
      // check unregistered
      expect((await backing.registeredTokens(zeroAddress)).token).to.equal(zeroAddress);
      expect(await mtf.tokenLength()).to.equal(1);

      // test lock
      await originalToken.mint(owner.address, 1001);
      await originalToken.approve(backing.address, 1001);
      
      var mappedToken = await ethers.getContractAt("Erc721MappingToken", mappingTokenAddress);
      // balance before
      expect(await originalToken.ownerOf(1001)).to.equal(owner.address);
      expect(await mappedToken.totalSupply()).to.equal(0);
      await backing.lockAndRemoteIssuing(originalToken.address, owner.address, [1001], {value: ethers.utils.parseEther("10.0")});
      // check lock and remote successed
      expect(await originalToken.ownerOf(1001)).to.equal(backing.address);
      expect(await mappedToken.totalSupply()).to.equal(1);
      expect(await mappedToken.tokenOfOwnerByIndex(owner.address, 0)).to.equal(1001);
      expect(await mappedToken.tokenByIndex(0)).to.equal(1001);
      // check issuing successed
      expect(await mappedToken.ownerOf(1001)).to.equal(owner.address);
      expect(await monkeyAttrContractOnBsc.getAge(1001)).to.equal(18);
      expect(await monkeyAttrContractOnBsc.getWeight(1001)).to.equal(60);

      // update attr
      await monkeyAttrContractOnBsc.setAttr(1001, 19, 70);

      // test burn and unlock
      await originalToken.transferOwnership(backing.address);
      //approve to mapping-token-factory
      await mappedToken.approve(mtf.address, 1001);
      expect(await mappedToken.ownerOf(1001)).to.equal(owner.address);
      await mtf.burnAndRemoteUnlock(mappingTokenAddress, owner.address, [1001], {value: ethers.utils.parseEther("10.0")});
      expect(await mappedToken.totalSupply()).to.equal(0);
      expect(await originalToken.ownerOf(1001)).to.equal(owner.address);
      expect(await monkeyAttrContractOnDarwinia.getAge(1001)).to.equal(19);
      expect(await monkeyAttrContractOnDarwinia.getWeight(1001)).to.equal(70);
  });
});

