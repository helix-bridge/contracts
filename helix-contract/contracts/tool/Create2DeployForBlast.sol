// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interfaces/IBlast.sol";
import "../interfaces/IBlastPoints.sol";

contract Create2DeployerForBlast {
  event Deployed(address addr, uint256 salt);

  constructor(address _blast, address _blastPoints) {
    address sender = msg.sender;
    IBlast blast = IBlast(_blast);
    blast.configureClaimableGas();
    blast.configureClaimableYield();
    blast.configureGovernor(sender);
    IBlastPoints blastPoints = IBlastPoints(_blastPoints);
    blastPoints.configurePointsOperator(sender);
  }

  function deploy(bytes memory code, uint256 salt) public {
    address addr;
    assembly {
      addr := create2(0, add(code, 0x20), mload(code), salt)
      if iszero(extcodesize(addr)) {
        revert(0, 0)
      }
    }

    emit Deployed(addr, salt);
  }
}
