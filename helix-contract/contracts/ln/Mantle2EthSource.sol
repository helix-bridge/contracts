// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeSource.sol";
import "./interface/ICrossDomainMessenger.sol";

contract Mantle2EthSource is Initializable, LnAccessController, LnOppositeBridgeSource {
    address public remoteBridge;
    address constant public crossDomainMessenger = 0x4200000000000000000000000000000000000007;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == crossDomainMessenger, "invalid msg.sender");
        require(msg.sender == ICrossDomainMessenger(crossDomainMessenger).xDomainMessageSender(), "invalid remote caller");
        _;
    }

    function initialize(address _dao) public initializer {
        _initialize(_dao);
        _setFeeReceiver(_dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function updateProtocolFee(address token, uint112 _protocolFee) external onlyDao {
        _updateProtocolFee(token, _protocolFee);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function registerToken(
        address sourceToken,
        address targetToken,
        uint112 protocolFee,
        uint112 penaltyLnCollateral,
        uint8 sourceDecimals,
        uint8 targetDecimals
    ) external onlyOperator {
        _registerToken(sourceToken, targetToken, protocolFee, penaltyLnCollateral, sourceDecimals, targetDecimals);
    }

    function slash(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address provider,
        address sourceToken,
        address slasher
    ) external onlyRemoteBridge whenNotPaused {
        _slash(latestSlashTransferId, transferId, sourceToken, provider, slasher);
    }

    function withdrawMargin(
        bytes32 latestSlashTransferId,
        bytes32 lastTransferId,
        address provider,
        address sourceToken,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdrawMargin(latestSlashTransferId, lastTransferId, provider, sourceToken, amount);
    }
}

