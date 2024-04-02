// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./HelixLnBridgeV3.sol";
import "../../interfaces/IBlast.sol";
import "../../interfaces/IBlastPoints.sol";

// when register some token that support yield, don't forget to configure claimable yield
contract HelixLnBridgeV3ForBlast is HelixLnBridgeV3 {
    function initialize(address _dao, bytes calldata _data) public override initializer {
        _initialize(_dao);
        (address _blast, address _blastPoints) = abi.decode(_data, (address, address));
        IBlast blast = IBlast(_blast);
        blast.configureClaimableGas();
        blast.configureClaimableYield();
        blast.configureGovernor(_dao);
        IBlastPoints blastPoints = IBlastPoints(_blastPoints);
        blastPoints.configurePointsOperator(_dao);
    }
}

