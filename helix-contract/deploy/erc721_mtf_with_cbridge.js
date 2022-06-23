var MappingTokenDeployer = require("./deploy.js")
var ProxyDeployer = require("./proxy.js");

// 2. deploy mapping token factory
async function main() {
    // bsc testnet
    const helixHandler = await MappingTokenDeployer.deploycBridgeHelixHandler("0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA");
    console.log("helix handler is", helixHandler.address);
    const admin = await ProxyDeployer.deployProxyAdmin();
    console.log("admin address is", admin.address);
    await admin.deployed();
    const mtf = await MappingTokenDeployer.deployErc721MappingTokenFactory(admin.address, helixHandler.address);
    console.log("erc721 mtf", mtf.proxy.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
