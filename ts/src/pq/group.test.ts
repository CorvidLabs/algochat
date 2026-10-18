import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { deriveEncryptionKeys } from '../crypto/keys.js';
import { deriveMLKEMKeyPair } from './kem.js';
import { acceptPQSession, initiatePQSession } from './session.js';
import {
    GROUP_MAX_PAYLOAD_SIZE,
    GROUP_MEMBERSHIP_NOTE_SIZE,
    deriveGroupMessageKey,
    openGroupMembership,
    openGroupMessage,
    sealGroupMembership,
    sealGroupMessage,
} from './group.js';
import type { PQSession } from './types.js';

interface GroupVector {
    session_key: string;
    sender_x25519: string;
    handshake_id: string;
    membership_nonce: string;
    action: number;
    epoch: number;
    group_id: string;
    mailbox: string;
    group_key: string;
    membership_note: string;
    message_nonce: string;
    counter: number;
    sender_address: string;
    plaintext_utf8: string;
    message_key: string;
    message_note: string;
}

const vector = JSON.parse(
    readFileSync(new URL('../../../vectors/group-v1.json', import.meta.url), 'utf8'),
) as GroupVector;

function fromHex(hex: string): Uint8Array {
    return Buffer.from(hex, 'hex');
}

function sessionFromVector(): PQSession {
    return {
        sessionKey: fromHex(vector.session_key),
        senderPublicKey: fromHex(vector.sender_x25519),
        recipientPublicKey: new Uint8Array(32).fill(0x22),
        handshakeId: fromHex(vector.handshake_id),
    };
}

describe('group mailbox', () => {
    test('matches the frozen 0x06 and 0x07 notes', () => {
        const session = sessionFromVector();
        const membership = sealGroupMembership(
            session,
            {
                action: vector.action,
                epoch: vector.epoch,
                groupId: fromHex(vector.group_id),
                mailbox: fromHex(vector.mailbox),
                groupKey: fromHex(vector.group_key),
            },
            fromHex(vector.membership_nonce),
        );
        expect(Buffer.from(membership).toString('hex')).toBe(vector.membership_note);
        expect(membership.length).toBe(GROUP_MEMBERSHIP_NOTE_SIZE);
        expect(membership[0]).toBe(0x02);
        expect(membership[1]).toBe(0x06);

        const opened = openGroupMembership(membership, session);
        expect(opened.action).toBe(1);
        expect(opened.epoch).toBe(1);
        expect(Buffer.from(opened.groupKey).toString('hex')).toBe(vector.group_key);

        const messageKey = deriveGroupMessageKey(
            fromHex(vector.group_key),
            vector.epoch,
            vector.counter,
            fromHex(vector.group_id),
            fromHex(vector.sender_address),
        );
        expect(Buffer.from(messageKey).toString('hex')).toBe(vector.message_key);

        const message = sealGroupMessage(
            new TextEncoder().encode(vector.plaintext_utf8),
            fromHex(vector.group_key),
            fromHex(vector.group_id),
            vector.epoch,
            vector.counter,
            fromHex(vector.sender_address),
            fromHex(vector.message_nonce),
        );
        expect(Buffer.from(message).toString('hex')).toBe(vector.message_note);
        expect(message[0]).toBe(0x02);
        expect(message[1]).toBe(0x07);

        const plain = openGroupMessage(message, fromHex(vector.group_key), fromHex(vector.sender_address), []);
        expect(new TextDecoder().decode(plain.plaintext)).toBe('group-v1');
    });

    test('rejects a repeated counter, a flipped byte, and the previous group key', () => {
        const note = fromHex(vector.message_note);
        const groupKey = fromHex(vector.group_key);
        const sender = fromHex(vector.sender_address);
        expect(() => openGroupMessage(note, groupKey, sender, [{ epoch: 1, counter: 0 }])).toThrow(
            /Repeated group counter/,
        );
        const flipped = new Uint8Array(note);
        flipped[flipped.length - 1] ^= 0x01;
        expect(() => openGroupMessage(flipped, groupKey, sender, [])).toThrow(/authentication failed/);
        const previous = new Uint8Array(32).fill(0x98);
        expect(() => openGroupMessage(note, previous, sender, [])).toThrow(/authentication failed/);
    });

    test('round-trips a membership note under a real hybrid session', () => {
        const alice = deriveEncryptionKeys(new Uint8Array(32).fill(0x11));
        const bob = deriveEncryptionKeys(new Uint8Array(32).fill(0x22));
        const aliceKem = deriveMLKEMKeyPair(new Uint8Array(32).fill(0x11));
        const bobKem = deriveMLKEMKeyPair(new Uint8Array(32).fill(0x22));
        const { note, session } = initiatePQSession({
            sender: alice,
            senderEncapsKey: aliceKem.encapsKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: bobKem.encapsKey,
            kemRandomness: new Uint8Array(32).fill(0x33),
            senderKemRandomness: new Uint8Array(32).fill(0x34),
        });
        const accepted = acceptPQSession(note, bob, bobKem.encapsKey, bobKem.decapsKey);
        const groupKey = new Uint8Array(32).fill(0x99);
        const membership = sealGroupMembership(session, {
            action: 1,
            epoch: 1,
            groupId: new Uint8Array(32).fill(0x77),
            mailbox: new Uint8Array(32).fill(0x88),
            groupKey,
        });
        const opened = openGroupMembership(membership, accepted);
        expect(Buffer.from(opened.groupKey)).toEqual(Buffer.from(groupKey));

        const senderAddress = new Uint8Array(32).fill(0xaa);
        const message = sealGroupMessage(
            new TextEncoder().encode('hello group'),
            opened.groupKey,
            opened.groupId,
            opened.epoch,
            0,
            senderAddress,
        );
        const plain = openGroupMessage(message, opened.groupKey, senderAddress, []);
        expect(new TextDecoder().decode(plain.plaintext)).toBe('hello group');
        const max = sealGroupMessage(
            new Uint8Array(GROUP_MAX_PAYLOAD_SIZE),
            opened.groupKey,
            opened.groupId,
            1,
            1,
            senderAddress,
        );
        expect(max.length).toBe(4096);
        expect(() =>
            sealGroupMessage(
                new Uint8Array(GROUP_MAX_PAYLOAD_SIZE + 1),
                opened.groupKey,
                opened.groupId,
                1,
                2,
                senderAddress,
            ),
        ).toThrow(/too large/);
    });
});
