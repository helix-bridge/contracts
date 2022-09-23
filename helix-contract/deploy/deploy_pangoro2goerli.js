var ProxyDeployer = require("./proxy.js");

async function deployMessageEndpoint(wallet, inboundLane, ouboundLane, feeMarket, existedAddress) {
    return await deployContract(wallet, "DarwiniaSub2EthMessageEndpoint", existedAddress, inboundLane, ouboundLane, feeMarket, {gasLimit: 2000000});
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
        { value: ethers.utils.parseEther(fee) });
}

async function lockAndRemoteIssueNative(backingAddress, amount, wallet, fee) {
    const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, wallet);
    const tx = await backing.lockAndRemoteIssuingNative(
        wallet.address,
        amount,
        { value: ethers.utils.parseEther(fee).add(amount) });
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
    const backingOutboundLane = "0x671EB5a157328b46518D9D0d070e33404Bae5758";
    const backingInboundLane = "0x3277B7BABbeadF5dC43D5350df25310f3c819965";

    const mtfFeeMarket = "0x380244554a9C51f0CCaFec90A2766B0C8b698a4a";
    const mtfOutboundLane = "0x33Ae943B5567e0a92928EF5EB1E6151558a086da";
    const mtfInboundLane = "0xD9c96CaDC0710b8cD206d4F24DD8c547c6Ce23af";
    // deploy
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
    const backingFeeMarket = "0x6eDcF984eF28C29aa48242B92685244bcD6D7203";
    const backingOutboundLane = "0x671EB5a157328b46518D9D0d070e33404Bae5758";
    const backingInboundLane = "0x3277B7BABbeadF5dC43D5350df25310f3c819965";

    const mtfFeeMarket = "0x380244554a9C51f0CCaFec90A2766B0C8b698a4a";
    const mtfOutboundLane = "0x33Ae943B5567e0a92928EF5EB1E6151558a086da";
    const mtfInboundLane = "0xD9c96CaDC0710b8cD206d4F24DD8c547c6Ce23af";

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

    const deployed = await deploy(backingWallet, mtfWallet);
    //const deployed = await deployWithExistContract(backingWallet, mtfWallet);
    console.log(deployed);
    const backingInfo = deployed.pangoro2goerli_sub2eth_pangoro;
    const mtfInfo = deployed.pangoro2goerli_sub2eth_goerli;
    await lockAndRemoteIssue(backingInfo.WRING, backingInfo.backingProxy, ethers.utils.parseEther("1.1"), backingWallet, "30");
    await lockAndRemoteIssueNative(backingInfo.backingProxy, ethers.utils.parseEther("1.2"), backingWallet, "30");
    
    //const wethAddress = "0xF5c874cb3C541aE8C8f5C810BA78E98449A17913";
    //const mtfAddress = "0xe35b898A65c9868336bf34321373E1DA9401eB9d";
    //const backingAddress = "0x7F9096beb4bAd82a63f4275d53c7E8EA03aC1C99";
    //const ringAddress = "0xD08a544fc3baa1dBB34F310c4A941E88D82bc8Fe";
    //const mtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", mtfAddress, mtfWallet);
    //const backing = await ethers.getContractAt("Erc20Sub2EthBacking", backingAddress, backingWallet);

    //const oldmtf = await ethers.getContractAt("Erc20Sub2EthMappingTokenFactory", "0x38d8af6834bc10856a161977534d0bca7419eacd", mtfWallet);
    //await oldmtf.transferMappingTokenOwnership("0x69e392E057B5994da2b0E9661039970Ac4c26b8c", mtfAddress);

    
    //const dailyLimit = ethers.utils.parseEther("300");
    //await mtf.changeDailyLimit(ringAddress, dailyLimit);
    //await backing.changeDailyLimit(wethAddress, dailyLimit);

    //console.log(await mtf.calcMaxWithdraw(ringAddress));
    //await lockAndRemoteIssue(wethAddress, backingAddress, ethers.utils.parseEther("1.7"), backingWallet, "100");
    //await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("1.82"), backingWallet, "100");
    //await burnAndRemoteUnlock(ringAddress, mtfAddress, ethers.utils.parseEther("0.11"), mtfWallet, "0.01");
    //await burnAndRemoteUnlockNative(ringAddress, mtfAddress, ethers.utils.parseEther("0.12"), mtfWallet, "0.01");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
