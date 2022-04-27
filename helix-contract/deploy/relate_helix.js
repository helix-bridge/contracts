async function main() {
    //const localHelix = "0x4617D470F847Ce166019d19a7944049ebB017400";
    //const remoteHelix = "0xCB05c3374a3fcD27c86BA05A05947d6b23F4a3E1";
    //const remoteChainId = 97;
    const localHelix = "0xCB05c3374a3fcD27c86BA05A05947d6b23F4a3E1";
    const remoteHelix = "0x4617D470F847Ce166019d19a7944049ebB017400";
    const remoteChainId = 5;
    var cBridgeHandler = await ethers.getContractAt("cBridgeMessageHandle", localHelix);

    await cBridgeHandler.setBridgeInfo(remoteChainId, remoteHelix);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
