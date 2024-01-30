import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

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
    deployProxyAdmin: async function(deployer) {
        const artifact = await deployer.loadArtifact("ProxyAdmin");
        const proxyAdminContract = await deployer.deploy(artifact, []);
        return proxyAdminContract.address;
    },
    deployProxyContract: async function(deployer, proxyAdminAddr, logicFactory, logicAddress, args) {
        const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, args, "initialize");
        const artifact = await deployer.loadArtifact("TransparentUpgradeableProxy");
        const proxyContract = await deployer.deploy(artifact, [logicAddress, proxyAdminAddr, calldata]);
        console.log("proxy args", logicAddress, proxyAdminAddr, calldata);
        return proxyContract.target;
    }
}

export { ProxyDeployer };
