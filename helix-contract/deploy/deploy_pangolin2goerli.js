var ProxyDeployer = require("./proxy.js");

const backingFeeMarket = "0x4DBdC9767F03dd078B5a1FC05053Dd0C071Cc005";
const backingOutboundLane = "0xAbd165DE531d26c229F9E43747a8d683eAD54C6c";
const backingInboundLane = "0xB59a893f5115c1Ca737E36365302550074C32023";

const mtfFeeMarket = "0x6c73B30a48Bb633DC353ed406384F73dcACcA5C3";
const mtfOutboundLane = "0x9B5010d562dDF969fbb85bC72222919B699b5F54";
const mtfInboundLane = "0x0F6e081B1054c59559Cf162e82503F3f560cA4AF";

async function deployMessageEndpoint(wallet, inboundLane, ouboundLane, feeMarket, existedAddress) {
    return await deployContract(wallet, "DarwiniaSub2EthMessageEndpoint", existedAddress, 2, inboundLane, ouboundLane, feeMarket, {gasLimit: 2000000});
}

async function deployContract(wallet, name, existedAddress, ...params) {
    if (existedAddress) {
        return await ethers.getContractAt(name, existedAddress, wallet);
    }
    const contract = await ethers.getContractFactory(name, wallet);
    const contractDeployed = await contract.deploy(...params);
    await contractDeployed.deployed();
    return contractDeployed;
}

async function deployProxy(wallet, name, existedAddress, adminAddress, logicFactory, logicAddress, args) {
    if (existedAddress) {
        return await ethers.getContractAt(name, existedAddress, wallet);
    }
    const proxyContract = await ProxyDeployer.deployProxyContract(
        adminAddress,
        logicFactory,
        logicAddress,
        args,
        wallet);
    return await ethers.getContractAt(name, proxyContract.address, wallet);
}

async function lockAndRemoteIssue(tokenAddress, backingAddress, amount, wallet, fee) {
    const originToken = await ethers.getContractAt("WToken", tokenAddress, wallet);
    await originToken.deposit({value: amount});
    await originToken.approve(backingAddress, amount);
    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, wallet);
    //const tx = await backing.callStatic.lockAndRemoteIssuing(
    const tx = await backing.lockAndRemoteIssuing(
        tokenAddress,
        wallet.address,
        amount,
        {
            value: ethers.utils.parseEther(fee),
            gasLimit: 200000,
        });
}

async function lockAndRemoteIssueNative(backingAddress, amount, wallet, fee) {
    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, wallet);
    const tx = await backing.lockAndRemoteIssuingNative(
        wallet.address,
        amount,
        {
            value: ethers.utils.parseEther(fee).add(amount),
            gasLimit: 200000,
        });
}

async function burnAndRemoteUnlock(mappingTokenAddress, mtfAddress, amount, mtfWallet, fee) {
    const mappingToken = await ethers.getContractAt("Erc20", mappingTokenAddress, mtfWallet);
    await mappingToken.approve(mtfAddress, amount);
    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.burnAndRemoteUnlock(
        mappingTokenAddress,
        mtfWallet.address,
        amount,
        { value: ethers.utils.parseEther(fee) });
}

async function burnAndRemoteUnlockNative(mappingTokenAddress, mtfAddress, amount, mtfWallet, fee) {
    const mappingToken = await ethers.getContractAt("Erc20", mappingTokenAddress, mtfWallet);
    await mappingToken.approve(mtfAddress, amount);
    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.burnAndRemoteUnlockNative(
        mtfWallet.address,
        amount,
        { value: ethers.utils.parseEther(fee) });
}

async function remoteUnlockFailure(transferId, originAddress, mtfAddress, amount, mtfWallet, fee) {
    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.remoteUnlockFailure(
        transferId,
        originAddress,
        mtfWallet.address,
        amount,
        { value: ethers.utils.parseEther(fee) });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet() {
    const privateKey = process.env.PRIKEY
    //const backingUrl = "https://pangoro-rpc.darwinia.network";
    const backingUrl = "https://pangolin-rpc.darwinia.network";
    //const backingUrl = "g2.pangoro-p2p.darwinia.network:9933";
    //const mtfUrl = "https://eth-goerli.g.alchemy.com/v2/WerPq7On62-wy_ARssv291ZPg1TGR5vi";
    const mtfUrl = "https://rpc.ankr.com/eth_goerli";
    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);
    const mtfProvider = new ethers.providers.JsonRpcProvider(mtfUrl);
    const mtfWallet = new ethers.Wallet(privateKey, mtfProvider);
    return [backingWallet, mtfWallet];
}

