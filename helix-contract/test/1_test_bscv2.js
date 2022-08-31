const { expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const chai = require("chai");
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

chai.use(solidity);

describe("darwinia<>bsc mapping token tests", () => {
  before(async () => {
  });

  it("test_bsc_flow", async function () {
      // lane
      // darwinia chain position 1
      // bsc chain position      2
      // darwinia inboundLanePosition  1 <-----> 1 outboundLanePosition bsc
      // darwinia outboundLanePosition 2 <-----> 2 inboundLanePosition  bsc
      // from darwinia to bsc
      
      /*******      deploy inboundLane/outboundLane     ********/
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
      /******* deploy inboundLane/outboundLane finished ********/

      // deploy fee market
      const feeMarketContract = await ethers.getContractFactory("MockFeeMarket");
      const feeMarket = await feeMarketContract.deploy();
      await feeMarket.deployed();
      /****** deploy fee market *****/

      // deploy darwiniaMessageEndpoint
      const messageEndpointContract = await ethers.getContractFactory("DarwiniaSub2EthMessageEndpoint");
      const darwiniaMessageEndpoint = await messageEndpointContract.deploy(
          darwiniaInboundLane.address,
          darwiniaOutboundLane.address,
          feeMarket.address);
      await darwiniaMessageEndpoint.deployed();
      const bscMessageEndpoint = await messageEndpointContract.deploy(
          bscInboundLane.address,
          bscOutboundLane.address,
          feeMarket.address
      );
      await bscMessageEndpoint.deployed();
      /******* deploy darwiniaMessageEndpoint ******/
      // configure darwiniaMessageEndpoint
      await darwiniaMessageEndpoint.setRemoteEndpoint(bscMessageEndpoint.address);
      await bscMessageEndpoint.setRemoteEndpoint(darwiniaMessageEndpoint.address);
      // end configure

      /******* deploy mapping token factory at bsc *******/
      // deploy mapping token factory
      const mapping_token_factory = await ethers.getContractFactory("Erc20Sub2EthMappingTokenFactory");
      const mtf = await mapping_token_factory.deploy();
      await mtf.deployed();
      console.log("mapping-token-factory address", mtf.address);
      // init owner
      await mtf.initialize(bscMessageEndpoint.address);
      /******* deploy mapping token factory  end *******/

      /******* deploy backing at darwinia ********/
      backingContract = await ethers.getContractFactory("Erc20Sub2EthBacking");
      const backing = await backingContract.deploy();
      await backing.deployed();
      console.log("backing address", backing.address);
      // init owner
      await backing.initialize(darwiniaMessageEndpoint.address);
      /******* deploy backing end ***************/

      const [owner] = await ethers.getSigners();
      //********** configure mapping-token-factory ***********
      await bscMessageEndpoint.grantRole(bscMessageEndpoint.CALLER_ROLE(), mtf.address);
      await bscMessageEndpoint.grantRole(bscMessageEndpoint.CALLEREE_ROLE(), mtf.address);
      await mtf.setRemoteBacking(backing.address);
      await mtf.grantRole(mtf.OPERATOR_ROLE(), owner.address);
      //************ configure mapping-token end *************

      //********* configure backing **************************
      await backing.setRemoteMappingTokenFactory(mtf.address);
      await backing.grantRole(backing.OPERATOR_ROLE(), owner.address);
      await darwiniaMessageEndpoint.grantRole(darwiniaMessageEndpoint.CALLER_ROLE(), backing.address);
      await darwiniaMessageEndpoint.grantRole(darwiniaMessageEndpoint.CALLEREE_ROLE(), backing.address);
      //********* configure backing end   ********************
      console.log("configure backing finished");

      // use a mapping erc20 as original token
      const tokenName = "Darwinia Wrapped Ring";
      const tokenSymbol = "WRING";
      const originalContract = await ethers.getContractFactory("MappingERC20");
      const originalToken = await originalContract.deploy();
      await originalToken.deployed();
      await originalToken.initialize(tokenName, tokenSymbol, 18);

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      // test register successed
      await mtf.register(originalToken.address, "Darwinia Smart", tokenName, tokenSymbol, 18, 1000);
      expect(await mtf.tokenLength()).to.equal(1);
      const mappingTokenAddress = await mtf.allMappingTokens(0);
      
      // test lock
      await originalToken.mint(owner.address, 1000);
      await originalToken.approve(backing.address, 1000);
      
      // test lock successful
      await mtf.changeDailyLimit(mappingTokenAddress, 1000);

      await expect(backing.lockAndRemoteIssuing(
          originalToken.address,
          owner.address,
          100,
          {value: ethers.utils.parseEther("9.999999999")}
      )).to.be.revertedWith("backing:the fee is not enough");
      // balance before
      await backing.lockAndRemoteIssuing(originalToken.address, owner.address, 100, {value: ethers.utils.parseEther("10.0")});
      // check lock and remote successed
      expect(await originalToken.balanceOf(backing.address)).to.equal(100);
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 100);
      // check issuing successed
      var mappedToken = await ethers.getContractAt("MappingERC20", mappingTokenAddress);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100);

      // test lock failed
      await mtf.changeDailyLimit(mappingTokenAddress, 0);
      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await backing.lockAndRemoteIssuing(originalToken.address, owner.address, 100, {value: ethers.utils.parseEther("50.0")});
      const balanceAfter = await ethers.provider.getBalance(owner.address);
      // the fee would be refund, balance is fee = 10 + err
      expect(balanceBefore - balanceAfter > ethers.utils.parseEther("10.0")).to.equal(true);
      expect(balanceBefore - balanceAfter < ethers.utils.parseEther("10.1")).to.equal(true);
      expect(await originalToken.balanceOf(backing.address)).to.equal(200);
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 200);
      // success message cannot be refunded
      await expect(mtf.remoteUnlockFailure(
          1,
          originalToken.address,
          owner.address,
          100,
          {value: ethers.utils.parseEther("50.0")}
      )).to.be.revertedWith("MappingTokenFactory:success message can't refund for failed");
      await expect(mtf.remoteUnlockFailure(
          3,
          originalToken.address,
          owner.address,
          100,
          {value: ethers.utils.parseEther("50.0")}
      )).to.be.revertedWith("MappingTokenFactory:the message is not checked by message layer");
      // invalid amount
      await mtf.remoteUnlockFailure(2, originalToken.address, owner.address, 10, {value: ethers.utils.parseEther("50.0")});
      expect(await originalToken.balanceOf(backing.address)).to.equal(200);
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 200);
      // success
      await mtf.remoteUnlockFailure(2, originalToken.address, owner.address, 100, {value: ethers.utils.parseEther("50.0")});
      expect(await originalToken.balanceOf(backing.address)).to.equal(100);
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 100);
      // duplicate refund
      await mtf.remoteUnlockFailure(2, originalToken.address, owner.address, 100, {value: ethers.utils.parseEther("50.0")});
      expect(await originalToken.balanceOf(backing.address)).to.equal(100);
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 100);

      // test burn and unlock
      //approve to mapping-token-factory
      await mappedToken.approve(mtf.address, 1000);
      await backing.changeDailyLimit(originalToken.address, 1000);
      await mtf.burnAndRemoteUnlock(mappingTokenAddress, owner.address, 21, {value: ethers.utils.parseEther("10.0")});
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 100 + 21);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100 - 21);
      expect(await mappedToken.balanceOf(mtf.address)).to.equal(0);

      // test burn and unlock failed(daily limited)
      await backing.changeDailyLimit(originalToken.address, 0);
      const tx = await mtf.burnAndRemoteUnlock(
          mappingTokenAddress,
          owner.address,
          7,
          {
              value: ethers.utils.parseEther("10.0"),
              gasPrice: 20000000000
          }
      );
      expect(await originalToken.balanceOf(owner.address)).to.equal(1000 - 100 + 21);
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100 - 21 - 7);
      expect(await mappedToken.balanceOf(mtf.address)).to.equal(0);
      // refund
      await expect(backing.remoteIssuingFailure(
          4,
          mappingTokenAddress,
          owner.address,
          7,
          {value: ethers.utils.parseEther("10.0")}
      )).to.be.revertedWith("Backing:success message can't refund for failed");
      await expect(backing.remoteIssuingFailure(
          6,
          mappingTokenAddress,
          owner.address,
          7,
          {value: ethers.utils.parseEther("10.0")}
      )).to.be.revertedWith("Backing:the message is not checked by message layer");
      // invalid amount
      await backing.remoteIssuingFailure(5, mappingTokenAddress, owner.address, 6, {value: ethers.utils.parseEther("10.0")});
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100 - 21 - 7);
      await backing.remoteIssuingFailure(5, mappingTokenAddress, owner.address, 7, {value: ethers.utils.parseEther("10.0")});
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100 - 21);
      // duplicate refund
      await backing.remoteIssuingFailure(5, mappingTokenAddress, owner.address, 7, {value: ethers.utils.parseEther("10.0")});
      expect(await mappedToken.balanceOf(owner.address)).to.equal(100 - 21);

      expect(await mappedToken.name()).to.equal(tokenName + "[Darwinia Smart>");
      expect(await mappedToken.symbol()).to.equal("x" + tokenSymbol);
  });
  it("test_bsc_guard", async function () {
      const tokenName = "Darwinia Native Ring";
      const tokenSymbol = "RING";
      const originalContract = await ethers.getContractFactory("MappingERC20");
      const originalToken = await originalContract.deploy();
      await originalToken.deployed();
      await originalToken.initialize(tokenName, tokenSymbol, 9);
      const [owner] = await ethers.getSigners();
      await originalToken.mint(owner.address, 1000);

      // test guard
      let wallets = [];
      for (let i = 0; i < 3; i++) {
          const wallet = ethers.Wallet.createRandom();
          wallets.push(wallet);
      }
      wallets = wallets.sort((x, y) => {
          return x.address.toLowerCase().localeCompare(y.address.toLowerCase())
      });
      const guardContract = await ethers.getContractFactory("Guard");
      const guard = await guardContract.deploy([wallets[0].address, wallets[1].address, wallets[2].address], 3, 60, owner.address);
      await guard.deployed();

      await originalToken.approve(guard.address, 1000);
      await guard.deposit(1, originalToken.address, wallets[1].address, 100);
      await guard.deposit(2, originalToken.address, wallets[2].address, 200);

      // encode value
      const structHash =
          ethUtil.keccak256(
              abi.rawEncode(
                  ['bytes4', 'bytes', 'uint256'],
                  [abi.methodID('claim', [ 'uint256[]', 'bytes[]' ]),
                  abi.rawEncode(['uint256[]'], [[1, 2]]),
                  0]
              )
          );
      // cannot claim without signatures
      await expect(guard.claimByTimeout(2)).to.be.revertedWith("Guard: claim at invalid time");

      const dataHash = await guard.encodeDataHash(structHash);
      console.log("data hash", dataHash);
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
      await guard.claim([1, 2], signatures);
      expect(await originalToken.balanceOf(wallets[1].address)).to.equal(100);
      expect(await originalToken.balanceOf(wallets[2].address)).to.equal(200);
  });
});

