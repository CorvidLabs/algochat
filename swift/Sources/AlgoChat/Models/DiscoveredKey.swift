@preconcurrency import Crypto
import Foundation

/**
 Result of discovering a user's encryption public key

 Contains the key itself along with metadata about how it was verified.
 */
public struct DiscoveredKey: Sendable {
    /// The X25519 public key for encryption
    public let publicKey: Curve25519.KeyAgreement.PublicKey

    /**
     Whether this key was cryptographically verified

     A verified key has a valid appended Ed25519 signature over the X25519
     key, checked against the account address. The signed announcement uses
     an ordinary envelope, not a separate V3 format.

     An unverified key has no valid appended signature established by this
     discovery path and should be verified out of band for sensitive use.
     */
    public let isVerified: Bool

    /**
     Creates a discovered key result

     - Parameters:
       - publicKey: The X25519 public key
       - isVerified: Whether the key was cryptographically verified
     */
    public init(publicKey: Curve25519.KeyAgreement.PublicKey, isVerified: Bool) {
        self.publicKey = publicKey
        self.isVerified = isVerified
    }
}
