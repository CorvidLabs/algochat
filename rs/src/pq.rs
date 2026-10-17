//! Hybrid X25519 + ML-KEM-768 session. Protocol ids 0x04 and 0x05.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use hkdf::Hkdf;
use ml_kem::kem::{Decapsulate, DecapsulationKey, KeyExport};
use ml_kem::{MlKem768, Seed, B32};
use sha2::{Digest, Sha256};
use x25519_dalek::PublicKey;

use crate::keys::{derive_keys_from_seed, generate_ephemeral_keypair, x25519_ecdh};
use crate::types::{AlgoChatError, Result, MAX_NOTE_SIZE};

const VERSION_AAD: u8 = 0x02;
const ID_HANDSHAKE: u8 = 0x04;
const ID_DATA: u8 = 0x05;
const CT_LEN: usize = 1088;
const HANDSHAKE_LEN: usize = 2 + 32 + 32 + 32 + CT_LEN + 32 + CT_LEN + 12 + WRAPPED;
const DATA_HEADER: usize = 78;
const WRAPPED: usize = 48;
const MAX_PQ_PLAINTEXT: usize = MAX_NOTE_SIZE - DATA_HEADER - 16;

/// Hybrid session key.
#[derive(Clone)]
pub struct PqSession {
    pub session_key: [u8; 32],
    pub sender_public: [u8; 32],
    pub recipient_public: [u8; 32],
    pub handshake_id: [u8; 32],
}

/// ML-KEM-768 keys derived from the account seed.
pub struct MlkemKeys {
    pub encaps_key: Vec<u8>,
    decap: DecapsulationKey<MlKem768>,
}

pub fn derive_mlkem768(seed: &[u8]) -> Result<MlkemKeys> {
    let d = hkdf32(seed, b"AlgoChat-v1-mlkem768", b"mlkem768-d")?;
    let z = hkdf32(seed, b"AlgoChat-v1-mlkem768", b"mlkem768-z")?;
    let mut raw = [0u8; 64];
    raw[..32].copy_from_slice(&d);
    raw[32..].copy_from_slice(&z);
    let kem_seed = Seed::from(raw);
    let decap = DecapsulationKey::<MlKem768>::from_seed(kem_seed);
    let encaps_key = decap.encapsulation_key().to_bytes().to_vec();
    Ok(MlkemKeys { encaps_key, decap })
}

pub fn derive_hybrid_pq_key(
    ec_ss: &[u8],
    pq_ss: &[u8],
    eph_pub: &[u8],
    kem_ct: &[u8],
    sender_x: &[u8],
    recip_x: &[u8],
    encaps_key: &[u8],
) -> Result<[u8; 32]> {
    let mut ikm = Vec::with_capacity(64);
    ikm.extend_from_slice(ec_ss);
    ikm.extend_from_slice(pq_ss);
    let mut info = b"algochat-pq-v1".to_vec();
    info.extend_from_slice(eph_pub);
    info.extend_from_slice(kem_ct);
    info.extend_from_slice(sender_x);
    info.extend_from_slice(recip_x);
    info.extend_from_slice(&Sha256::digest(encaps_key));
    hkdf32(&ikm, b"algochat-pq-v1", &info)
}

pub fn accept_pq_handshake(note: &[u8], recipient_seed: &[u8]) -> Result<PqSession> {
    let fields = parse_handshake(note)?;
    let (recip_priv, recip_pub) = derive_keys_from_seed(recipient_seed)?;
    if recip_pub.as_bytes() != &fields.recipient {
        return Err(AlgoChatError::DecryptionError("recipient mismatch".into()));
    }
    let kem = derive_mlkem768(recipient_seed)?;
    if Sha256::digest(&kem.encaps_key).as_slice() != fields.ek_hash {
        return Err(AlgoChatError::DecryptionError("encaps key mismatch".into()));
    }
    let eph = PublicKey::from(fields.ephemeral);
    let ec = x25519_ecdh(&recip_priv, &eph);
    let ct = ml_kem::Ciphertext::<MlKem768>::try_from(fields.kem_ct.as_slice())
        .map_err(|_| AlgoChatError::DecryptionError("ciphertext".into()))?;
    let pq = kem.decap.decapsulate(&ct);
    let key = derive_hybrid_pq_key(
        &ec,
        pq.as_ref(),
        &fields.ephemeral,
        &fields.kem_ct,
        &fields.sender,
        &fields.recipient,
        &kem.encaps_key,
    )?;
    Ok(session_from(note, key, fields.sender, fields.recipient))
}

