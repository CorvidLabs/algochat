//! Godot wrapper around the Rust AlgoChat crate.
//!
//! Everyday protocol 0x01, envelope version 0x02. The cryptography stays in
//! the `algochat` crate.

use algochat::{
    decrypt_message, derive_keys_from_seed, encrypt_message_v2, ChatEnvelope, PROTOCOL_ID,
    PROTOCOL_VERSION_V2,
};
use godot::prelude::*;
use x25519_dalek::PublicKey;

struct AlgoChatExtension;

#[gdextension]
unsafe impl ExtensionLibrary for AlgoChatExtension {}

/// Seals an everyday version 0x02 note. `sender_seed` and `recipient_public`
/// are each 32 bytes.
pub fn seal_everyday_note(
    plaintext: &str,
    sender_seed: &[u8],
    recipient_public: &[u8],
) -> Result<Vec<u8>, String> {
    let (sender_private, sender_public) =
        derive_keys_from_seed(sender_seed).map_err(|error| error.to_string())?;
    let recipient = public_key_from_bytes(recipient_public)?;
    let envelope = encrypt_message_v2(plaintext, &sender_private, &sender_public, &recipient)
        .map_err(|error| error.to_string())?;
    let note = envelope.encode();
    if note.len() < 2 || note[0] != PROTOCOL_VERSION_V2 || note[1] != PROTOCOL_ID {
        return Err("sealed note has the wrong header".to_string());
    }
    if note.len() > 4096 {
        return Err("sealed note exceeds 4096 bytes".to_string());
    }
    Ok(note)
}

/// Opens an everyday note with a 32-byte account seed.
pub fn open_everyday_note(note: &[u8], seed: &[u8]) -> Result<String, String> {
    let (private_key, public_key) = derive_keys_from_seed(seed).map_err(|error| error.to_string())?;
    let envelope = ChatEnvelope::decode(note).map_err(|error| error.to_string())?;
    match decrypt_message(&envelope, &private_key, &public_key).map_err(|error| error.to_string())? {
        Some(content) => Ok(content.text),
        None => Err("note is not a chat message".to_string()),
    }
}

/// X25519 encryption public key for a 32-byte seed.
pub fn encryption_public_key(seed: &[u8]) -> Result<[u8; 32], String> {
    let (_private_key, public_key) =
        derive_keys_from_seed(seed).map_err(|error| error.to_string())?;
    Ok(*public_key.as_bytes())
}

fn public_key_from_bytes(bytes: &[u8]) -> Result<PublicKey, String> {
    let array: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "recipient public key must be 32 bytes".to_string())?;
    Ok(PublicKey::from(array))
}

fn failure(error: &str) -> VarDictionary {
    vdict! {
        "ok" => false,
        "error" => error,
    }
}

#[derive(GodotClass)]
#[class(base = RefCounted)]
struct AlgoChat {
    base: Base<RefCounted>,
}

#[godot_api]
impl IRefCounted for AlgoChat {
    fn init(base: Base<RefCounted>) -> Self {
        Self { base }
    }
}

#[godot_api]
impl AlgoChat {
    /// Seals protocol 0x01, envelope version 0x02.
    #[func]
    fn seal_everyday(
        &self,
        plaintext: GString,
        sender_seed: PackedByteArray,
        recipient_public_key: PackedByteArray,
    ) -> VarDictionary {
        match seal_everyday_note(
            &plaintext.to_string(),
            &sender_seed.to_vec(),
            &recipient_public_key.to_vec(),
        ) {
            Ok(note) => {
                let packed = PackedByteArray::from(note.as_slice());
                vdict! {
                    "ok" => true,
                    "error" => "",
                    "note" => &packed,
                }
            }
            Err(error) => failure(&error),
        }
    }

    /// Opens an everyday note. The seed may be the sender or the recipient.
    #[func]
    fn open_everyday(&self, note: PackedByteArray, seed: PackedByteArray) -> VarDictionary {
        match open_everyday_note(&note.to_vec(), &seed.to_vec()) {
            Ok(text) => vdict! {
                "ok" => true,
                "error" => "",
                "text" => text.as_str(),
            },
            Err(error) => failure(&error),
        }
    }

    /// Returns 32 public-key bytes, or an empty array when the seed length is wrong.
    #[func]
    fn encryption_public_key(&self, seed: PackedByteArray) -> PackedByteArray {
        match encryption_public_key(&seed.to_vec()) {
            Ok(key) => PackedByteArray::from(key.as_slice()),
            Err(_) => PackedByteArray::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{encryption_public_key, open_everyday_note, seal_everyday_note};

    #[test]
    fn round_trip_and_flipped_byte() {
        let alice = [0x11_u8; 32];
        let bob = [0x22_u8; 32];
        let bob_public = encryption_public_key(&bob).unwrap();
        let note = seal_everyday_note("hello from godot", &alice, &bob_public).unwrap();
        assert_eq!(&note[..2], &[0x02, 0x01]);
        assert_eq!(
            open_everyday_note(&note, &bob).unwrap(),
            "hello from godot"
        );
        assert_eq!(
            open_everyday_note(&note, &alice).unwrap(),
            "hello from godot"
        );
        let mut flipped = note.clone();
        let last = flipped.len() - 1;
        flipped[last] ^= 0x01;
        assert!(open_everyday_note(&flipped, &bob).is_err());
    }

    #[test]
    fn rejects_short_keys() {
        assert!(seal_everyday_note("x", &[0x11; 31], &[0x22; 32]).is_err());
        assert!(seal_everyday_note("x", &[0x11; 32], &[0x22; 31]).is_err());
        assert!(encryption_public_key(&[0x11; 31]).is_err());
    }
}
