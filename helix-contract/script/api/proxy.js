const { deployContract } = require("solidity-create2-deployer");
var Create2 = require("./create2.js");

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
    },
    deployProxyContract2: async function(deployerAddress, salt, proxyAdminAdder, logicFactory, logicAddress, args, wallet, gasLimit) {
        const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, args, "initialize");
        const proxyContract = await ethers.getContractFactory("TransparentUpgradeableProxy", wallet);
        const deployedBytecode = Create2.getDeployedBytecode(
            proxyContract, 
            ["address", "address", "bytes"],
            [logicAddress, proxyAdminAdder, calldata],
        );
        return await Create2.deploy(deployerAddress, wallet, deployedBytecode, salt, gasLimit);
    }
}

module.exports = ProxyDeployer
