const fs = require("fs");

var Configure = {
    chain: function(env) {
        const path = `script/configure/${env}.chain.json`;
        const chainInfo = JSON.parse(
            fs.readFileSync(path, "utf8")
        );
        return Object.fromEntries(
            chainInfo.map(e => [e.name, e])
        )
    },
    bridgeV3: function(env) {
        const path = `script/configure/${env}.lnv3.json`;
        const bridgeInfo = JSON.parse(
            fs.readFileSync(path, "utf8")
        );
        return {
            logic: Object.fromEntries(
                bridgeInfo.logic.map(e => [e.name, e.address])
            ),
            proxy: Object.fromEntries(
                bridgeInfo.proxy.map(e => [e.name, e.address])
            )
        };
    },
    // map with chain name
    bridgev3Config: function(env) {
        let chains = Configure.chain(env);
        let bridges = Configure.bridgeV3(env);
        for (let chain in chains) {
            chains[chain].logic = bridges.logic[chain] ?? bridges.logic.others;
            chains[chain].proxy = bridges.proxy[chain] ?? bridges.proxy.others;
        }
        return chains;
    }
}

module.exports = Configure
