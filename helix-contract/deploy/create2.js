
var Create2 = {
    getDeployedBytecode: function(factory, constructorTypes, constructorArgs) {
        const abiCoder = ethers.utils.defaultAbiCoder;
        const encodedParams = abiCoder.encode(constructorTypes, constructorArgs);
        console.log(`constructor bytes: ${encodedParams.slice(2)}`);
        const bytecode = `${factory.bytecode}${encodedParams.slice(2)}`;
        return bytecode;
    },
    deploy: async function(deployAddress, wallet, bytecode, salt, gasLimit) {
        const hexSalt = ethers.utils.id(salt.toString());
        const deployer = await ethers.getContractAt("Create2Deployer", deployAddress, wallet);
        const result = await (await deployer.deploy(bytecode, hexSalt, {gasLimit: gasLimit})).wait();
        const targetEvent = result.events.find((e) => e.event == 'Deployed');
        const abiCoder = ethers.utils.defaultAbiCoder;
        const eventParams = abiCoder.decode(["address", "uint256"], targetEvent.data);
        return eventParams[0];
    }
}

module.exports = Create2
