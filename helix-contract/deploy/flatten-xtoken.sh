path=flatten/xtoken-v3
mkdir -p $path
yarn flat contracts/xtoken/v3/base/XTokenBacking.sol --output $path/XTokenBacking.sol
yarn flat contracts/xtoken/v3/base/XTokenIssuing.sol --output $path/XTokenIssuing.sol
yarn flat contracts/xtoken/v3/base/XTokenErc20.sol --output $path/XTokenErc20.sol
yarn flat contracts/xtoken/v3/templates/GuardV3.sol --output $path/GuardV3.sol
yarn flat contracts/messagers/MsgportMessager.sol --output $path/MsgportMessager.sol
