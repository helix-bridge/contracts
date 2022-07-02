var ProxyDeployer = {
    getInitializerData: function(
        contractInterface,
        args,
        initializer,
    ) {
        try {
            const fragment = contractInterface.getFunction(initializer);
            return contractInterface.encodeFunctionData(fragment, args);
        } catch (e) {
            throw e;
        }
    },
    deployProxyAdmin: async function(wallet) {
        const proxyAdminContract = await ethers.getContractFactory("ProxyAdmin", wallet);
        const proxyAdmin = await proxyAdminContract.deploy();
        await proxyAdmin.deployed();
        return proxyAdmin;
    },
    deployProxyContract: async function(proxyAdminAddr, logicFactory, logicAddress, args, wallet) {
        const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, args, "initialize");
        const proxyContract = await ethers.getContractFactory("TransparentUpgradeableProxy", wallet);
        const proxy = await proxyContract.deploy(logicAddress, proxyAdminAddr, calldata)
        await proxy.deployed();
        return proxy;
    }
}

module.exports = ProxyDeployer
