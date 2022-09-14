var ProxyDeployer = require("./proxy.js");

async function deployMessageEndpoint(wallet, inboundLane, ouboundLane, feeMarket) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2EthMessageEndpoint", wallet);
    const handle = await handleContract.deploy(inboundLane, ouboundLane, feeMarket, {gasLimit: 2000000});
    await handle.deployed();
    return handle
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
        { value: ethers.utils.parseEther(fee) });
    console.log("tx is", tx);
}

async function lockAndRemoteIssueNative(backingAddress, amount, wallet, fee) {
    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, wallet);
    const tx = await backing.lockAndRemoteIssuingNative(
        wallet.address,
        amount,
        { value: ethers.utils.parseEther(fee).add(amount) });
    console.log("tx is", tx);
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
    const privateKey = '0x...';
    const backingUrl = "https://pangoro-rpc.darwinia.network";
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
    const backingFeeMarket = "0x6eDcF984eF28C29aa48242B92685244bcD6D7203";
    const backingOutboundLane = "0x654FE7E51eCA910800Df4E1fA8F2CD8Fb1aFEc4A";
    const backingInboundLane = "0x20c3b4a6Cb3319d14ffB0C2d4C7b035f16C4B7D3";

    const mtfFeeMarket = "0x380244554a9C51f0CCaFec90A2766B0C8b698a4a";
    const mtfOutboundLane = "0xc4D1b94BF5a277da43d0D0762Ce52Fd0b81039df";
    const mtfInboundLane = "0xFD89b82eCd642C2b171a6619A851B5f0500aab86";
    // deploy
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet, backingInboundLane, backingOutboundLane, backingFeeMarket);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    const mtfMessageEndpoint = await deployMessageEndpoint(mtfWallet, mtfInboundLane, mtfOutboundLane, mtfFeeMarket);
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
    const weth = await wethContract.deploy("Darwinia Native Wrapped Token", "WRING", 18);
    await weth.deployed();
    console.log("wring address is ", weth.address);

    // we need replace this exist ring address on ethereum
    const ringErc20 = await ethers.getContractFactory("Erc20", mtfWallet);
    const ring = await ringErc20.deploy("Darwinia Native RING", "RING", 18);
    await ring.deployed();
    console.log("ring address is ", ring.address);
    await ring.transferOwnership(mtf.address);

    // register
    const dailyLimit = ethers.utils.parseEther("3000000");
    await backing.changeDailyLimit(weth.address, dailyLimit);
    await backing.setwToken(weth.address);
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
    await mtf.setxwToken(ring.address);

    // deploy guard
    const guardContract = await ethers.getContractFactory("Guard", mtfWallet);
    const guard = await guardContract.deploy(["0x2cC60930C14FE8bD6fEd1602B75339B2b7CDc515"], 1, 600, mtf.address);
    await guard.deployed();
    await mtf.updateGuard(guard.address);
    return {
        backing,
        mtf,
        guard,
        weth,
        ring,
    }
}

async function redeployGuard(mtfWallet, mtf) {
    const guardContract = await ethers.getContractFactory("Guard", mtfWallet);
    const guard = await guardContract.deploy([mtfWallet.address], 1, 600, mtf.address);
    await guard.deployed();
    await mtf.updateGuard(guard.address);
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const backingWallet = wallets[0];
    const mtfWallet = wallets[1];

    const deployed = await deploy(backingWallet, mtfWallet);
    //await lockAndRemoteIssue(weth.address, backing.address, ethers.utils.parseEther("1.7"), backingWallet, "30");
    await lockAndRemoteIssueNative(deployed.backing.address, ethers.utils.parseEther("1.8"), backingWallet, "30");

    /*
    const wethAddress = "0x587B6F8e3Ee61E656CE3C43755ED5Da79bF658b6";
    const mtfAddress = "0x00E5CEbe07F5D2db8Ee9E1d29e33A7e84514Fb25";
    const backingAddress = "0x6040E2DB820E710F0869520B34D7E4e2A6d10d9D";
    const ringAddress = "0x2EDf6399634C9251B0cCF0edA70A17b38e44843E";
    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    //await lockAndRemoteIssue(wethAddress, backingAddress, ethers.utils.parseEther("1.7"), backingWallet, "100");
    await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("2.8"), backingWallet, "100");
    //await burnAndRemoteUnlock(ringAddress, mtfAddress, ethers.utils.parseEther("0.11"), mtfWallet, "0.01");
    //await burnAndRemoteUnlockNative(ringAddress, mtfAddress, ethers.utils.parseEther("0.13"), mtfWallet, "0.01");
    */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
