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

describe("darwinia<>eth lp bridge tests", () => {
  before(async () => {
  });

  it("test_lp_flow", async function () {
      // deploy inboundLane
      const inboundLaneContract = await ethers.getContractFactory("MockInboundLane");
      const darwiniaInboundLane = await inboundLaneContract.deploy(1, 1, 2, 1);
      await darwiniaInboundLane.deployed();
      const ethInboundLane = await inboundLaneContract.deploy(2, 2, 1, 2);
      await ethInboundLane.deployed();
      console.log("deploy mock inboundLane success");
      // deploy outboundLane
      const outboundLaneContract = await ethers.getContractFactory("MockOutboundLane");
      const darwiniaOutboundLane = await outboundLaneContract.deploy(1, 2, 2, 2, ethInboundLane.address);
      await darwiniaOutboundLane.deployed();
      const ethOutboundLane = await outboundLaneContract.deploy(2, 1, 1, 1, darwiniaInboundLane.address);
      await ethOutboundLane.deployed();
      console.log("deploy mock outboundLane success");
      //******* deploy inboundLane/outboundLane finished ********

      // deploy fee market
      const feeMarketContract = await ethers.getContractFactory("MockFeeMarket");
      const feeMarket = await feeMarketContract.deploy();
      await feeMarket.deployed();
      //****** deploy fee market *****

      // deploy darwiniaMessageEndpoint
      const messageEndpointContract = await ethers.getContractFactory("DarwiniaSub2EthMessageEndpoint");
      const darwiniaMessageEndpoint = await messageEndpointContract.deploy(
          darwiniaInboundLane.address,
          darwiniaOutboundLane.address,
          feeMarket.address);
      await darwiniaMessageEndpoint.deployed();
      const ethMessageEndpoint = await messageEndpointContract.deploy(
          ethInboundLane.address,
          ethOutboundLane.address,
          feeMarket.address
      );
      await ethMessageEndpoint.deployed();
      //******* deploy darwiniaMessageEndpoint ******
      // configure darwiniaMessageEndpoint
      await darwiniaMessageEndpoint.setRemoteEndpoint(ethMessageEndpoint.address);
      await ethMessageEndpoint.setRemoteEndpoint(darwiniaMessageEndpoint.address);
      // end configure

      const [owner, relayer, other] = await ethers.getSigners();
      const dao = owner.address;
      const feeReceiver = "0x1000000000000000000000000000000000000001";
      //******* deploy lp bridge at ethereum *******
      const lp_sub2eth_bridge = await ethers.getContractFactory("LpSub2EthBridge");
      const bridge_on_eth = await lp_sub2eth_bridge.deploy();
      await bridge_on_eth.deployed();
      console.log("lp bridge on ethereum address", bridge_on_eth.address);
      // init
      await bridge_on_eth.initialize(ethMessageEndpoint.address, darwiniaMessageEndpoint.address, dao);
      await bridge_on_eth.updateFeeReceiver(feeReceiver);
      //******* deploy lp bridge at ethereum  end *******

      //******* deploy lp bridge at darwinia ********
      const bridge_on_darwinia = await lp_sub2eth_bridge.deploy();
      await bridge_on_darwinia.deployed();
      console.log("lp briddge on darwinia address", bridge_on_darwinia.address);
      // init owner
      await bridge_on_darwinia.initialize(darwiniaMessageEndpoint.address, ethMessageEndpoint.address, dao);
      await bridge_on_darwinia.updateFeeReceiver(feeReceiver);
      //******* deploy lp bridge at end ***************
      //
      await bridge_on_eth.setRemoteBridge(bridge_on_darwinia.address);
      await bridge_on_darwinia.setRemoteBridge(bridge_on_eth.address);

      //********** configure endpoint role ***********
      await ethMessageEndpoint.grantRole(ethMessageEndpoint.CALLER_ROLE(), bridge_on_eth.address);
      await ethMessageEndpoint.grantRole(ethMessageEndpoint.CALLEE_ROLE(), bridge_on_eth.address);
      await darwiniaMessageEndpoint.grantRole(darwiniaMessageEndpoint.CALLER_ROLE(), bridge_on_darwinia.address);
      await darwiniaMessageEndpoint.grantRole(darwiniaMessageEndpoint.CALLEE_ROLE(), bridge_on_darwinia.address);
      //********* configure endpoint end   ********************
      console.log("configure endpoint finished");

      // use a mapping erc20 as original token
      const tokenName = "Darwinia Wrapped Ring";
      const tokenSymbol = "WRING";
      const originalContract = await ethers.getContractFactory("WToken");
      const originalToken = await originalContract.deploy(tokenName, tokenSymbol, 18);
      await originalToken.deployed();

      const tokenNameOnEthereum = "Darwinia Ring";
      const tokenSymbolOnEthereum = "RING";
      const ethContract = await ethers.getContractFactory("Erc20");
      const ethToken = await ethContract.deploy(tokenNameOnEthereum, tokenSymbolOnEthereum, 18);
      await ethToken.deployed();
      // set it as wToken
      await bridge_on_darwinia.registerToken(
          originalToken.address,
          ethToken.address,
          // helix fee
          123,
          // remote chain id
          31337,
          18, // local decimals
          18, // remote decimals
          false
      );
      await bridge_on_darwinia.setwTokenIndex(0);
      await bridge_on_eth.registerToken(
          ethToken.address,
          originalToken.address,
          // helix fee
          321,
          // remote chain id
          31337,
          18, // local decimals
          18, // remote decimals
          true
      );

      const zeroAddress = "0x0000000000000000000000000000000000000000";

      await originalToken.deposit({value: 10000});
      await originalToken.approve(bridge_on_darwinia.address, 10000);
      
      // lock erc20 token
      let transaction = await bridge_on_darwinia.lockAndRemoteIssuing(
          1, //nonce
          other.address, // receiver
          2000, // amount
          300, // fee
          0, // tokenIndex
          false // issuingNative
      )

      let receipt = await transaction.wait();
      let gasUsed = receipt.cumulativeGasUsed;
      console.log("lockAndRemoteIssuing gas used", gasUsed);

      await ethToken.mint(relayer.address, 1000000);
      await ethToken.connect(relayer).approve(bridge_on_eth.address, 1000000);
      await bridge_on_eth.connect(relayer).relay(
          1, // nonce
          ethToken.address,
          owner.address,
          other.address,
          2000, // amount
          31337, // source chain id
          false, // issuingNative
      );
      expect(await ethToken.balanceOf(relayer.address)).to.equal(1000000 - 2000);
      expect(await ethToken.balanceOf(other.address)).to.equal(2000);
      expect(await originalToken.balanceOf(owner.address)).to.equal(10000 - 2000 - 300);
      expect(await originalToken.balanceOf(bridge_on_darwinia.address)).to.equal(2300);

      // lock native token
      transaciton = await bridge_on_darwinia.lockNativeAndRemoteIssuing(
          3000, // amount
          300, // fee
          other.address, // receiver
          2,
          false, // issuingNative
          {value: 3300}
      );

      receipt = await transaction.wait();
      gasUsed = receipt.cumulativeGasUsed;
      console.log("lockNativeAndRemoteIssuing gas used", gasUsed);
      transaction = await bridge_on_eth.connect(relayer).relay(
          2, // nonce
          ethToken.address,
          owner.address,
          other.address,
          3000, // amount
          31337, // source chain id
          false, // issuingNative
      );
      receipt = await transaction.wait();
      gasUsed = receipt.cumulativeGasUsed;
      console.log("relay erc20 gas used", gasUsed);
      expect(await ethToken.balanceOf(relayer.address)).to.equal(1000000 - 2000 - 3000);
      expect(await ethToken.balanceOf(other.address)).to.equal(2000 + 3000);
      expect(await originalToken.balanceOf(owner.address)).to.equal(10000 - 2000 - 300);
      expect(await originalToken.balanceOf(bridge_on_darwinia.address)).to.equal(2300 + 3300);

      // withdraw
      const liquidityReceiver = "0x1000000000000000000000000000000000000002";
      await bridge_on_eth.connect(relayer).requestWithdrawLiquidity(
          [
              "0x06d3f7676480a6aecdf65e1f2e43fcb5affc7dc957209b6fbd1cf00bb5f007b1",
              "0x15a27461434e2ca653f4aef916da467b8864cbd58d8e616341825f97562b4049",
          ],
          false,
          liquidityReceiver,
          {value: ethers.utils.parseEther("10.0")},
      );
      expect(await originalToken.balanceOf(feeReceiver)).to.equal(123 * 2);
      expect(await originalToken.balanceOf(liquidityReceiver)).to.equal(2000+3000+300*2-123*2);
      expect(await originalToken.balanceOf(bridge_on_darwinia.address)).to.equal(0);

      // issuing native token
      const nativeReceiver = "0x1000000000000000000000000000000000000003";
      await ethToken.connect(other).approve(bridge_on_eth.address, 1000000);
      await bridge_on_eth.connect(other).lockAndRemoteIssuing(
          1, // nonce
          nativeReceiver, // receiver
          20, // amount
          400, // fee
          0, // tokenIndex
          true, // issuingNative
      );

      transaction = await bridge_on_eth.connect(other).lockAndRemoteIssuing(
          2, // nonce
          nativeReceiver, // receiver
          100, // amount
          400, // fee
          0, // tokenIndex
          false, // issuingNative
      );
      receipt = await transaction.wait();
      gasUsed = receipt.cumulativeGasUsed;
      console.log("lockAndRemoteIssuing gas used", gasUsed);
      expect(await ethToken.balanceOf(other.address)).to.equal(2000 + 3000 - 420 - 500);

      // relay first
      //await originalToken.connect(relayer).approve(bridge_on_darwinia.address, 1000000);
      transaction = await bridge_on_darwinia.connect(relayer).relay(
          1, // nonce
          originalToken.address,
          other.address,
          nativeReceiver,
          100, // amount
          31337, // source chain id
          true, // issuingNative
          {value: 100},
      );
      expect(await ethers.provider.getBalance(nativeReceiver)).to.equal(100);

      receipt = await transaction.wait();
      gasUsed = receipt.cumulativeGasUsed;
      console.log("relay native gas used", gasUsed);

      // second cancel
      await bridge_on_darwinia.connect(other).requestCancelIssuing(
          2, // nonce
          false, //issuingNative
          originalToken.address,
          other.address,
          nativeReceiver,
          100,
          31337, // source chain id
          false, // withdrawNative
          { value: ethers.utils.parseEther("10.0")},
      )
      expect(await ethers.provider.getBalance(nativeReceiver)).to.equal(100);
      //fee is 400/2 = 200
      expect(await ethToken.balanceOf(other.address)).to.equal(2000 + 3000 - 420 - 500 + 500 - 200);
  });
});

