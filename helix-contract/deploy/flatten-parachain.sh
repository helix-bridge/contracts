path=flatten/toparachain
mkdir -p $path
yarn flat contracts/mapping-token/v2/native-parachain-protocol/NativeParachainBacking.sol --output $path/NativeParachainBacking.sol
yarn flat contracts/mapping-token/v2/message-endpoints/Darwinia2ParaMessageEndpoint.sol --output $path/Darwinia2ParaMessageEndpoint.sol
