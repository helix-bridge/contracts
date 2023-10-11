const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

const privateKey = process.env.PRIKEY

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

const networks = {
    "goerli": {
        url: "https://rpc.ankr.com/eth_goerli",
        defaultBridge: "0x258F81A0B59e0fD84604E3e9fc1b70718927c239",
        oppositeBridge: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
        chainId: 5,
        usdc: "0x1a70127284B774fF4A4dbfe0115114642f0eca65",
        usdt: "0x2303e4d55BF16a897Cb5Ab71c6225399509d9314",
    },
    "arbitrum": {
        url: "https://goerli-rollup.arbitrum.io/rpc",
        defaultBridge: "0x258F81A0B59e0fD84604E3e9fc1b70718927c239",
        oppositeBridge: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
        chainId: 421613,
        usdc: "0x39dE82E1d9B8F62E11022FC3FC127a82F93fE47E",
        usdt: "0x6d828718c1097A4C573bc25c638Cc05bF10dFeAF",
    },
    "linea": {
        url: "https://rpc.goerli.linea.build",
        defaultBridge: "0x258F81A0B59e0fD84604E3e9fc1b70718927c239",
        oppositeBridge: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
        chainId: 59140,
        usdc: "0xb5E028f980dF5533cB0e8F04530B76637383d993",
        usdt: "0xBC1A2f123Dc9CD2ec8d3cE42eF16c28F3C9bA686",
    },
    "mantle": {
        url: "https://rpc.testnet.mantle.xyz",
        defaultBridge: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
        oppositeBridge: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
        chainId: 5001,
        usdc: "0x0258Eb547bFEd540ed17843658C018569fe1E328",
        usdt: "0x5F8D4232367759bCe5d9488D3ade77FCFF6B9b6B",
    },
};

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function getProviderKey(
    remoteChainId,
    provider,
    sourceToken,
    remoteToken
) {
    const encode = ethers.utils.solidityPack([
        "uint256",
        "address",
        "address",
        "address",
    ], [remoteChainId, provider, sourceToken, remoteToken]);
    return ethUtil.keccak256(encode);
}

function getLockKey(
    remoteChainId,
    sourceToken,
    remoteToken
) {
    const encode = ethers.utils.solidityPack([
        "uint256",
        "address",
        "address",
    ], [remoteChainId, sourceToken, remoteToken]);
    return ethUtil.keccak256(encode);
}

async function defaultTransferAndLockMargin(
    wallet,
    bridgeAddress, 
    remoteChainId,
    sourceToken,
    targetToken,
    amount) {
    const bridge = await ethers.getContractAt("LnDefaultBridge", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        remoteChainId,
        wallet.address,
        sourceToken,
        targetToken,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.srcProviders(getProviderKey(remoteChainId, wallet.address, sourceToken, targetToken));
    const expectedWithdrawNonce = providerInfo.config.withdrawNonce;
    console.log("expect withdraw nonce is", expectedWithdrawNonce);
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            remoteChainId,
            wallet.address,
            sourceToken,
            targetToken,
            providerInfo.lastTransferId,
            expectedFee,
            expectedWithdrawNonce,
        ],
        amount,
        wallet.address,
    );
    console.log(tx);
}

async function oppositeTransferAndLockMargin(
    wallet,
    bridgeAddress, 
    remoteChainId,
    sourceToken,
    targetToken,
    amount) {
    const bridge = await ethers.getContractAt("LnOppositeBridge", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        remoteChainId,
        wallet.address,
        sourceToken,
        targetToken,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.srcProviders(getProviderKey(remoteChainId, wallet.address, sourceToken, targetToken));
    const expectedMargin = providerInfo.config.margin;
    console.log("expect margin is", expectedMargin);
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            remoteChainId,
            wallet.address,
            sourceToken,
            targetToken,
            providerInfo.lastTransferId,
            expectedFee,
            expectedMargin,
        ],
        amount,
        wallet.address,
    );
    console.log(tx);
}

async function defaultRelay(
    remoteChainId,
    fromWallet,
    toWallet,
    fromBridgeAddress,
    toBridgeAddress,
    sourceToken,
    targetToken,
    amount,
    previousTransferId,
    expectedTransferId,
) {
    const fromBridge = await ethers.getContractAt("LnDefaultBridge", fromBridgeAddress, fromWallet);
    const lockInfo = await fromBridge.lockInfos(expectedTransferId);
    const toBridge = await ethers.getContractAt("LnDefaultBridge", toBridgeAddress, toWallet);
    //const tx = await bridge.callStatic.relay(
    await toBridge.transferAndReleaseMargin(
        [
            previousTransferId,
            toWallet.address,
            sourceToken,
            targetToken,
            amount,
            lockInfo.timestamp,
            toWallet.address,
        ],
        remoteChainId,
        expectedTransferId,
    );
    //console.log(tx);
}