pub fn open_pq_handshake_as_sender(note: &[u8], sender_seed: &[u8]) -> Result<PqSession> {
    let fields = parse_handshake(note)?;
    let (sender_priv, sender_pub) = derive_keys_from_seed(sender_seed)?;
    if sender_pub.as_bytes() != &fields.sender {
        return Err(AlgoChatError::DecryptionError("sender mismatch".into()));
    }
    let kem = derive_mlkem768(sender_seed)?;
    let parsed = ml_kem::Ciphertext::<MlKem768>::try_from(fields.sender_ct.as_slice())
        .map_err(|_| AlgoChatError::DecryptionError("sender ciphertext".into()))?;
    let sender_ss = kem.decap.decapsulate(&parsed);
    let agreed = x25519_ecdh(&sender_priv, &PublicKey::from(fields.ephemeral));
    let wrap = sender_wrap_key(
        &agreed,
        sender_ss.as_ref(),
        sender_pub.as_bytes(),
        &fields.ephemeral,
    )?;
    let cipher = ChaCha20Poly1305::new_from_slice(&wrap)
        .map_err(|e| AlgoChatError::EncryptionError(e.to_string()))?;
    let prefix = &note[..note.len() - WRAPPED];
    let key = cipher
        .decrypt(
            Nonce::from_slice(&fields.nonce),
            Payload {
                msg: &fields.wrapped,
                aad: prefix,
            },
        )
        .map_err(|_| AlgoChatError::DecryptionError("sender wrap".into()))?;
    let session_key = std::array::from_fn(|index| key[index]);
    Ok(session_from(
        note,
        session_key,
        fields.sender,
        fields.recipient,
    ))
}

pub fn initiate_pq_handshake(
    sender_seed: &[u8],
    recipient_public: &[u8],
    recipient_encaps_key: &[u8],
) -> Result<(Vec<u8>, PqSession)> {
    if recipient_public.len() != 32 || recipient_encaps_key.len() != 1184 {
        return Err(AlgoChatError::InvalidPublicKey("recipient key".into()));
    }
    let (_sender_priv, sender_pub) = derive_keys_from_seed(sender_seed)?;
    let sender_kem = derive_mlkem768(sender_seed)?;
    let recip_pub = PublicKey::from(read_array::<32>(recipient_public, 0));
    let (eph_priv, eph_pub) = generate_ephemeral_keypair();
    let ec = x25519_ecdh(&eph_priv, &recip_pub);
    let coins: [u8; 32] = rand::random();
    let encoded: ml_kem::Key<ml_kem::EncapsulationKey<MlKem768>> = recipient_encaps_key
        .try_into()
        .map_err(|_| AlgoChatError::InvalidPublicKey("encapsulation key".into()))?;
    let recip_ek = ml_kem::EncapsulationKey::<MlKem768>::new(&encoded)
        .map_err(|_| AlgoChatError::InvalidPublicKey("encapsulation key".into()))?;
    let (ct, pq) = recip_ek.encapsulate_deterministic(&B32::from(coins));
    let sender_coins: [u8; 32] = rand::random();
    let (sender_ct, sender_ss) = sender_kem
        .decap
        .encapsulation_key()
        .encapsulate_deterministic(&B32::from(sender_coins));
    let key = derive_hybrid_pq_key(
        &ec,
        pq.as_ref(),
        eph_pub.as_bytes(),
        ct.as_ref(),
        sender_pub.as_bytes(),
        recipient_public,
        recipient_encaps_key,
    )?;
    let nonce: [u8; 12] = rand::random();
    let prefix = handshake_prefix(
        sender_pub.as_bytes(),
        recipient_public,
        eph_pub.as_bytes(),
        ct.as_ref(),
        recipient_encaps_key,
        sender_ct.as_ref(),
        &nonce,
    );
    let agreed = x25519_ecdh(&eph_priv, &sender_pub);
    let wrap = sender_wrap_key(
        &agreed,
        sender_ss.as_ref(),
        sender_pub.as_bytes(),
        eph_pub.as_bytes(),
    )?;
    let cipher = ChaCha20Poly1305::new_from_slice(&wrap)
        .map_err(|e| AlgoChatError::EncryptionError(e.to_string()))?;
    let wrapped = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: &key,
                aad: &prefix,
            },
        )
        .map_err(|_| AlgoChatError::EncryptionError("wrap".into()))?;
    let mut note = prefix;
    note.extend_from_slice(&wrapped);
    if note.len() != HANDSHAKE_LEN {
        return Err(AlgoChatError::EncryptionError(format!("{}", note.len())));
    }
    let mut recip = [0u8; 32];
    recip.copy_from_slice(recipient_public);
    let session = session_from(&note, key, *sender_pub.as_bytes(), recip);
    Ok((note, session))
}