async function deploy(backingWallet, mtfWallet) {
    // deploy
    console.log("start to deploy");
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet, backingInboundLane, backingOutboundLane, backingFeeMarket, null);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    const mtfMessageEndpoint = await deployMessageEndpoint(mtfWallet, mtfInboundLane, mtfOutboundLane, mtfFeeMarket, null);
    console.log("deploy mtf message handle finished, address: ", mtfMessageEndpoint.address);

    // configure message handle
    await backingMessageEndpoint.setRemoteEndpoint(mtfMessageEndpoint.address);
    await mtfMessageEndpoint.setRemoteEndpoint(backingMessageEndpoint.address);
    console.log("finish configure message handle");

    const backingContractLogic = await ethers.getContractFactory("Erc20Sub2EthBacking", backingWallet);
    const backingLogic = await backingContractLogic.deploy();
    await backingLogic.deployed();
    console.log("finish to deploy backing logic, address: ", backingLogic.address);

    const backingAdmin = await ProxyDeployer.deployProxyAdmin(backingWallet);
    console.log("finish to deploy backing admin, address: ", backingAdmin.address);
    const backingProxy = await ProxyDeployer.deployProxyContract(
        backingAdmin.address,
        backingContractLogic,
        backingLogic.address,
        [backingMessageEndpoint.address],
        backingWallet);
    console.log("finish to deploy backing proxy, address: ", backingProxy.address);

    const mtfContractLogic = await ethers.getContractFactory("Erc20Sub2EthMappingTokenFactory", mtfWallet);
    const mtfLogic = await mtfContractLogic.deploy();
    await mtfLogic.deployed();
    console.log("finish to deploy mapping token factory logic, address: ", mtfLogic.address);

    const mtfAdmin = await ProxyDeployer.deployProxyAdmin(mtfWallet);
    console.log("finish to deploy mapping token factory admin, address: ", mtfAdmin.address);
    const mtfProxy = await ProxyDeployer.deployProxyContract(
        mtfAdmin.address,
        mtfContractLogic,
        mtfLogic.address,
        [mtfMessageEndpoint.address],
        mtfWallet);
    console.log("finish to deploy mapping token factory proxy, address: ", mtfProxy.address);

    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingProxy.address, backingWallet);
    await backing.setRemoteMappingTokenFactory(mtfProxy.address);
    console.log("finish to configure backing");

    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfProxy.address, mtfWallet);
    await mtf.setRemoteBacking(backingProxy.address);
    console.log("finish to configure mapping token factory");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLER_ROLE(), mtf.address);
    console.log("grant role 01");
    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLEE_ROLE(), backing.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLEE_ROLE(), mtf.address);
    console.log("grant role 02");
    await backing.grantRole(await backing.OPERATOR_ROLE(), backingWallet.address);
    await mtf.grantRole(await mtf.OPERATOR_ROLE(), mtfWallet.address);
    console.log("grant role permission finished");

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const wethContract = await ethers.getContractFactory("WToken", backingWallet);
    const weth = await wethContract.deploy("Darwinia Native Wrapped Token", "WORING", 18);
    await weth.deployed();
    console.log("wring address is ", weth.address);

    // we need replace this exist ring address on ethereum
    const ringErc20 = await ethers.getContractFactory("Erc20", mtfWallet);
    const ring = await ringErc20.deploy("Goerli Native ORING", "ORING", 18);
    await ring.deployed();
    console.log("ring address is ", ring.address);
    await ring.transferOwnership(mtf.address);

    // register
    const dailyLimit = ethers.utils.parseEther("3000000");
    await backing.changeDailyLimit(weth.address, dailyLimit);
    await backing.setNativeWrappedToken(weth.address);
    //const tx = await backing.callStatic.register(
    //const tx = await mtf.register(
        //weth.address,
        //"Darwinia Smart",
        //"Wrapped Ring",
        //"WRING",
        //18,
        //dailyLimit
    //);
    const tx = await mtf.setMappingToken(
        weth.address,
        ring.address,
        dailyLimit
    );
    console.log("transaction is ", tx);
    await mtf.setMappingNativeWrappedToken(ring.address);

    // deploy guard
    const guardContract = await ethers.getContractFactory("Guard", mtfWallet);
    const guard = await guardContract.deploy(["0x2cC60930C14FE8bD6fEd1602B75339B2b7CDc515"], 1, 600, mtf.address);
    await guard.deployed();
    await mtf.updateGuard(guard.address);
    return {
        pangoro2goerli_sub2eth_goerli: {
            messageEndpoint: mtfMessageEndpoint.address,
            mappingTokenFactoryLogic: mtfLogic.address,
            mappingTokenFactoryAdmin: mtfAdmin.address,
            mappingTokenFactoryProxy: mtf.address,
            ring: ring.address,
            guard: guard.address
        },
        pangoro2goerli_sub2eth_pangoro: {
            messageEndpoint: backingMessageEndpoint.address,
            backingLogic: backingLogic.address,
            backingAdmin: backingAdmin.address,
            backingProxy: backing.address,
            WRING: weth.address,
        },
    }
}