async function oppositeRelay(
    remoteChainId,
    fromWallet,
    toWallet,
    fromBridgeAddress,
    toBridgeAddress,
    sourceToken,
    targetToken,
    amount,
    previousTransferId,
    expectedTransferId,
) {
    const fromBridge = await ethers.getContractAt("LnOppositeBridge", fromBridgeAddress, fromWallet);
    const lockInfo = await fromBridge.lockInfos(expectedTransferId);
    const toBridge = await ethers.getContractAt("LnOppositeBridge", toBridgeAddress, toWallet);
    //const tx = await bridge.callStatic.relay(
    await toBridge.transferAndReleaseMargin(
        [
            previousTransferId,
            toWallet.address,
            sourceToken,
            targetToken,
            amount,
            lockInfo.timestamp,
            toWallet.address,
        ],
        remoteChainId,
        expectedTransferId,
    );
    //console.log(tx);
}

async function slash(
    wallet,
    bridgeAddress,
    provider,
    sourceToken,
    targetToken,
    previousTransferId,
    timestamp,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("Linea2EthTarget", bridgeAddress, wallet);
    const cost = ethers.utils.parseEther("0.0003");
    //return;

    //const tx = await bridge.callStatic.slashAndRemoteRefund(
    await bridge.slashAndRemoteRefund(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        expectedTransferId,
        {value: cost },
    );
    //console.log(tx);
}

async function requestWithdrawMargin(
    wallet,
    bridgeAddress,
    lastTransferId,
    sourceToken,
    amount,
) {
    const bridge = await ethers.getContractAt("Linea2EthTarget", bridgeAddress, wallet);
    const cost = 0;
    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        lastTransferId,
        sourceToken,
        amount,
        {value: cost },
    );
    //console.log(tx);
}

