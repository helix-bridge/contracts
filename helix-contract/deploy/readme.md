1. deploy backing(helixHandler+backing) on chain A

2. deploy issuing(helixHandler+mapping-token-factory) on chain B

3. call helixHandler.setBridgeInfo to relate two helixHandler contracts

4. call helixHandler.grantRole to allow call by backing/issuing

5. call backing.setRemoteMappingTokenFactory to set mtf address

6. call mtf.setRemoteBacking to set backing address
