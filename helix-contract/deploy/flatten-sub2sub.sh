path=flatten/sub2sub
mkdir -p $path
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20Sub2SubBacking.sol --output $path/Erc20Sub2SubBacking.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20Sub2SubMappingTokenFactory.sol --output $path/Erc20Sub2SubMappingTokenFactory.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/WToken.sol --output $path/WToken.sol
yarn flat contracts/mapping-token/v2/erc20-mapping-protocol/Erc20.sol --output $path/Erc20.sol
yarn flat contracts/mapping-token/v2/message-endpoints/DarwiniaSub2SubMessageEndpoint.sol --output $path/DarwiniaSub2SubMessageEndpoint.sol
yarn flat contracts/mapping-token/v2/Guard.sol --output $path/Guard.sol
