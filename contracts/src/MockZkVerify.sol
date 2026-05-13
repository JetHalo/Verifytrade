// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IZkVerifyAttestor} from "./interfaces/IZkVerifyAttestor.sol";

/// @notice Mock zkVerify attestor for local development & tests.
///         Owner pre-registers (attestationId → publicInputDigest) pairs;
///         verifyAttestation returns true iff the digest matches.
///         DO NOT use in production.
contract MockZkVerify is IZkVerifyAttestor {
    address public immutable owner;
    mapping(bytes32 => bytes32) public registeredDigests;

    constructor() {
        owner = msg.sender;
    }

    function registerAttestation(bytes32 attestationId, bytes32 publicInputDigest) external {
        require(msg.sender == owner, "MockZkVerify: not owner");
        registeredDigests[attestationId] = publicInputDigest;
    }

    function verifyAttestation(
        bytes32 attestationId,
        bytes32 publicInputDigest
    ) external view override returns (bool ok) {
        return registeredDigests[attestationId] == publicInputDigest &&
               publicInputDigest != bytes32(0);
    }
}
