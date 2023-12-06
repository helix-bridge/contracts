// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@zeppelin-solidity/contracts/security/Pausable.sol";
import "./LnAccessController.sol";
import "./TokenTransferHelper.sol";

/// @title LnBridgeSourceV1
/// @notice LnBridgeSourceV1 is a contract to help user lock token and then trigger remote chain relay
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnBridgeSourceV3 is Pausable, LnAccessController {
    uint256 constant public SLASH_EXPIRE_TIME = 60 * 60;
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    // liquidity fee base rate
    // liquidityFee = liquidityFeeRate / LIQUIDITY_FEE_RATE_BASE * sendAmount
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
    uint8 constant public LOCK_STATUS_LOCKED = 1;
    uint8 constant public LOCK_STATUS_WITHDRAWN = 2;
    uint8 constant public LOCK_STATUS_SLASHED = 3;
    // the configure infomation can be updated
    struct TokenConfigure {
        uint112 protocolFee;
        uint112 penalty;
        uint8 sourceDecimals;
        uint8 targetDecimals;
    }
    // registered token info
    struct TokenInfo {
        TokenConfigure config;
        // zero index is invalid
        uint32 index;
        address sourceToken;
        address targetToken;
        uint256 protocolFeeIncome;
    }
    struct TransferParams {
        uint256 remoteChainId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 totalFee;
        uint112 amount;
        address receiver;
    }
    // hash(remoteChainId, sourceToken, targetToken) => TokenInfo
    mapping(bytes32=>TokenInfo) public tokenInfos;
    // the token index is used to be stored in lockInfo to save gas
    mapping(uint32=>bytes32) public tokenIndexer;
    // amountWithFeeAndPenalty = transferAmount + providerFee + penalty < type(uint112).max
    // status == 0: lockInfo not exist
    // status == 1: lockInfo confirmed on source chain(has not been withdrawn or slashed)
    // status == 2: lockInfo has been withdrawn
    // status == 3: lockInfo has been slashed
    // we don't clean lockInfo after withdraw or slash to avoid the hash collision(generate the same transferId)
    struct LockInfo {
        uint112 amountWithFeeAndPenalty;
        uint64 timestamp;
        uint32 tokenIndex;
        uint8 status;
    }
    // transferId => LockInfo
    mapping(bytes32 => LockInfo) public lockInfos;

    struct SourceProviderInfo {
        uint112 baseFee;
        uint16 liquidityFeeRate;
        uint112 transferLimit;
        bool pause;
    }
    struct SourceProviderState {
        uint112 penaltyReserve;
        uint64 nonce;
    }

    // hash(remoteChainId, provider, sourceToken, targetToken) => SourceProviderInfo
    mapping(bytes32=>SourceProviderInfo) public srcProviders;
    // for a special source token, all the path start from this chain use the same panaltyReserve
    // hash(sourceToken, provider) => SourceProviderState
    mapping(bytes32=>SourceProviderState) public srcProviderStates;

    event TokenRegistered(
        bytes32 key,
        uint256 remoteChainId,
        address sourceToken,
        address targetToken,
        uint112 protocolFee,
        uint112 penalty,
        uint32 index
    );
    event TokenInfoUpdated(bytes32 tokenInfoKey, uint112 protocolFee, uint112 penalty, uint112 sourceDecimals, uint112 targetDecimals);
    event FeeIncomeClaimed(bytes32 tokenInfoKey, uint256 amount, address receiver);
    event TokenLocked(
        TransferParams params,
        bytes32 transferId,
        uint64 nonce,
        uint112 targetAmount,
        uint112 fee,
        uint64  timestamp
    );
    event LnProviderUpdated(
        uint256 remoteChainId,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 baseFee,
        uint16 liquidityfeeRate
    );
    event PenaltyReserveUpdated(address provider, address sourceToken, uint112 updatedPanaltyReserve);
    event LiquidityWithdrawn(bytes32 transferId, address provider, uint112 amount);
    event TransferSlashed(bytes32 transferId, address provider, address slasher, uint112 slashAmount);
    event LnProviderPaused(address provider, uint256 remoteChainId, address sourceToken, address targetToken,  bool paused);

    modifier allowRemoteCall(uint256 _remoteChainId) {
        _verifyRemote(_remoteChainId);
        _;
    }

    function _verifyRemote(uint256 _remoteChainId) internal virtual {}

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }

    function registerTokenInfo(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penalty,
        uint8 _sourceDecimals,
        uint8 _targetDecimals,
        uint32 _index
    ) onlyDao external {
        require(_index > 0, "invalid index");
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory oldInfo = tokenInfos[key];
        require(oldInfo.index == 0, "token info exist");
        require(tokenIndexer[_index] == bytes32(0), "the index exist");
        TokenConfigure memory tokenConfig = TokenConfigure(
            _protocolFee,
            _penalty,
            _sourceDecimals,
            _targetDecimals
        );
        tokenInfos[key] = TokenInfo(
            tokenConfig,
            _index,
            _sourceToken,
            _targetToken,
            0
        );
        tokenIndexer[_index] = key;
        emit TokenRegistered(key, _remoteChainId, _sourceToken, _targetToken, _protocolFee, _penalty, _index);
    }

    function updateTokenInfo(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penalty,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) onlyDao external {
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        tokenInfos[key].config = TokenConfigure(
            _protocolFee,
            _penalty,
            _sourceDecimals,
            _targetDecimals
        );
        emit TokenInfoUpdated(key, _protocolFee, _penalty, _sourceDecimals, _targetDecimals);
    }

    // This interface should be called with exceptional caution, only when correcting registration errors, to conserve index resources.
    function deleteTokenInfo(bytes32 key) onlyDao external {
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        require(tokenIndexer[tokenInfo.index] == key, "indexer exception");
        delete tokenInfos[key];
        delete tokenIndexer[tokenInfo.index];
    }

    function claimProtocolFeeIncome(
        bytes32 _tokenInfoKey,
        uint256 _amount,
        address _receiver
    ) onlyDao external {
        TokenInfo memory tokenInfo = tokenInfos[_tokenInfoKey];
        require(tokenInfo.protocolFeeIncome > _amount, "not enough income");
        tokenInfos[_tokenInfoKey].protocolFeeIncome = tokenInfo.protocolFeeIncome - _amount;
        
        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(msg.sender, _amount);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _receiver, _amount);
        }
        emit FeeIncomeClaimed(_tokenInfoKey, _amount, _receiver);
    }

    function registerLnProvider(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _baseFee,
        uint16 _liquidityFeeRate,
        uint112 _transferLimit
    ) external {
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);

        require(_liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "liquidity fee too large");
        SourceProviderInfo memory providerInfo = srcProviders[providerKey];
        providerInfo.baseFee = _baseFee;
        providerInfo.liquidityFeeRate = _liquidityFeeRate;
        providerInfo.transferLimit = _transferLimit;

        // we only update the field fee of the provider info
        // if the provider has not been registered, then this line will register, otherwise update fee
        srcProviders[providerKey] = providerInfo;

        emit LnProviderUpdated(_remoteChainId, msg.sender, _sourceToken, _targetToken, _baseFee, _liquidityFeeRate);
    }

    function depositPenaltyReserve(
        address _sourceToken,
        uint112 _amount
    ) external payable {
        bytes32 key = getProviderStateKey(_sourceToken, msg.sender);
        uint112 updatedPanaltyReserve = srcProviderStates[key].penaltyReserve + _amount;
        srcProviderStates[key].penaltyReserve = updatedPanaltyReserve;

        if (_sourceToken == address(0)) {
            require(msg.value == _amount, "invalid penaltyReserve value");
        } else {
            require(msg.value == 0, "value not need");
            TokenTransferHelper.safeTransferFrom(
                _sourceToken,
                msg.sender,
                address(this),
                _amount
            );
        }
        emit PenaltyReserveUpdated(msg.sender, _sourceToken, updatedPanaltyReserve);
    }

    function withdrawPenaltyReserve(
        address _sourceToken,
        uint112 _amount
    ) external {
        bytes32 key = getProviderStateKey(_sourceToken, msg.sender);
        uint112 updatedPanaltyReserve = srcProviderStates[key].penaltyReserve - _amount;
        srcProviderStates[key].penaltyReserve = updatedPanaltyReserve;

        if (_sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(msg.sender, _amount);
        } else {
            TokenTransferHelper.safeTransfer(_sourceToken, msg.sender, _amount);
        }
        emit PenaltyReserveUpdated(msg.sender, _sourceToken, updatedPanaltyReserve);
    }

    function providerPause(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken
    ) external {
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);
        srcProviders[providerKey].pause = true;
        emit LnProviderPaused(msg.sender, _remoteChainId, _sourceToken, _targetToken, true);
    }

    function providerUnpause(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken
    ) external {
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);
        srcProviders[providerKey].pause = false;
        emit LnProviderPaused(msg.sender, _remoteChainId, _sourceToken, _targetToken, false);
    }

    function totalFee(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _amount
    ) external view returns(uint112) {
        TokenInfo memory tokenInfo = getTokenInfo(_remoteChainId, _sourceToken, _targetToken);
        SourceProviderInfo memory providerInfo = getProviderInfo(_remoteChainId, _provider, _sourceToken, _targetToken);
        uint256 providerFee = uint256(providerInfo.baseFee) +  uint256(providerInfo.liquidityFeeRate) * uint256(_amount) / LIQUIDITY_FEE_RATE_BASE;
        require(providerFee < type(uint112).max, "overflow fee");
        return uint112(providerFee) + tokenInfo.config.protocolFee;
    }

    function lockAndRemoteRelease(TransferParams calldata _params) whenNotPaused external payable {
        // check transfer info
        bytes32 tokenKey = getTokenKey(_params.remoteChainId, _params.sourceToken, _params.targetToken);
        TokenInfo memory tokenInfo = tokenInfos[tokenKey];
        SourceProviderInfo memory providerInfo = getProviderInfo(_params.remoteChainId, _params.provider, _params.sourceToken, _params.targetToken);
        require(providerInfo.transferLimit >= _params.amount && _params.amount > 0, "invalid transfer amount");
        uint256 providerFee = uint256(providerInfo.baseFee) +  uint256(providerInfo.liquidityFeeRate) * uint256(_params.amount) / LIQUIDITY_FEE_RATE_BASE;
        require(providerFee < type(uint112).max, "overflow fee");
        uint112 amountWithFeeAndPenalty = _params.amount + uint112(providerFee) + tokenInfo.config.penalty;
        require(_params.totalFee >= providerFee + tokenInfo.config.protocolFee, "fee not matched");

        // update provider state
        bytes32 stateKey = getProviderStateKey(_params.sourceToken, _params.provider);
        SourceProviderState memory providerState  = srcProviderStates[stateKey];
        require(providerState.penaltyReserve >= tokenInfo.config.penalty, "penalty reserve not enough");
        providerState.penaltyReserve -= tokenInfo.config.penalty;
        providerState.nonce += 1;
        srcProviderStates[stateKey] = providerState;
        emit PenaltyReserveUpdated(_params.provider, _params.sourceToken, providerState.penaltyReserve);

        // save lock info
        uint256 remoteAmount = uint256(_params.amount) * 10**tokenInfo.config.targetDecimals / 10**tokenInfo.config.sourceDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT, "overflow amount");
        bytes32 transferId = getTransferId(_params, providerState.nonce, uint112(remoteAmount));
        require(lockInfos[transferId].status == 0, "transferId exist");
        lockInfos[transferId] = LockInfo(amountWithFeeAndPenalty, uint64(block.timestamp), tokenInfo.index, LOCK_STATUS_LOCKED);
        emit TokenLocked(_params, transferId, providerState.nonce, uint112(remoteAmount), uint112(providerFee), uint64(block.timestamp));

        // update protocol fee income
        // leave the protocol fee into contract, and admin can withdraw this fee anytime
        tokenInfos[tokenKey].protocolFeeIncome = tokenInfo.protocolFeeIncome + tokenInfo.config.protocolFee;

        // transfer token
        uint112 totalPayAmount = _params.amount + uint112(providerFee) + tokenInfo.config.protocolFee;
        if (_params.sourceToken == address(0)) {
            require(msg.value >= totalPayAmount, "value not enough");
            if (msg.value > totalPayAmount) {
                // refund
                TokenTransferHelper.safeTransferNative(msg.sender, msg.value - totalPayAmount);
            }
        } else {
            require(msg.value == 0, "no value need");
            TokenTransferHelper.safeTransferFrom(_params.sourceToken, msg.sender, address(this), totalPayAmount);
        }
    }

    // we require the same token to withdrawn
    function withdrawLiquidity(
        bytes32[] calldata _transferIds,
        uint256 _remoteChainId,
        // provider is verified on the target chain
        address _provider
    ) external allowRemoteCall(_remoteChainId) {
        require(_transferIds.length > 0, "invalid transferIds size");
        uint32 tokenIndex = lockInfos[_transferIds[0]].tokenIndex;
        uint256 totalAmount = 0;
        for (uint i = 0; i < _transferIds.length; i++) {
            bytes32 transferId = _transferIds[i];
            LockInfo memory lockInfo = lockInfos[transferId];
            require(lockInfo.amountWithFeeAndPenalty > 0, "invalid transferId");
            require(lockInfo.tokenIndex == tokenIndex, "token index not matched");
            require(lockInfo.status == LOCK_STATUS_LOCKED, "token has been withdrawn");

            totalAmount += lockInfo.amountWithFeeAndPenalty;
            lockInfos[transferId].status = LOCK_STATUS_WITHDRAWN;
            emit LiquidityWithdrawn(transferId, _provider, lockInfo.amountWithFeeAndPenalty);
        }
        bytes32 key = tokenIndexer[tokenIndex];
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index == tokenIndex, "invalid token info");

        uint256 withdrawAmount = totalAmount;
        // if penalty updated, the relayer may not redeposit
        if (tokenInfo.config.penalty * _transferIds.length < withdrawAmount) {
            // restore the penalty reserve
            uint112 redepositPenalty = tokenInfo.config.penalty * uint112(_transferIds.length);
            bytes32 stateKey = getProviderStateKey(tokenInfo.sourceToken, _provider);
            SourceProviderState memory providerState  = srcProviderStates[stateKey];
            providerState.penaltyReserve += redepositPenalty;
            srcProviderStates[stateKey].penaltyReserve = providerState.penaltyReserve;
            withdrawAmount -= redepositPenalty;
            emit PenaltyReserveUpdated(_provider, tokenInfo.sourceToken, providerState.penaltyReserve);
        }

        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_provider, withdrawAmount);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _provider, withdrawAmount);
        }
    }

    function slash(
        uint256 _remoteChainId,
        bytes32 _transferId,
        // slasher, amount and lnProvider is verified on the target chain
        uint112 _sourceAmount,
        address _lnProvider,
        uint64 _timestamp,
        address _slasher
    ) external allowRemoteCall(_remoteChainId) {
        LockInfo memory lockInfo = lockInfos[_transferId];
        require(lockInfo.status == LOCK_STATUS_LOCKED, "invalid lock status");
        require(lockInfo.amountWithFeeAndPenalty >= _sourceAmount, "invalid amount");
        bytes32 tokenKey = tokenIndexer[lockInfo.tokenIndex];
        TokenInfo memory tokenInfo = tokenInfos[tokenKey];
        lockInfos[_transferId].status = LOCK_STATUS_SLASHED;

        uint112 slashAmount = _sourceAmount;
        // recheck the timestamp
        // expired
        if (_timestamp == lockInfo.timestamp && lockInfo.timestamp + SLASH_EXPIRE_TIME < block.timestamp) {
            slashAmount = lockInfo.amountWithFeeAndPenalty;
            // pause this provider if slashed
            bytes32 providerKey = getProviderKey(_remoteChainId, _lnProvider, tokenInfo.sourceToken, tokenInfo.targetToken);
            srcProviders[providerKey].pause = true;
            emit LnProviderPaused(_lnProvider, _remoteChainId, tokenInfo.sourceToken, tokenInfo.targetToken, true);
        } else {
            // this means the slasher help the provider relay message and get no reward
            // redeposit penalty(the fee and penalty) for lnProvider
            bytes32 key = getProviderStateKey(tokenInfo.sourceToken, _lnProvider);
            uint112 updatedPanaltyReserve = srcProviderStates[key].penaltyReserve + lockInfo.amountWithFeeAndPenalty - slashAmount;
            srcProviderStates[key].penaltyReserve = updatedPanaltyReserve;
        }
        // transfer slashAmount to slasher
        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_slasher, slashAmount);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _slasher, slashAmount);
        }
        emit TransferSlashed(_transferId, _lnProvider, _slasher, slashAmount);
    }

    function getProviderKey(uint256 _remoteChainId, address _provider, address _sourceToken, address _targetToken) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_remoteChainId, _provider, _sourceToken, _targetToken));
    }

    function getTokenKey(uint256 _remoteChainId, address _sourceToken, address _targetToken) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_remoteChainId, _sourceToken, _targetToken));
    }

    function getProviderStateKey(address _sourceToken, address provider) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_sourceToken, provider));
    }

    function getTransferId(
        TransferParams memory _params,
        uint64 _nonce,
        uint112 _remoteAmount
    ) public view returns(bytes32) {
        return keccak256(abi.encodePacked(
            _nonce,
            block.chainid,
            _params.remoteChainId,
            _params.provider,
            _params.sourceToken,
            _params.targetToken,
            _params.receiver,
            _params.amount,
            _remoteAmount));
    }

    function getTokenInfo(uint256 _remoteChainId, address _sourceToken, address _targetToken) view internal returns(TokenInfo memory) {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _sourceToken, _targetToken));
        return tokenInfos[key];
    }

    function getProviderInfo(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken
    ) view internal returns(SourceProviderInfo memory) {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _provider, _sourceToken, _targetToken));
        return srcProviders[key];
    }
}

