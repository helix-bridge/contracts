var ProxyDeployer = require("./proxy.js");

var MappingTokenDeployer = {
    deploycBridgeHelixHandler: async function(messageBus) {
        const cBridgeContract = await ethers.getContractFactory("cBridgeMessageHandle");
        const cBridgeHandler = await cBridgeContract.deploy();
        await cBridgeHandler.deployed();
        console.log("helix contract address:", cBridgeHandler.address);
        await cBridgeHandler.setMessageBus(messageBus);
        return cBridgeHandler;
    },
    deployErc721Backing: async function(proxyAdminAddr, helixHandler) {
        console.log("deploy backing contract, it's a proxy contract");
        const backingContract = await ethers.getContractFactory("Erc721BackingUnsupportingConfirm");
        const backingLogic = await backingContract.deploy();
        await backingLogic.deployed();
        console.log("deploy backing logic", backingLogic.address);
        return {
            "logic": backingLogic,
            "proxy": await ProxyDeployer.deployProxyContract(
                proxyAdminAddr,
                backingContract,
                backingLogic.address,
                [helixHandler]
            )
        };
    },
    deployErc721MappingTokenFactory: async function(proxyAdminAddr, helixHandler) {
        console.log("deploy mapping token factory contract, it's a proxy contract");
        const mtfContract = await ethers.getContractFactory("Erc721MappingTokenFactoryUnsupportingConfirm");
        const mtfLogic = await mtfContract.deploy();
        console.log("deploy mtf logic", mtfLogic.address);
        await mtfLogic.deployed();
        return {
            "logic": mtfLogic,
            "proxy": await ProxyDeployer.deployProxyContract(
                proxyAdminAddr,
                mtfContract,
                mtfLogic.address,
                [helixHandler]
            )
        };
    }
}

module.exports = MappingTokenDeployer
