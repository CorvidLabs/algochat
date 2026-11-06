//! Algorand 25-word phrases and Ed25519 AlgoChat accounts (REQ-protocol-11, #73).
//!
//! A phrase is exactly 25 lowercase words from [`MNEMONIC_WORDS`] separated by
//! single spaces. The first 24 words carry the 32-byte entropy, packed as
//! algosdk packs them (11-bit groups, least significant bits first, with 8
//! zero padding bits). Word 25 is the checksum word taken from SHA-512/256 of
//! the entropy. Anything else is rejected: there is no trimming, case folding
//! or other whitespace. Apps may normalize what a user types before calling in.
//!
//! The entropy derives the Ed25519 signing key and Algorand address (as
//! algosdk `mnemonicToSecretKey` does), the X25519 encryption keys and the
//! ML-KEM-768 keys (as TypeScript `createChatAccountFromMnemonic` and
//! `deriveMLKEMKeyPair` do).
//!
//! Ed25519 only. TypeScript can also make a Falcon-1024 account from the same
//! words, and that account has a different address. A phrase does not say
//! which scheme made it, so restoring a Falcon phrase here gives the Ed25519
//! address of those words (with the same encryption keys). Falcon is #69.

use ed25519_dalek::SigningKey;
use rand::RngCore;
use sha2::{Digest, Sha512_256};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

use crate::keys::derive_keys_from_seed;
pub use crate::mnemonic_words::MNEMONIC_WORDS;
use crate::pq::{derive_mlkem768, MlkemKeys};
use crate::types::{AlgoChatError, Result};

/// Number of words in an Algorand phrase.
pub const MNEMONIC_WORD_COUNT: usize = 25;

const KEY_WORDS: usize = 24;

fn invalid(reason: &'static str) -> AlgoChatError {
    AlgoChatError::InvalidMnemonic(reason)
}

fn word_index(word: &str) -> Option<usize> {
    MNEMONIC_WORDS
        .iter()
        .position(|candidate| *candidate == word)
}

/// Packs bytes into 11-bit values, least significant bits first (algosdk `toUint11Array`).
fn to_u11(bytes: &[u8]) -> Vec<u16> {
    let mut out = Vec::with_capacity(bytes.len() * 8 / 11 + 1);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for byte in bytes {
        acc |= u32::from(*byte) << bits;
        bits += 8;
        if bits >= 11 {
            out.push((acc & 0x7ff) as u16);
            acc >>= 11;
            bits -= 11;
        }
    }
    if bits > 0 {
        out.push(acc as u16);
    }
    out
}

fn checksum_word(entropy: &[u8; 32]) -> &'static str {
    let hash = Sha512_256::digest(entropy);
    MNEMONIC_WORDS[usize::from(to_u11(&hash[..2])[0])]
}

/// Encodes 32 bytes of entropy as its 25-word phrase.
pub fn entropy_to_mnemonic(entropy: &[u8; 32]) -> Zeroizing<String> {
    let indexes = Zeroizing::new(to_u11(entropy));
    let mut phrase = Zeroizing::new(String::with_capacity(MNEMONIC_WORD_COUNT * 9));
    for index in indexes.iter() {
        phrase.push_str(MNEMONIC_WORDS[usize::from(*index)]);
        phrase.push(' ');
    }
    phrase.push_str(checksum_word(entropy));
    phrase
}

/// Decodes a 25-word phrase to its 32 bytes of entropy.
///
/// The error says what is wrong but never repeats the phrase or a word.
pub fn mnemonic_to_entropy(phrase: &str) -> Result<Zeroizing<[u8; 32]>> {
    let words: Vec<&str> = phrase.split(' ').collect();
    if words.len() != MNEMONIC_WORD_COUNT {
        return Err(invalid("expected 25 words separated by single spaces"));
    }
    let mut packed = Zeroizing::new([0u8; 33]);
    let mut acc: u32 = 0;
    let mut bits = 0;
    let mut at = 0;
    for word in &words[..KEY_WORDS] {
        let index = word_index(word).ok_or_else(|| invalid("a word is not in the wordlist"))?;
        acc |= (index as u32) << bits;
        bits += 11;
        while bits >= 8 {
            packed[at] = (acc & 0xff) as u8;
            at += 1;
            acc >>= 8;
            bits -= 8;
        }
    }
    debug_assert_eq!((at, bits), (33, 0));
    if packed[32] != 0 {
        return Err(invalid("the 24th word has nonzero padding bits"));
    }
    let mut entropy = Zeroizing::new([0u8; 32]);
    entropy.copy_from_slice(&packed[..32]);
    if word_index(words[KEY_WORDS]).is_none() {
        return Err(invalid("a word is not in the wordlist"));
    }
    if words[KEY_WORDS] != checksum_word(&entropy) {
        return Err(invalid("the checksum word does not match"));
    }
    Ok(entropy)
}

/// Returns true if `phrase` is a valid 25-word Algorand phrase.
pub fn validate_mnemonic(phrase: &str) -> bool {
    mnemonic_to_entropy(phrase).is_ok()
}

/// Returns the Algorand address of an Ed25519 public key.
pub fn algorand_address(public_key: &[u8; 32]) -> String {
    let hash = Sha512_256::digest(public_key);
    let mut full = [0u8; 36];
    full[..32].copy_from_slice(public_key);
    full[32..].copy_from_slice(&hash[hash.len() - 4..]);
    data_encoding::BASE32_NOPAD.encode(&full)
}

/// An Ed25519 AlgoChat account and the keys its phrase derives.
///
/// `Debug` shows the address and public keys only. The signing, X25519 and
/// ML-KEM secrets are not printed.
pub struct Ed25519ChatAccount {
    address: String,
    signing_key: SigningKey,
    encryption_private_key: StaticSecret,
    encryption_public_key: PublicKey,
    mlkem768: MlkemKeys,
}

