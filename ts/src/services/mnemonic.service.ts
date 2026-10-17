/**
 * AlgoChat Web - Mnemonic/Account Service
 *
 * Handles Algorand mnemonic decoding and account creation.
 *
 * Protocol v1.2: encryption keys always come from the 32-byte mnemonic
 * entropy. Payment authorization is either Ed25519 (`sig`) or Falcon-1024
 * (`pqsig`). New accounts default to Falcon-1024. Import without a scheme
 * stays Ed25519 so a classical 25-word phrase recovers the same address.
 */

import algosdk from 'algosdk';
import { generateKey, signCompressed } from 'falcon-1024';
import { deriveEncryptionKeys, getPublicKey } from '../crypto/index.js';
import type { ChatAccount } from './algorand.service.js';

export const SIGNING_SCHEME = {
    ED25519: 'ed25519',
    FALCON_1024: 'falcon-1024',
} as const;

export type SigningScheme = (typeof SIGNING_SCHEME)[keyof typeof SIGNING_SCHEME];

export interface ChatAccountOptions {
    /**
     * Authorizing signature scheme. `createChatAccountFromMnemonic` defaults
     * to `ed25519`. `createRandomChatAccount` defaults to `falcon-1024`.
     */
    scheme?: SigningScheme;
}

function mnemonicEntropy(mnemonic: string): Uint8Array {
    return algosdk.seedFromMnemonic(mnemonic);
}

function ed25519ChatAccount(mnemonic: string, entropy: Uint8Array): ChatAccount {
    const account = algosdk.mnemonicToSecretKey(mnemonic);
    return {
        address: account.addr.toString(),
        scheme: SIGNING_SCHEME.ED25519,
        account,
        encryptionKeys: deriveEncryptionKeys(entropy),
        ed25519PublicKey: getPublicKey(entropy),
        txnSigner: algosdk.makeBasicAccountTransactionSigner(account),
    };
}

function falconChatAccount(mnemonic: string, entropy: Uint8Array): ChatAccount {
    const falconSeed = algosdk.pq25WordMnemonicToSeed(mnemonic, algosdk.FALCON_1024_SCHEME);
    const { publicKey, privateKey } = generateKey(falconSeed);
    const signers = algosdk.addressWithSignersFromRawFalcon1024Signer({
        falcon1024PublicKey: publicKey,
        falcon1024Signer: async (bytesToSign: Uint8Array) => signCompressed(privateKey, bytesToSign),
    });

    return {
        address: signers.address.toString(),
        scheme: SIGNING_SCHEME.FALCON_1024,
        encryptionKeys: deriveEncryptionKeys(entropy),
        ed25519PublicKey: getPublicKey(entropy),
        txnSigner: signers.txnSigner,
    };
}

/**
 * Creates a ChatAccount from an Algorand mnemonic.
 *
 * Defaults to Ed25519 so importing a classical 25-word phrase recovers the
 * same address as Pera / AlgoChat v1.1. Pass `{ scheme: 'falcon-1024' }` to
 * recover a Falcon account generated from the same words.
 */
export function createChatAccountFromMnemonic(
    mnemonic: string,
    options: ChatAccountOptions = {}
): ChatAccount {
    const entropy = mnemonicEntropy(mnemonic);
    const scheme = options.scheme ?? SIGNING_SCHEME.ED25519;
    if (scheme === SIGNING_SCHEME.FALCON_1024) {
        return falconChatAccount(mnemonic, entropy);
    }
    return ed25519ChatAccount(mnemonic, entropy);
}

/**
 * Creates a new random ChatAccount.
 *
 * Defaults to Falcon-1024. Pass `{ scheme: 'ed25519' }` for a classical
 * account. The returned mnemonic is the cross-scheme master secret; recovering
 * a Falcon account from it requires `{ scheme: 'falcon-1024' }`.
 */
export function createRandomChatAccount(
    options: ChatAccountOptions = {}
): { account: ChatAccount; mnemonic: string } {
    const generated = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(generated.sk);
    const scheme = options.scheme ?? SIGNING_SCHEME.FALCON_1024;
    return {
        account: createChatAccountFromMnemonic(mnemonic, { scheme }),
        mnemonic,
    };
}

/**
 * Validates an Algorand mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
    try {
        algosdk.mnemonicToSecretKey(mnemonic);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates an Algorand address
 */
export function validateAddress(address: string): boolean {
    return algosdk.isValidAddress(address);
}

/**
 * Converts public key bytes to base64 for display/storage
 */
export function publicKeyToBase64(publicKey: Uint8Array): string {
    return Buffer.from(publicKey).toString('base64');
}

/**
 * Converts base64 to public key bytes
 */
export function base64ToPublicKey(base64: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}
