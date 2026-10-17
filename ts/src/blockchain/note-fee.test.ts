/**
 * Note capacity fee: consensus surcharge past 1024 bytes, plus Falcon scheme fee.
 */

import { describe, expect, test } from 'bun:test';
import type { SuggestedParams } from './types.js';
import {
    FALCON_FEE_MULTIPLIER,
    MAX_NOTE_SIZE,
    MINIMUM_PAYMENT,
    MessageTooLargeError,
    MessageTransaction,
    notePaymentFee,
} from './message-transaction.js';

const MIN_FEE = 1000;

const PARAMS: SuggestedParams = {
    fee: MIN_FEE,
    minFee: MIN_FEE,
    firstValid: 100,
    lastValid: 1100,
    genesisId: 'testnet-v1.0',
    genesisHash: new Uint8Array(32).fill(1),
};

describe('notePaymentFee', () => {
    test('fee vectors at minFee 1000', () => {
        expect(notePaymentFee(1024, MIN_FEE, 'ed25519')).toBe(1000);
        expect(notePaymentFee(1025, MIN_FEE, 'ed25519')).toBe(1001);
        expect(notePaymentFee(2000, MIN_FEE, 'ed25519')).toBe(1098);
        expect(notePaymentFee(4096, MIN_FEE, 'ed25519')).toBe(1308);
        expect(notePaymentFee(4096, MIN_FEE, 'falcon-1024')).toBe(3308);
    });

    test('notes of 1024 bytes or fewer keep the old scheme fee', () => {
        expect(notePaymentFee(0, MIN_FEE, 'ed25519')).toBe(1000);
        expect(notePaymentFee(1024, MIN_FEE, 'ed25519')).toBe(MIN_FEE);
        expect(notePaymentFee(1024, MIN_FEE, 'falcon-1024')).toBe(MIN_FEE * FALCON_FEE_MULTIPLIER);
        expect(notePaymentFee(1024, MIN_FEE, 'falcon-1024')).toBe(3000);
    });
});

describe('MessageTransaction fee', () => {
    function builtFee(noteBytes: number, scheme: 'ed25519' | 'falcon-1024' = 'ed25519'): number {
        const tx = MessageTransaction.createFromEncoded(
            'SENDER',
            'RECEIVER',
            new Uint8Array(noteBytes),
            PARAMS,
            MINIMUM_PAYMENT,
            scheme,
        );
        return tx.fee;
    }

    test('uses notePaymentFee when a payment is built', () => {
        expect(builtFee(1024)).toBe(1000);
        expect(builtFee(1025)).toBe(1001);
        expect(builtFee(2000)).toBe(1098);
        expect(builtFee(4096)).toBe(1308);
        expect(builtFee(4096, 'falcon-1024')).toBe(3308);
        expect(builtFee(1024, 'falcon-1024')).toBe(3000);
    });

    test('rejects a note one byte over 4096 before returning a payment', () => {
        expect(() => builtFee(MAX_NOTE_SIZE + 1)).toThrow(MessageTooLargeError);
    });
});
