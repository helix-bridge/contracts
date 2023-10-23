const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var Create2 = require("./create2.js");
var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function getHelixProxyAdminBytecode(networkUrl, version) {
    const w = wallet(networkUrl);
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const proxyAdminContract = await ethers.getContractFactory("HelixProxyAdmin", w);
    const bytecode = Create2.getDeployedBytecode(proxyAdminContract, ["address"], [w.address]);
    console.log(`get helix proxyAdmin bytecode, salt ${salt}, bytecode ${bytecode}`);
    return;
}

async function getOppositeBridgeBytecode(networkUrl, version) {
    const w = wallet(networkUrl);
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const oppositeBridgeContract = await ethers.getContractFactory("LnOppositeBridge", w);
    const bytecode = Create2.getDeployedBytecode(oppositeBridgeContract, [], []);
    console.log(`get helix opposite logic bridge bytecode, salt ${salt}, bytecode ${bytecode}`);
    return;
}

async function getDefaultBridgeBytecode(networkUrl, version) {
    const w = wallet(networkUrl);
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const defaultBridgeContract = await ethers.getContractFactory("LnDefaultBridge", w);
    const bytecode = Create2.getDeployedBytecode(defaultBridgeContract, [], []);
    console.log(`get helix default logic bridge bytecode, salt ${salt}, bytecode ${bytecode}`);
    return;
}

async function getLnProxyBridgeBytecode(w, version, logicFactory, logicAddress, proxyAdminAddress, args) {
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, args, "initialize");
    const proxyContract = await ethers.getContractFactory("TransparentUpgradeableProxy", w);
    const bytecode = Create2.getDeployedBytecode(proxyContract, ["address", "address", "bytes"], [logicAddress, proxyAdminAddress, calldata]);
    console.log(`get helix proxy bridge bytecode, salt ${salt}, bytecode ${bytecode}`);
    return;
}

async function getLnDefaultProxyBridgeBytecode(networkUrl, version, logicAddress, proxyAdminAddress) {
    const w = wallet(networkUrl);
    const defaultFactory = await ethers.getContractFactory("LnDefaultBridge", w);
    await getLnProxyBridgeBytecode(w, version, defaultFactory, logicAddress, proxyAdminAddress, [w.address]);
    return;
}

async function getLnOppositeProxyBridgeBytecode(networkUrl, version, logicAddress, proxyAdminAddress) {
    const w = wallet(networkUrl);
    const oppositeFactory = await ethers.getContractFactory("LnOppositeBridge", w);
    await getLnProxyBridgeBytecode(w, version, oppositeFactory, logicAddress, proxyAdminAddress, [w.address]);
    return;
}

// 2. deploy mapping token factory
async function main() {
    //await getHelixProxyAdminBytecode('https://rpc.ankr.com/eth_goerli', 'v1.0.0');
    //await getOppositeBridgeBytecode('https://rpc.ankr.com/eth_goerli', 'v1.0.0');
    //await getDefaultBridgeBytecode('https://rpc.ankr.com/eth_goerli', 'v1.0.0');
    await getLnDefaultProxyBridgeBytecode('https://rpc.ankr.com/eth_goerli', 'v1.0.0', '0x8af688056c6614acb5A78c62e1f9f49022C0452f', '0x601dE3B81c7cE04BecE3b29e5cEe4F3251d250dB');
    //await getLnOppositeProxyBridgeBytecode('https://rpc.ankr.com/eth_goerli', 'v1.0.0', '0x90873fa1bbd028F22277567530A22E05f7721D37', '0x601dE3B81c7cE04BecE3b29e5cEe4F3251d250dB');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

