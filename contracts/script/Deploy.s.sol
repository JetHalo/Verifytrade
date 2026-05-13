// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {Competition} from "../src/Competition.sol";
import {MockZkVerify} from "../src/MockZkVerify.sol";

/// @notice Deploy script for VerifyTrade Competition.
///         Set the ZK_VERIFY_ATTESTOR env var to the real attestor address;
///         if unset, deploys MockZkVerify (for local / first-PoC testnet runs).
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPk);

        address zkv;
        try vm.envAddress("ZK_VERIFY_ATTESTOR") returns (address a) {
            zkv = a;
        } catch {
            console.log("ZK_VERIFY_ATTESTOR not set; deploying MockZkVerify");
            zkv = address(new MockZkVerify());
        }

        Competition c = new Competition(zkv);
        console.log("zkVerifyAttestor:", zkv);
        console.log("Competition:    ", address(c));

        vm.stopBroadcast();
    }
}