async function redeployGuard(mtfWallet, mtf) {
    const guardContract = await ethers.getContractFactory("Guard", mtfWallet);
    const guard = await guardContract.deploy([mtfWallet.address], 1, 600, mtf.address);
    await guard.deployed();
    await mtf.updateGuard(guard.address);
}

async function deployWithExistContract(backingWallet, mtfWallet) {
    const wringAddress = "0x69e392E057B5994da2b0E9661039970Ac4c26b8c";
    const ringErc20 = "0x69e392E057B5994da2b0E9661039970Ac4c26b8c";

    // deploy
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet, backingInboundLane, backingOutboundLane, backingFeeMarket, null);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    // MTF 01
    const mtfMessageEndpoint = await deployMessageEndpoint(mtfWallet, mtfInboundLane, mtfOutboundLane, mtfFeeMarket, null);
    console.log("deploy mtf message handle finished, address: ", mtfMessageEndpoint.address);

    // configure message handle
    await backingMessageEndpoint.setRemoteEndpoint(mtfMessageEndpoint.address);
    console.log("backing set remote endpoint finished");
    // MTF 02
    await mtfMessageEndpoint.setRemoteEndpoint(backingMessageEndpoint.address);
    console.log("mtf set remote endpoint finished");

    const backingLogicFactory = await ethers.getContractFactory("Erc20Sub2EthBacking", wallet);
    const backingLogic = await deployContract(backingWallet, "Erc20Sub2EthBacking", null);
    console.log("finish to deploy backing logic, address: ", backingLogic.address);

    const backingAdmin = await deployContract(backingWallet, "ProxyAdmin", null);
    console.log("finish to deploy backing admin, address: ", backingAdmin.address);
    const backing = await deployProxy(
        backingWallet,
        "Erc20Sub2EthBacking",
        null,
        backingAdmin.address,
        backingLogicFactory,
        backingLogic.address,
        [backingMessageEndpoint.address]
    )
    console.log("finish to deploy backing proxy, address: ", backing.address);

    // MTF 03
    const mtfContractLogic = await ethers.getContractFactory("Erc20Sub2EthMappingTokenFactory", mtfWallet);
    const mtfLogic = await deployContract(mtfWallet, "Erc20Sub2EthMappingTokenFactory", null);
    console.log("finish to deploy mapping token factory logic, address: ", mtfLogic.address);

    // MTF 04
    const mtfAdmin = await deployContract(mtfWallet, "ProxyAdmin", null);
    console.log("finish to deploy mapping token factory admin, address: ", mtfAdmin.address);
    // MTF 05
    const mtf = await deployProxy(
        mtfWallet,
        "Erc20Sub2EthMappingTokenFactory",
        null,
        mtfAdmin.address,
        mtfContractLogic,
        mtfLogic.address,
        [mtfMessageEndpoint.address]);
    console.log("finish to deploy mapping token factory proxy, address: ", mtf.address);

    await backing.setRemoteMappingTokenFactory(mtf.address);
    console.log("finish to configure backing");

    // MTF 06
    await mtf.setRemoteBacking(backing.address);
    console.log("finish to configure mapping token factory");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    console.log("backing endpoint grant backing caller finished");
    // MTF 07
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLER_ROLE(), mtf.address);
    console.log("mtf endpoint grant mtf finished");
    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLEE_ROLE(), backing.address);
    console.log("backing endpoint grant backing callee finished");
    // MTF 08
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLEE_ROLE(), mtf.address);
    console.log("mtf endpoint grant mtf callee finished");
    await backing.grantRole(await backing.OPERATOR_ROLE(), backingWallet.address);
    console.log("backing grant operator finished");
    // MTF 09
    await mtf.grantRole(await mtf.OPERATOR_ROLE(), mtfWallet.address);
    console.log("mtf grant operator finished");

    // register
    const dailyLimit = ethers.utils.parseEther("3000000");
    await backing.changeDailyLimit(wringAddress, dailyLimit);
    await backing.setNativeWrappedToken(wringAddress);
    // MTF 10
    const tx = await mtf.setMappingToken(
        wringAddress,
        ringErc20,
        dailyLimit
    );
    console.log("transaction is ", tx);
    // MTF 11
    await mtf.setMappingNativeWrappedToken(ringErc20);

    // deploy guard
    // MTF 12
    const guard = await deployContract(mtfWallet, "Guard", null, [mtfWallet.address], 1, 600, mtf.address);
    // MTF 13
    await mtf.updateGuard(guard.address);
    return {
        pangoro2goerli_sub2eth_goerli: {
            messageEndpoint: mtfMessageEndpoint.address,
            mappingTokenFactoryLogic: mtfLogic.address,
            mappingTokenFactoryAdmin: mtfAdmin.address,
            mappingTokenFactoryProxy: mtf.address,
            ring: ringErc20,
            guard: guard.address
        },
        pangoro2goerli_sub2eth_pangoro: {
            messageEndpoint: backingMessageEndpoint.address,
            backingLogic: backingLogic.address,
            backingAdmin: backingAdmin.address,
            backingProxy: backing.address,
            WRING: wringAddress
        },
    }
}


// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const backingWallet = wallets[0];
    const mtfWallet = wallets[1];

    //const deployed = await deploy(backingWallet, mtfWallet);
    ////const deployed = await deployWithExistContract(backingWallet, mtfWallet);
    //console.log(deployed);
    //const backingInfo = deployed.pangoro2goerli_sub2eth_pangoro;
    //const mtfInfo = deployed.pangoro2goerli_sub2eth_goerli;
    //await lockAndRemoteIssue(backingInfo.WRING, backingInfo.backingProxy, ethers.utils.parseEther("1.1"), backingWallet, "30");
    //await lockAndRemoteIssueNative(backingInfo.backingProxy, ethers.utils.parseEther("1.2"), backingWallet, "30");
    
    //const wethAddress = "0x46f01081e800BF47e43e7bAa6D98d45F6a0251E4";
    //const mtfAddress = "0xfcAcf3d08275031e5Bd453Cf2509301290858984";
    //const backingAddress = "0xaafFbF487e9dA8429E2E9502d0907e5fD6b0C320";
    //const ringAddress = "0x046D07d53926318d1F06c2c2A0F26a4de83E26c4";
    //const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    //const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, backingWallet);

    //const oldmtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", "0x38d8af6834bc10856a161977534d0bca7419eacd", mtfWallet);
    //await oldmtf.transferMappingTokenOwnership("0x69e392E057B5994da2b0E9661039970Ac4c26b8c", mtfAddress);

    
    //const dailyLimit = ethers.utils.parseEther("200");
    //await mtf.changeDailyLimit(ringAddress, dailyLimit);
    //await backing.changeDailyLimit(wethAddress, dailyLimit);

    //console.log(await mtf.calcMaxWithdraw(ringAddress));
    //await lockAndRemoteIssue(wethAddress, backingAddress, ethers.utils.parseEther("1.7"), backingWallet, "100");
    //await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("300"), backingWallet, "100");
    //await burnAndRemoteUnlock(ringAddress, mtfAddress, ethers.utils.parseEther("0.11"), mtfWallet, "0.01");
    //await burnAndRemoteUnlockNative(ringAddress, mtfAddress, ethers.utils.parseEther("0.12"), mtfWallet, "0.01");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    

/*
 *{
  pangoro2goerli_sub2eth_goerli: {
    messageEndpoint: '0xA4A380B592ceC969bD43BA54F8833d88b8b24811',
    mappingTokenFactoryLogic: '0x0446bc7C1F034E6f502c21c7222632cC8Ddf74d4',
    mappingTokenFactoryAdmin: '0xF206aC3dbbc9ee2cddd07718Fa1785BEd4D0b375',
    mappingTokenFactoryProxy: '0x2a5fE3Cd11c6eEf7e3CeA26553e2694f0B0A9f9e',
    ring: '0xeb93165E3CDb354c977A182AbF4fad3238E04319',
    guard: '0x8C986EC362A38cA4A6a3fd4188C5318c689A187d'
  },
  pangoro2goerli_sub2eth_pangoro: {
    messageEndpoint: '0x83B4e8287693Ef159D2231C5ACa485D5d2AdEb38',
    backingLogic: '0x492bAda46302BdC30950018f7d8fDE53701e6AFF',
    backingAdmin: '0xd12917F42E09e216623010EB5f15c39d4978d322',
    backingProxy: '0xeAb1F01a8f4A2687023B159c2063639Adad5304E',
    WRING: '0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4'
  }
  wring address is  0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4
  ring address is  0xeb93165E3CDb354c977A182AbF4fad3238E04319
}*/
