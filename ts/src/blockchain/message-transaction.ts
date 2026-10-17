/**
 * AlgoChat - Message Transaction Builder
 *
 * Helper for building and signing message transactions on Algorand.
 */

import { encodeEnvelope } from '../crypto/envelope.js';
import { MAX_NOTE_SIZE, type ChatEnvelope } from '../models/types.js';
import type { SuggestedParams } from './types.js';

export { MAX_NOTE_SIZE };

/** Chat account interface (minimal) */
export interface ChatAccountLike {
    address: string;
}

/** Note bytes covered by one minimum fee. Bytes past this add a surcharge. */
export const NOTE_FEE_BASE_BYTES = 1024;

/** Falcon-1024 pays three minimum fees before the note surcharge. */
export const FALCON_FEE_MULTIPLIER = 3;

/** Authorizing scheme for a payment that carries a note. */
export type PaymentScheme = 'ed25519' | 'falcon-1024';

/** Minimum payment amount for a message (0.001 ALGO = 1000 microAlgos) */
export const MINIMUM_PAYMENT = 1000;

/**
 * Minimum fee, in microAlgos, for a payment note.
 *
 * Scheme fee is `minFee * 3` for Falcon-1024 and `minFee` otherwise.
 * Bytes past 1024 add `ceil(over * minFee / 10000)`, computed as
 * `(over * minFee + 9999) / 10000` with integer division.
 * A note of 1024 bytes or fewer has a zero surcharge.
 */
export function notePaymentFee(noteBytes: number, minFee: number, scheme: PaymentScheme): number {
    const over = Math.max(0, noteBytes - NOTE_FEE_BASE_BYTES);
    const surcharge = Math.floor((over * minFee + 9999) / 10000);
    const schemeFee = scheme === 'falcon-1024' ? minFee * FALCON_FEE_MULTIPLIER : minFee;
    return schemeFee + surcharge;
}

/** Error thrown when a message is too large */
export class MessageTooLargeError extends Error {
    maxSize: number;
    actualSize: number;

    constructor(actualSize: number, maxSize: number = MAX_NOTE_SIZE) {
        super(`Message too large: ${actualSize} bytes (max ${maxSize})`);
        this.name = 'MessageTooLargeError';
        this.maxSize = maxSize;
        this.actualSize = actualSize;
    }
}

/**
 * Unsigned payment transaction structure.
 *
 * This represents the raw transaction fields before signing.
 */
export interface UnsignedTransaction {
    /** Transaction type */
    type: 'pay';
    /** Sender address */
    sender: string;
    /** Receiver address */
    receiver: string;
    /** Payment amount in microAlgos */
    amount: number;
    /** Note field (message envelope) */
    note: Uint8Array;
    /** Fee in microAlgos */
    fee: number;
    /** First valid round */
    firstRound: number;
    /** Last valid round */
    lastRound: number;
    /** Genesis ID */
    genesisId: string;
    /** Genesis hash */
    genesisHash: Uint8Array;
}

/**
 * Signed transaction structure.
 */
export interface SignedTransaction {
    /** The transaction content */
    txn: UnsignedTransaction;
    /** The signature */
    sig: Uint8Array;
}

/**
 * Helper for building message transactions on Algorand.
 *
 * Messages are sent as payment transactions with the encrypted
 * envelope in the note field.
 *
 * @example
 * ```typescript
 * import { MessageTransaction } from './blockchain/message-transaction';
 *
 * // Create an unsigned transaction
 * const tx = MessageTransaction.create(
 *     sender,
 *     recipientAddress,
 *     envelope,
 *     suggestedParams
 * );
 *
 * // Or create a signed transaction (if ChatAccount has signing capability)
 * const signedTx = await MessageTransaction.createSigned(
 *     sender,
 *     recipientAddress,
 *     envelope,
 *     suggestedParams
 * );
 * ```
 */
export const MessageTransaction = {
    /** Minimum payment amount (0.001 ALGO) */
    minimumPayment: MINIMUM_PAYMENT,

    /** Maximum note size in bytes */
    maxNoteSize: MAX_NOTE_SIZE,

    /**
     * Creates a payment transaction carrying an encrypted message.
     *
     * @param sender - The sending chat account
     * @param recipient - The recipient's Algorand address
     * @param envelope - The encrypted message envelope
     * @param params - Transaction parameters from the network
     * @param amount - Optional payment amount (default: minimum)
     * @param scheme - Authorizing scheme (default: ed25519)
     * @returns Unsigned payment transaction
     * @throws MessageTooLargeError if envelope exceeds max note size
     */
    create(
        sender: ChatAccountLike,
        recipient: string,
        envelope: ChatEnvelope,
        params: SuggestedParams,
        amount: number = MINIMUM_PAYMENT,
        scheme: PaymentScheme = 'ed25519'
    ): UnsignedTransaction {
        const noteData = encodeEnvelope(envelope);

        if (noteData.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(noteData.length, MAX_NOTE_SIZE);
        }

        return {
            type: 'pay',
            sender: sender.address,
            receiver: recipient,
            amount,
            note: noteData,
            fee: notePaymentFee(noteData.length, params.minFee, scheme),
            firstRound: params.firstValid,
            lastRound: params.lastValid,
            genesisId: params.genesisId,
            genesisHash: params.genesisHash,
        };
    },

    /**
     * Creates a payment transaction from a pre-encoded envelope.
     *
     * Use this when you already have the encoded envelope bytes.
     *
     * @param sender - The sender's Algorand address
     * @param recipient - The recipient's Algorand address
     * @param encodedEnvelope - The pre-encoded envelope bytes
     * @param params - Transaction parameters from the network
     * @param amount - Optional payment amount (default: minimum)
     * @param scheme - Authorizing scheme (default: ed25519)
     * @returns Unsigned payment transaction
     * @throws MessageTooLargeError if envelope exceeds max note size
     */
    createFromEncoded(
        senderAddress: string,
        recipient: string,
        encodedEnvelope: Uint8Array,
        params: SuggestedParams,
        amount: number = MINIMUM_PAYMENT,
        scheme: PaymentScheme = 'ed25519'
    ): UnsignedTransaction {
        if (encodedEnvelope.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(encodedEnvelope.length, MAX_NOTE_SIZE);
        }

        return {
            type: 'pay',
            sender: senderAddress,
            receiver: recipient,
            amount,
            note: encodedEnvelope,
            fee: notePaymentFee(encodedEnvelope.length, params.minFee, scheme),
            firstRound: params.firstValid,
            lastRound: params.lastValid,
            genesisId: params.genesisId,
            genesisHash: params.genesisHash,
        };
    },

    /**
     * Validates that a note doesn't exceed the maximum size.
     *
     * @param note - The note data to validate
     * @throws MessageTooLargeError if note exceeds max size
     */
    validateNoteSize(note: Uint8Array): void {
        if (note.length > MAX_NOTE_SIZE) {
            throw new MessageTooLargeError(note.length, MAX_NOTE_SIZE);
        }
    },
};