pub fn encrypt_pq_message(plaintext: &str, session: &PqSession) -> Result<Vec<u8>> {
    if plaintext.len() > MAX_PQ_PLAINTEXT {
        return Err(AlgoChatError::MessageTooLarge(plaintext.len()));
    }
    let nonce: [u8; 12] = rand::random();
    let header = data_header(&session.sender_public, &session.handshake_id, &nonce);
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|e| AlgoChatError::EncryptionError(e.to_string()))?;
    let ct = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: plaintext.as_bytes(),
                aad: &header,
            },
        )
        .map_err(|_| AlgoChatError::EncryptionError("seal".into()))?;
    let mut note = header;
    note.extend_from_slice(&ct);
    Ok(note)
}

pub fn decrypt_pq_message(note: &[u8], session: &PqSession) -> Result<String> {
    if note.len() < DATA_HEADER + 16 || note[0] != VERSION_AAD || note[1] != ID_DATA {
        return Err(AlgoChatError::InvalidEnvelope("not a PQ message".into()));
    }
    if note[2..34] != session.sender_public || note[34..66] != session.handshake_id {
        return Err(AlgoChatError::DecryptionError("header mismatch".into()));
    }
    let header = &note[..DATA_HEADER];
    let cipher = ChaCha20Poly1305::new_from_slice(&session.session_key)
        .map_err(|e| AlgoChatError::DecryptionError(e.to_string()))?;
    let plain = cipher
        .decrypt(
            Nonce::from_slice(&note[66..78]),
            Payload {
                msg: &note[78..],
                aad: header,
            },
        )
        .map_err(|_| AlgoChatError::DecryptionError("open".into()))?;
    String::from_utf8(plain).map_err(|e| AlgoChatError::DecryptionError(e.to_string()))
}

pub fn is_pq_announcement(note: &[u8]) -> bool {
    note.starts_with(b"ACPQ")
}

/// Parsed ACPQ announcement. A bad signature returns `None`. No signature is unverified.
pub struct PqAnnouncement {
    pub encaps_key: Vec<u8>,
    pub verified: bool,
}

pub fn parse_pq_announcement(note: &[u8], verifying_key: Option<&[u8]>) -> Option<PqAnnouncement> {
    const UNSIGNED: usize = 4 + 1 + 1184;
    const SIGNED: usize = UNSIGNED + 64;
    if !is_pq_announcement(note)
        || (note.len() != UNSIGNED && note.len() != SIGNED)
        || note[4] != 0x01
    {
        return None;
    }
    let encaps_key = note[5..UNSIGNED].to_vec();
    if note.len() == UNSIGNED {
        return Some(PqAnnouncement {
            encaps_key,
            verified: false,
        });
    }
    let key_bytes: [u8; 32] = verifying_key?.try_into().ok()?;
    let key = VerifyingKey::from_bytes(&key_bytes).ok()?;
    let mut message = b"AlgoChat-pq-ek-v1".to_vec();
    message.push(0x01);
    message.extend_from_slice(&encaps_key);
    let digest = Sha256::digest(&message);
    let signature = Signature::from_slice(&note[UNSIGNED..]).ok()?;
    key.verify(&digest, &signature).ok()?;
    Some(PqAnnouncement {
        encaps_key,
        verified: true,
    })
}

