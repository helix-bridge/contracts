var ProxyDeployer = require("./proxy.js");

async function deployMessageEndpoint(wallet, inboundLane, ouboundLane, feeMarket) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2EthMessageEndpoint", wallet);
    const handle = await handleContract.deploy(inboundLane, ouboundLane, feeMarket, {gasLimit: 2000000});
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssue(tokenAddress, backingAddress, amount, wallet, fee) {
    const originToken = await ethers.getContractAt("WRING", tokenAddress, wallet);
    await originToken.deposit({value: amount});
    await originToken.approve(backingAddress, amount);
    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, wallet);
    await backing.lockAndRemoteIssuing(
        tokenAddress,
        wallet.address,
        amount,
        { value: ethers.utils.parseEther(fee) });
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

// 2. deploy mapping token factory
async function main() {
    const privateKey = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';

    const backingUrl = "https://pangoro-rpc.darwinia.network";
    const backingNetworkId = 45; //45
    const backingFeeMarket = "0x5EB9c67D980BFDc0565B772846bE83d1E41b7ac4";
    const backingOutboundLane = "0x50D831c94b7be724aE6D82e3ED50BA1eb403e992";
    const backingInboundLane = "0x3cd0eb6F7073Bd3c90f718B6Dd0a033e8e08B52D";

    const mtfUrl = "https://rpc.ankr.com/eth_goerli";
    const mtfNetworkId = 5; //44
    const mtfFeeMarket = "0x4ca59Ec46543E10De53C97332B8fe656e7a22878";
    const mtfOutboundLane = "0xe69FEf10C0a8d042c98930DAaF3B9622cE142F28";
    const mtfInboundLane = "0xD91176734e91BA246344C8A2635331B9616FD1C4";

    // backing
    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);

    // mapping token factory
    const mtfProvider = new ethers.providers.JsonRpcProvider(mtfUrl);
    const mtfWallet = new ethers.Wallet(privateKey, mtfProvider);

    /*
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
    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLEREE_ROLE(), backing.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLER_ROLE(), mtf.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLEREE_ROLE(), mtf.address);
    await backing.grantRole(await backing.OPERATOR_ROLE(), backingWallet.address);
    await mtf.grantRole(await mtf.OPERATOR_ROLE(), mtfWallet.address);
    console.log("grant role permission finished");

    // register special erc20 token
    // native token weth
    const wethContract = await ethers.getContractFactory("WRING", backingWallet);
    const weth = await wethContract.deploy();
    await weth.deployed();
    console.log("weth address is ", weth.address);

    // register
    const dailyLimit = ethers.utils.parseEther("1000000");
    //const tx = await backing.callStatic.register(
    const tx = await mtf.register(
        weth.address,
        "Darwinia Smart",
        "Wrapped Ring",
        "WRING",
        18,
        dailyLimit
    );
    console.log("transaction is ", tx);
    */

    const wethAddress = "0xA64b0b8D1c677E4c930Dc2dc814D5cB22F088AC8";
    const mtfAddress = "0xa687A39C61972b81AB644Ba9820AdeaFE75d9B4e";
    const backingAddress = "0x36F74e68F09Eb1d47508f747e188DcA68e8c9CA6";
    const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    const dailyLimit = ethers.utils.parseEther("1000000");
    //const tx = await backing.callStatic.register(
    /*
    const tx = await mtf.register(
        wethAddress,
        "Darwinia Smart",
        "Wrapped Ring",
        "WRING",
        18,
        dailyLimit
    );
    console.log("transaction is ", tx);
    */

    //await lockAndRemoteIssue(wethAddress, backingAddress, ethers.utils.parseEther("1.7"), backingWallet, "30");

    /*
    // the deployed addresses
    const mtfAddress = "0x8738A64392b71617aF4C685d0E827855c741fDF7";
    const backingAddress = "0xF3c1444CD449bD66Ef6DA7CA6c3E7884840A3995";
    const wethAddress = "0xE7578598Aac020abFB918f33A20faD5B71d670b4";

    // 1. lock and remote issue
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    await lockAndRemoteIssueNative(wethAddress, backingAddress, ethers.utils.parseEther("1.3"), backingWallet);
    */

    // 2. burn and remote unlock
    const tx = await burnAndRemoteUnlock(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet, "0.0001");
    //await burnAndRemoteUnlock(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    //await burnAndRemoteUnlock(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    //await burnAndRemoteUnlock(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    //console.log(tx);
    //const weth = await ethers.getContractAt("WRING", wethAddress, backingWallet);
    //await weth.deposit({value: ethers.utils.parseEther("100")});
    //const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    //console.log(await mtf.fee());

    //const transferId = "0x726f6c69000000000000009e";
    //await remoteUnlockFailure(transferId, wethAddress, mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