impl Ed25519ChatAccount {
    fn from_entropy(entropy: &[u8; 32]) -> Result<Self> {
        let signing_key = SigningKey::from_bytes(entropy);
        let address = algorand_address(&signing_key.verifying_key().to_bytes());
        let (encryption_private_key, encryption_public_key) = derive_keys_from_seed(entropy)?;
        let mlkem768 = derive_mlkem768(entropy)?;
        Ok(Self {
            address,
            signing_key,
            encryption_private_key,
            encryption_public_key,
            mlkem768,
        })
    }

    /// The Algorand address.
    pub fn address(&self) -> &str {
        &self.address
    }

    /// The Ed25519 key that signs this account's transactions.
    pub fn signing_key(&self) -> &SigningKey {
        &self.signing_key
    }

    /// The Ed25519 public key.
    pub fn ed25519_public_key(&self) -> [u8; 32] {
        self.signing_key.verifying_key().to_bytes()
    }

    /// The X25519 encryption private key.
    pub fn encryption_private_key(&self) -> &StaticSecret {
        &self.encryption_private_key
    }

    /// The X25519 encryption public key.
    pub fn encryption_public_key(&self) -> &PublicKey {
        &self.encryption_public_key
    }

    /// The ML-KEM-768 keys.
    pub fn mlkem768_keys(&self) -> &MlkemKeys {
        &self.mlkem768
    }

    /// The ML-KEM-768 encapsulation key.
    pub fn mlkem768_encapsulation_key(&self) -> &[u8] {
        &self.mlkem768.encaps_key
    }
}

impl std::fmt::Debug for Ed25519ChatAccount {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Ed25519ChatAccount")
            .field("address", &self.address)
            .field(
                "ed25519_public_key",
                &hex::encode(self.ed25519_public_key()),
            )
            .field(
                "encryption_public_key",
                &hex::encode(self.encryption_public_key.as_bytes()),
            )
            .finish_non_exhaustive()
    }
}

/// Restores an Ed25519 account from its 25-word phrase.
pub fn restore_ed25519_account(phrase: &str) -> Result<Ed25519ChatAccount> {
    let entropy = mnemonic_to_entropy(phrase)?;
    Ed25519ChatAccount::from_entropy(&entropy)
}

/// Creates a new Ed25519 account from operating-system randomness and returns it with its phrase.
///
/// Show the phrase only to its owner; never log it.
pub fn create_random_ed25519_account() -> Result<(Ed25519ChatAccount, Zeroizing<String>)> {
    let mut entropy = Zeroizing::new([0u8; 32]);
    rand::rngs::OsRng
        .try_fill_bytes(entropy.as_mut())
        .map_err(|_| AlgoChatError::RandomGenerationFailed)?;
    let account = Ed25519ChatAccount::from_entropy(&entropy)?;
    Ok((account, entropy_to_mnemonic(&entropy)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ENTROPY: [u8; 32] = [7u8; 32];

    #[test]
    fn round_trips_entropy() {
        let phrase = entropy_to_mnemonic(&ENTROPY);
        assert_eq!(phrase.split(' ').count(), MNEMONIC_WORD_COUNT);
        assert_eq!(*mnemonic_to_entropy(&phrase).expect("decode"), ENTROPY);
    }

    fn reason(phrase: &str) -> &'static str {
        match mnemonic_to_entropy(phrase) {
            Err(AlgoChatError::InvalidMnemonic(reason)) => reason,
            Err(other) => panic!("unexpected error kind: {other}"),
            Ok(_) => panic!("phrase was accepted"),
        }
    }

    #[test]
    fn each_failure_has_its_own_reason() {
        let phrase = entropy_to_mnemonic(&ENTROPY);
        let words: Vec<&str> = phrase.split(' ').collect();
        assert_eq!(
            reason(&words[..24].join(" ")),
            "expected 25 words separated by single spaces"
        );
        let mut unknown = words.clone();
        unknown[2] = "notaword";
        assert_eq!(reason(&unknown.join(" ")), "a word is not in the wordlist");
        let mut checksum_not_a_word = words.clone();
        checksum_not_a_word[24] = "notaword";
        assert_eq!(
            reason(&checksum_not_a_word.join(" ")),
            "a word is not in the wordlist"
        );
        let swapped = MNEMONIC_WORDS[(word_index(words[24]).expect("word") + 1) % 2048];
        let mut checksum = words.clone();
        checksum[24] = swapped;
        assert_eq!(
            reason(&checksum.join(" ")),
            "the checksum word does not match"
        );
        let padded = MNEMONIC_WORDS[word_index(words[23]).expect("word") | 0x400];
        let mut padding = words.clone();
        padding[23] = padded;
        assert_ne!(padded, words[23], "a valid phrase has zero padding bits");
        assert_eq!(
            reason(&padding.join(" ")),
            "the 24th word has nonzero padding bits"
        );
    }

    #[test]
    fn errors_and_debug_never_show_a_word() {
        let (account, phrase) = create_random_ed25519_account().expect("create");
        let shown = format!("{account:?}");
        let words: Vec<&str> = phrase.split(' ').collect();
        assert!(!shown.contains(phrase.as_str()));
        assert!(!shown.contains(&words[..3].join(" ")));
        let short = words[..24].join(" ");
        let message = mnemonic_to_entropy(&short).expect_err("short").to_string();
        assert_eq!(
            message,
            "Invalid mnemonic: expected 25 words separated by single spaces"
        );
        assert!(shown.contains(account.address()));
        assert!(!shown.contains(&hex::encode(account.signing_key().to_bytes())));
        assert!(!shown.contains(&hex::encode(account.encryption_private_key().to_bytes())));
    }
}