struct Fields {
    sender: [u8; 32],
    recipient: [u8; 32],
    ephemeral: [u8; 32],
    kem_ct: Vec<u8>,
    ek_hash: Vec<u8>,
    sender_ct: Vec<u8>,
    nonce: [u8; 12],
    wrapped: Vec<u8>,
}

fn parse_handshake(note: &[u8]) -> Result<Fields> {
    if note.len() != HANDSHAKE_LEN || note[0] != VERSION_AAD || note[1] != ID_HANDSHAKE {
        return Err(AlgoChatError::InvalidEnvelope("handshake".into()));
    }
    let mut off = 2;
    let sender = read_array(note, off);
    off += 32;
    let recipient = read_array(note, off);
    off += 32;
    let ephemeral = read_array(note, off);
    off += 32;
    let kem_ct = note[off..off + CT_LEN].to_vec();
    off += CT_LEN;
    let ek_hash = note[off..off + 32].to_vec();
    off += 32;
    let sender_ct = note[off..off + CT_LEN].to_vec();
    off += CT_LEN;
    let nonce = read_array(note, off);
    off += 12;
    let wrapped = note[off..off + WRAPPED].to_vec();
    Ok(Fields {
        sender,
        recipient,
        ephemeral,
        kem_ct,
        ek_hash,
        sender_ct,
        nonce,
        wrapped,
    })
}

fn handshake_prefix(
    sender: &[u8],
    recip: &[u8],
    eph: &[u8],
    ct: &[u8],
    ek: &[u8],
    sender_ct: &[u8],
    nonce: &[u8],
) -> Vec<u8> {
    let mut prefix = vec![VERSION_AAD, ID_HANDSHAKE];
    prefix.extend_from_slice(sender);
    prefix.extend_from_slice(recip);
    prefix.extend_from_slice(eph);
    prefix.extend_from_slice(ct);
    prefix.extend_from_slice(&Sha256::digest(ek));
    prefix.extend_from_slice(sender_ct);
    prefix.extend_from_slice(nonce);
    prefix
}

fn data_header(sender: &[u8], hid: &[u8], nonce: &[u8]) -> Vec<u8> {
    let mut h = vec![VERSION_AAD, ID_DATA];
    h.extend_from_slice(sender);
    h.extend_from_slice(hid);
    h.extend_from_slice(nonce);
    h
}

fn session_from(note: &[u8], key: [u8; 32], sender: [u8; 32], recipient: [u8; 32]) -> PqSession {
    let digest = Sha256::digest(note);
    let mut handshake_id = [0u8; 32];
    handshake_id.copy_from_slice(&digest);
    PqSession {
        session_key: key,
        sender_public: sender,
        recipient_public: recipient,
        handshake_id,
    }
}

fn sender_wrap_key(
    x25519_shared: &[u8],
    mlkem_shared: &[u8],
    sender: &[u8],
    eph: &[u8],
) -> Result<[u8; 32]> {
    let mut ikm = Vec::with_capacity(x25519_shared.len() + mlkem_shared.len());
    ikm.extend_from_slice(x25519_shared);
    ikm.extend_from_slice(mlkem_shared);
    let mut info = b"AlgoChatPQ-SenderKey".to_vec();
    info.extend_from_slice(sender);
    hkdf32(&ikm, eph, &info)
}

fn read_array<const N: usize>(bytes: &[u8], offset: usize) -> [u8; N] {
    std::array::from_fn(|index| bytes[offset + index])
}

