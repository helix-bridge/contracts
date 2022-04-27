var MappingTokenDeployer = require("./deploy.js")
var ProxyDeployer = require("./proxy.js");

async function main() {
    // goerli testnet
    const helixHandler = await MappingTokenDeployer.deploycBridgeHelixHandler("0xF25170F86E4291a99a9A560032Fe9948b8BcFBB2");
    console.log("helix handler is", helixHandler);
    const admin = await ProxyDeployer.deployProxyAdmin();
    console.log("admin address is", admin.address);
    await admin.deployed();
    const backing = await MappingTokenDeployer.deployErc721Backing(admin.address, helixHandler);
    console.log("erc721 backing", backing.proxy.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