function wallet(network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function withdraw(bridgeType, from, to, sourceToken, targetToken, amount, fee, extParams) {
    const sourceTokenContract = await ethers.getContractAt("Erc20", sourceToken, from.wallet);
    if (bridgeType == "default") {
        const srcDecimals = await sourceTokenContract.decimals();
        const formatedAmount = ethers.utils.parseUnits(amount, srcDecimals);
        // withdraw from source bridge
        const bridge = await ethers.getContractAt("LnDefaultBridge", from.defaultBridge, from.wallet);
        await bridge.requestWithdrawMargin(
            to.chainId,
            sourceToken,
            targetToken,
            formatedAmount,
            extParams,
            { value: fee },
        );
    } else {
        const dstDecimals = await sourceTokenContract.decimals();
        const formatedAmount = ethers.utils.parseUnits(amount, dstDecimals);
        // withdraw from target bridge
        const srcBridge = await ethers.getContractAt("LnOppositeBridge", from.oppositeBridge, from.wallet);
        const providerInfo = await srcBridge.srcProviders(getProviderKey(to.chainId, from.wallet.address, sourceToken, targetToken));
        const bridge = await ethers.getContractAt("LnOppositeBridge", to.oppositeBridge, to.wallet);
        await bridge.requestWithdrawMargin(
            from.chainId,
            providerInfo.lastTransferId,
            sourceToken,
            targetToken,
            formatedAmount,
            extParams,
            { value: fee },
        );
    }
}

async function transfer(bridgeType, from, to, sourceToken, targetToken, amount) {
    const sourceTokenContract = await ethers.getContractAt("Erc20", sourceToken, from.wallet);
    const decimals = await sourceTokenContract.decimals();
    const formatedAmount = ethers.utils.parseUnits(amount, decimals);
    if (bridgeType == "default") {
        const bridge = await ethers.getContractAt("LnDefaultBridge", from.defaultBridge, from.wallet);
        const previousInfo = await bridge.srcProviders(getProviderKey(to.chainId, from.wallet.address, sourceToken, targetToken));
        await defaultTransferAndLockMargin(
            from.wallet,
            from.defaultBridge, 
            to.chainId,
            sourceToken,
            targetToken,
            formatedAmount
        );
        console.log("[default] transfer and lock margin successed");
        await wait(10000);
        // query and relay
        /*
        const providerInfo = await bridge.srcProviders(getProviderKey(to.chainId, from.wallet.address, sourceToken, targetToken));
        const expectedTransferId = providerInfo.lastTransferId;
        await defaultRelay(
            from.chainId,
            from.wallet,
            to.wallet,
            from.defaultBridge,
            to.defaultBridge,
            sourceToken,
            targetToken,
            formatedAmount,
            previousInfo.lastTransferId,
            expectedTransferId,
        );
        console.log("[default] relay and release margin successed");
        */
    } else {
        const bridge = await ethers.getContractAt("LnOppositeBridge", from.oppositeBridge, from.wallet);
        const previousInfo = await bridge.srcProviders(getProviderKey(to.chainId, from.wallet.address, sourceToken, targetToken));
        await oppositeTransferAndLockMargin(
            from.wallet,
            from.oppositeBridge, 
            to.chainId,
            sourceToken,
            targetToken,
            formatedAmount
        );
        console.log("[opposite] transfer and lock margin successed");
        // query and relay
        /*
        const providerInfo = await bridge.srcProviders(getProviderKey(to.chainId, from.wallet.address, sourceToken, targetToken));
        const expectedTransferId = providerInfo.lastTransferId;
        await oppositeRelay(
            from.chainId,
            from.wallet,
            to.wallet,
            to.oppositeBridge,
            to.oppositeBridge,
            sourceToken,
            targetToken,
            formatedAmount,
            previousInfo.lastTransferId,
            expectedTransferId,
        );
        console.log("[opposite] relay and release margin successed");
        */
    }
}

async function lzFee(from, to) {
    const fillAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const bridge = await ethers.getContractAt("LnDefaultBridge", from.defaultBridge, from.wallet);
    const serviceAddress = (await bridge.messagers(to.chainId)).sendService;
    const messager = await ethers.getContractAt("LayerZeroMessager", serviceAddress, from.wallet);
    const message = await bridge.encodeWithdrawCall("0x1000000000000000000000000000000000000000000000000000000000000001", 1, fillAddress, fillAddress, fillAddress, 1000000000);
    const lzPayload = ethers.utils.defaultAbiCoder.encode([
        "address",
        "address",
        "bytes",
    ], [fillAddress, fillAddress, message]);
    return await messager.fee(to.chainId, lzPayload);
}

async function eth2arbFee(arb, eth, sourceToken, targetToken) {
    const l1GasPrice = 2000000000;
    const l2GasPrice = 100000000;
    const l2GasLimit = 1000000;
    const bridge = await ethers.getContractAt("LnOppositeBridge", eth.oppositeBridge, eth.wallet);
    const srcBridge = await ethers.getContractAt("LnOppositeBridge", arb.oppositeBridge, arb.wallet);
    console.log(eth.chainId, arb.wallet.address, sourceToken, targetToken);

    const providerInfo = await srcBridge.srcProviders(getProviderKey(eth.chainId, arb.wallet.address, sourceToken, targetToken))
    const serviceAddress = (await bridge.messagers(arb.chainId)).sendService;
    const messager = await ethers.getContractAt("Eth2ArbSendService", serviceAddress, eth.wallet);
    const message = await bridge.encodeWithdrawMargin(providerInfo.lastTransferId, sourceToken, targetToken, 1000000000);
    const fee = await messager.fee(message.length, l1GasPrice, l2GasPrice, l2GasLimit, 10);
    const extParams = await messager.encodeParams(
        fee[0],
        l2GasPrice,
        l2GasLimit,
        eth.wallet.address
    );
    return [fee[1], extParams];
}

// 2. deploy mapping token factory
async function main() {
    for (let network in networks) {
        networks[network]['wallet'] = wallet(networks[network]);
    }

    //await transfer("default", networks.goerli, networks.linea, networks.goerli.usdt, networks.linea.usdt, "320");
    //await transfer("opposite", networks.linea, networks.goerli, networks.linea.usdt, networks.goerli.usdt, "500");
    await transfer("default", networks.goerli, networks.mantle, networks.goerli.usdc, networks.mantle.usdc, "500");
    return;
    //await transfer("default",networks.mantle, networks.goerli, networks.mantle.usdc, networks.goerli.usdc, "132");
    //console.log("transfer and relay successed");
    //return;

    /*
    const fee = await lzFee(networks.arbitrum, networks.linea);
    console.log(fee);
    await withdraw("default", networks.arbitrum, networks.linea, networks.arbitrum.usdc, networks.linea.usdc, "20", fee.nativeFee, networks.arbitrum.wallet.address);
    */
    /*
    const sendInfo = await eth2arbFee(networks.arbitrum, networks.goerli, networks.arbitrum.usdc, networks.goerli.usdc);
    console.log(sendInfo);
    await withdraw("opposite", networks.arbitrum, networks.goerli, networks.arbitrum.usdc, networks.goerli.usdc, "20", sendInfo[0], sendInfo[1]);
    return;

    // slasher
    await slash(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        usdcLineaAddress,
        usdcEthereumAddress,
        lastTransferId,
        timestamp,
        lineaWallet.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    return;
    */

    const testers = [
        "0x5861e3c9148D5DeB59b854805d8eCf3D5443fbEF",
        "0x0e86Bf507Fd6025A5110dfb35df32ee2B2cf8A05",
        "0x8481f3D3Be89c7a5D26176772c45ee3bDb307E79"
    ];
    for (let networkName in networks) {
        const network = networks[networkName];
        console.log(network.url);
        const w = wallet(network);
        const token = await ethers.getContractAt("Erc20", network.usdc, w);
        const decimals = await token.decimals();
        for (const tester of testers) {
        //for (const key of privateKeys) {
            // mint token
            await token.mint(tester, ethers.utils.parseUnits("500000", decimals));
            console.log(`mint for ${tester} successed`);
            // approve
            /*
            const provider = new ethers.providers.JsonRpcProvider(network.url);
            const testerWallet = new ethers.Wallet(key, provider);
            const testerToken = await ethers.getContractAt("Erc20", network.usdt, testerWallet);
            await testerToken.approve("0x54cc9716905ba8ebdD01E6364125cA338Cd0054E", ethers.utils.parseEther("1000000000000"));
            await testerToken.approve("0x79e6f452f1e491a7aF0382FA0a6EF9368691960D", ethers.utils.parseEther("1000000000000"));
            console.log(`${testerWallet.address} approve successed`);
            */
        }
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
