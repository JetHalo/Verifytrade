// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface for zkVerify's cross-chain attestor.
///         The actual contract is deployed by zkVerify on supported destination chains.
///         We use the standardised attestation pattern: an attestation ID corresponds
///         to a proof that zkVerify has independently verified.
interface IZkVerifyAttestor {
    /// @notice Verify that an attestation exists and is associated with the given public input digest.
    /// @param attestationId The opaque attestation reference returned by zkVerify after verification
    /// @param publicInputDigest Keccak hash of the proof's public inputs (must match what was submitted)
    /// @return ok true if the attestation is valid and matches the digest
    function verifyAttestation(
        bytes32 attestationId,
        bytes32 publicInputDigest
    ) external view returns (bool ok);
}
