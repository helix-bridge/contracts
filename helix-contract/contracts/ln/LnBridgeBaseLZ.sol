// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeSource.sol";
import "./base/LnDefaultBridgeTarget.sol";
import "./interface/ILayerZeroEndpoint.sol";

contract LnBridgeBaseLZ is Initializable, LnAccessController, LnDefaultBridgeSource, LnDefaultBridgeTarget {
    ILayerZeroEndpoint public endpoint;
    address public remoteBridge;
    bytes32 public trustedRemote;
    uint16 public remoteChainId;

    event WithdrawMargin(address sourceToken, uint112 amount);
    event CallResult(bytes srcAddress, bool successed);

    receive() external payable {}

    modifier onlyRemoteBridge(bytes calldata srcAddress) {
        require(msg.sender == address(endpoint), "invalid caller");
        require(trustedRemote == keccak256(srcAddress), "invalid remote caller");
        _;
    }

    function initialize(address _dao, address _endpoint, uint16 _remoteChainId) public initializer {
        _initialize(_dao);
        endpoint = ILayerZeroEndpoint(_endpoint);
        _setFeeReceiver(_dao);
        remoteChainId = _remoteChainId;
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
        trustedRemote = keccak256(abi.encodePacked(_remoteBridge, address(this)));
    }

    function setTokenInfo(
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penaltyLnCollateral,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) external onlyDao {
        _setTokenInfo(
            _sourceToken,
            _targetToken,
            _protocolFee,
            _penaltyLnCollateral,
            _sourceDecimals,
            _targetDecimals
        );
    }

    function estimateSlashFee(
        TransferParameter calldata params
    ) external view returns(uint256 nativeFee, uint256 zroFee) {
        bytes memory slashCallMessage = _encodeSlashCall(
           params,
           msg.sender,
           0,
           0
        );
        return endpoint.estimateFees(
            remoteChainId,
            remoteBridge,
            slashCallMessage,
            false,
            bytes("")
        );
    }

    function estimateWithdrawFee(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) external view returns(uint256 nativeFee, uint256 zroFee) {
        bytes memory withdrawCallMessage = _encodeWithdrawCall(
            lastTransferId,
            withdrawNonce,
            provider,
            sourceToken,
            targetToken,
            amount
        );
        return endpoint.estimateFees(
            remoteChainId,
            remoteBridge,
            withdrawCallMessage,
            false,
            bytes("")
        );
    }

    function _sendMessage(
        bytes memory message,
        uint256 prepaid
    ) internal {
        bytes memory destination = abi.encodePacked(
            remoteBridge,
            address(this)
        );
        endpoint.send{ value: prepaid }(
            remoteChainId,
            destination,
            message,
            payable(msg.sender),
            // zro payment, future parameter
            address(0x0),
            bytes("")
        );
    }

    function slashAndRemoteRelease(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) payable external whenNotPaused {
        bytes memory slashCallMessage = _slashAndRemoteRelease(
           params,
           expectedTransferId
        );
        _sendMessage(slashCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        address sourceToken,
        uint112 amount
    ) payable external whenNotPaused {
        bytes memory withdrawCallMessage = _withdrawMargin(
            sourceToken,
            amount
        );
        _sendMessage(withdrawCallMessage, msg.value);
        emit WithdrawMargin(sourceToken, amount);
    }

    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64, //nonce unused
        bytes calldata _payload) onlyRemoteBridge(_srcAddress) whenNotPaused external {
        require(_srcChainId == remoteChainId, "invalid src chainid");
        // call
        (bool success,) = address(this).call(_payload);
        // don't revert to prevent message block
        emit CallResult(_srcAddress, success);
    }

    function slash(
        TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) external {
        require(msg.sender == address(this), "only self");
        _slash(
          params,
          slasher,
          fee,
          penalty
        );
    }

    function withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) external {
        require(msg.sender == address(this), "only self");
        _withdraw(lastTransferId, withdrawNonce, provider, sourceToken, targetToken, amount);
    }
}