fn hkdf32(ikm: &[u8], domain: &[u8], info: &[u8]) -> Result<[u8; 32]> {
    let hk = Hkdf::<Sha256>::new(Some(domain), ikm);
    // Expand writes every byte, or returns an error before this value is used.
    let mut out = std::array::from_fn(|index| index as u8);
    hk.expand(info, &mut out)
        .map_err(|e| AlgoChatError::KeyDerivationFailed(e.to_string()))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json_field(text: &str, key: &str) -> String {
        let pat = format!("\"{key}\"");
        let i = text.find(&pat).unwrap() + pat.len();
        let rest = text[i..].trim_start_matches(|c: char| c == ':' || c.is_whitespace());
        let rest = rest.trim_start_matches('"');
        rest[..rest.find('"').unwrap()].to_string()
    }

    #[test]
    fn parity_fixture() {
        let text = std::fs::read_to_string("../vectors/pq-mlkem768.json").unwrap();
        let kem = derive_mlkem768(&[0x22u8; 32]).unwrap();
        assert_eq!(
            hex::encode(&kem.encaps_key),
            json_field(&text, "encaps_key")
        );
        let ct = hex::decode(json_field(&text, "ciphertext")).unwrap();
        let parsed = ml_kem::Ciphertext::<MlKem768>::try_from(ct.as_slice()).unwrap();
        let ss = kem.decap.decapsulate(&parsed);
        assert_eq!(
            hex::encode(ss.as_slice()),
            json_field(&text, "mlkem_shared_secret")
        );

        let ek = vec![1u8; 32];
        let fill = vec![2u8; CT_LEN];
        let key = derive_hybrid_pq_key(
            &[5u8; 32],
            &[6u8; 32],
            &ek,
            &fill,
            &[3u8; 32],
            &[4u8; 32],
            &kem.encaps_key,
        )
        .unwrap();
        assert_eq!(hex::encode(key), json_field(&text, "combiner_session_key"));

        let bob = derive_mlkem768(&[0x22u8; 32]).unwrap();
        let (_, bob_pub) = derive_keys_from_seed(&[0x22u8; 32]).unwrap();
        let (note, session) =
            initiate_pq_handshake(&[0x11u8; 32], bob_pub.as_bytes(), &bob.encaps_key).unwrap();
        assert_eq!(note.len(), HANDSHAKE_LEN);
        let accepted = accept_pq_handshake(&note, &[0x22u8; 32]).unwrap();
        assert_eq!(accepted.session_key, session.session_key);
        let reopened = open_pq_handshake_as_sender(&note, &[0x11u8; 32]).unwrap();
        assert_eq!(reopened.session_key, session.session_key);
        assert!(open_pq_handshake_as_sender(&note, &[0x22u8; 32]).is_err());
        let msg = encrypt_pq_message("parity", &session).unwrap();
        assert_eq!(decrypt_pq_message(&msg, &reopened).unwrap(), "parity");
        let mut bad = msg.clone();
        let last = bad.len() - 1;
        bad[last] ^= 1;
        assert!(decrypt_pq_message(&bad, &session).is_err());
        assert!(is_pq_announcement(b"ACPQ"));
        let mut unsigned = vec![0x41, 0x43, 0x50, 0x51, 0x01];
        unsigned.extend(std::iter::repeat(0x07u8).take(1184));
        let parsed = parse_pq_announcement(&unsigned, None).unwrap();
        assert!(!parsed.verified);
        assert_eq!(parsed.encaps_key.len(), 1184);
        let mut bad = unsigned.clone();
        bad.extend(std::iter::repeat(0u8).take(64));
        assert!(parse_pq_announcement(&bad, Some(&[0x11u8; 32])).is_none());
    }

    #[test]
    fn live_localnet_note() {
        let raw = match std::fs::read_to_string("/tmp/pq-live.json") {
            Ok(text) => text,
            Err(_) => return,
        };
        let alice = hex::decode(json_field(&raw, "aliceSeed")).unwrap();
        let bob = hex::decode(json_field(&raw, "bobSeed")).unwrap();
        let note = hex::decode(json_field(&raw, "handshake")).unwrap();
        if note.len() != HANDSHAKE_LEN {
            return;
        }
        let message = hex::decode(json_field(&raw, "message")).unwrap();
        let session = accept_pq_handshake(&note, &bob).unwrap();
        assert_eq!(
            hex::encode(session.session_key),
            json_field(&raw, "sessionKey")
        );
        assert_eq!(
            decrypt_pq_message(&message, &session).unwrap(),
            json_field(&raw, "text")
        );
        let reopened = open_pq_handshake_as_sender(&note, &alice).unwrap();
        assert_eq!(
            decrypt_pq_message(&message, &reopened).unwrap(),
            json_field(&raw, "text")
        );
    }
}
