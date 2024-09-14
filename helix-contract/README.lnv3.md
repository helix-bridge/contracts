
HelixBridge is a non-custodial cross-chain protocol based on order and liquidity.

In the HelixBridge cross-chain protocol, there are two key roles: the user and the market maker. The entire cross-chain process essentially involves an asset exchange between the market maker and the user.

* Market Maker (MM)
Also known as a relayer or liquidity provider, the market maker must register and stake a small amount of assets as collateral to take orders. MMs monitor the orders assigned to them and compete for orders based on their fees, historical transaction success rate, and other factors. The protocol or system only displays basic information about each MM, leaving the user to choose which MM to assign the order to.

During the market-making process, MMs do not need to stake large amounts of liquidity, and they aren’t required to hold significant liquidity upfront. However, once they are assigned an order, they must complete the transaction within the timeframe specified by the protocol.

* User
When initiating a cross-chain transfer, the user selects an MM to place the order. The MM’s staked assets serve as a penalty collateral to ensure the validity of the order. The protocol ensures that either the order is completed or the MM is slashed for timeout, so the user’s assets remain secure throughout the process.

### Order Execution Flow
1. The MM registers and stakes a small amount of assets on Chain A as a penalty collateral.
2. The user initiates a token transfer from Chain A to Chain B by selecting an MM and transferring their assets and fees to the protocol's smart contract. The protocol also locks the MM's collateral along with the user's assets.
3. The MM detects the generated order and transfers equivalent assets to the user on Chain B via the protocol interface, leaving a proof of transaction.
4. After completing the order, the MM can use the protocol on Chain B to send a cross-chain message back to Chain A with the transaction proof, allowing them to claim the locked assets (including the user’s transferred assets, fees, and collateral), thereby closing the order.
5. To save on cross-chain transaction fees, the MM may choose to batch multiple orders before executing the cross-chain message.
6. If the MM fails to complete the order (e.g., due to system failure or malicious intent), any participant can act as a slasher, transferring equivalent assets to the user on Chain B and sending a cross-chain message back to Chain A.
7. Once Chain A receives the slash message, the locked assets from step 2 are unlocked and released to the slasher. The slasher not only receives the equivalent assets transferred to the user but also earns the fees and the MM’s penalty collateral, completing the transaction loop.

The diagram below illustrates three different flows in HelixBridge Lnv3, along with the asset transfer paths involved:

1. The standard cross-chain process, where the user initiates an order → the MM completes the order.
2. An exception case, where the user initiates an order → the order times out → the slasher completes the order and earns a reward.
3. The MM claims the locked liquidity assets.
![image](https://github.com/helix-bridge/contracts/tree/master/helix-contract/img/lnv3.png)

### HelixBridge Features
* Decentralization
The protocol operates autonomously without the need for centralized services. Both market makers (MMs) and users can complete the entire transaction flow via the protocol itself. Asset locking and collateral staking mechanisms ensure the safety of funds for both parties.
* Message Decoupling (Low Latency, Low Cost)
In the interaction between users and MMs, cross-chain messaging is not required, meaning the order initiation and completion process is not affected by cross-chain message failures, delays, or costs. Cross-chain messages are only necessary in two scenarios:

1. When MMs withdraw locked liquidity.
2. When a slasher executes a slash transaction.

These scenarios do not require strict real-time performance, high availability, or low costs from the cross-chain messages. Therefore, to enhance security, the protocol can opt for more secure, albeit slower, cross-chain messaging services.
* Non-Custodial (Asset Security)
The MM's liquidity does not need to be staked within the protocol. In other words, the protocol does not custody user assets. During the transaction execution process, only the funds from uncompleted orders are temporarily locked in the protocol. These locked funds, referred to as in-flight assets, are relatively small in volume and have short lock-up periods. This approach makes the protocol safer in managing assets compared to custodial protocols.
* Composability
The liquidity comes from the MM’s own account, and submitting a transaction on the target chain to complete an order is simply a regular contract call. This contract call can be composed with various DeFi protocols without compromising the security of the HelixBridge protocol. For example, an MM can combine a safe wallet with the token authorization and payment process into a single atomic transaction to mitigate the risk of contract takeover attacks. Similarly, an MM can use liquidity from lending markets or DEX markets to fulfill an order without holding the required assets upfront.

