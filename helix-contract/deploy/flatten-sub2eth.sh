path=flatten/sub2eth
mkdir -p $path
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20Sub2EthBacking.sol --output $path/Erc20Sub2EthBacking.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20Sub2EthMappingTokenFactory.sol --output $path/Erc20Sub2EthMappingTokenFactory.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/WToken.sol --output $path/WToken.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20.sol --output $path/Erc20.sol
yarn flat contracts/mapping-token/v2/message-endpoints/DarwiniaSub2EthMessageEndpoint.sol --output $path/DarwiniaSub2EthMessageEndpoint.sol
yarn flat contracts/mapping-token/v2/Guard.sol --output $path/Guard.sol
