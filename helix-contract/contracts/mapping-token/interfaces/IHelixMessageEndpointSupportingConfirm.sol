// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IHelixMessageEndpoint.sol";

interface IHelixMessageEndpointSupportingConfirm is IHelixMessageEndpoint {
    function lastDeliveredMessageId() external view returns (uint256);
}
