/**
 * Group mailbox notes. Protocol 0x06 delivers the group key under a hybrid
 * session. Protocol 0x07 posts one message to the mailbox.
 * Protocol 0x03, the public room administration record, lives in group-admin.ts.
 *
 * An everyday key is not a legal wrap for a group key.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { uint8ArrayEquals } from '../crypto/keys.js';
import { MAX_NOTE_SIZE } from '../models/types.js';
import { concatBytes, requireLength } from './bytes.js';
import { PQ_DATA_HEADER_SIZE, PQ_PROTOCOL, PQError, type PQSession } from './types.js';

export const GROUP_INFO_LABEL = 'AlgoChat-group-v1';

export const GROUP_ACTION = {
    CREATE: 1,
    ADD: 2,
    REMOVE: 3,
    REKEY: 4,
} as const;

export const GROUP_MEMBERSHIP_PLAINTEXT_SIZE = 101;
export const GROUP_MEMBERSHIP_NOTE_SIZE = PQ_DATA_HEADER_SIZE + GROUP_MEMBERSHIP_PLAINTEXT_SIZE + PQ_PROTOCOL.TAG_SIZE;
export const GROUP_MESSAGE_HEADER_SIZE = 54;
export const GROUP_MAX_PAYLOAD_SIZE = MAX_NOTE_SIZE - GROUP_MESSAGE_HEADER_SIZE - PQ_PROTOCOL.TAG_SIZE;

export interface GroupMembership {
    action: number;
    epoch: number;
    groupId: Uint8Array;
    mailbox: Uint8Array;
    groupKey: Uint8Array;
}

export interface GroupCounter {
    epoch: number;
    counter: number;
}

export interface OpenedGroupMessage {
    plaintext: Uint8Array;
    groupId: Uint8Array;
    epoch: number;
    counter: number;
}

export function isGroupMembership(note: Uint8Array): boolean {
    return (
        note.length === GROUP_MEMBERSHIP_NOTE_SIZE &&
        note[0] === PQ_PROTOCOL.VERSION &&
        note[1] === GROUP_PROTOCOL_MEMBERSHIP
    );
}

export function isGroupMessage(note: Uint8Array): boolean {
    return (
        note.length >= GROUP_MESSAGE_HEADER_SIZE + PQ_PROTOCOL.TAG_SIZE &&
        note.length <= MAX_NOTE_SIZE &&
        note[0] === PQ_PROTOCOL.VERSION &&
        note[1] === GROUP_PROTOCOL_MESSAGE
    );
}

const GROUP_PROTOCOL_MEMBERSHIP = 0x06;
const GROUP_PROTOCOL_MESSAGE = 0x07;

export function sealGroupMembership(
    session: PQSession,
    membership: GroupMembership,
    nonce: Uint8Array = randomBytes(12),
): Uint8Array {
    requireSession(session);
    const plaintext = encodeMembership(membership);
    requireLength('nonce', nonce, 12);
    const header = membershipHeader(session, nonce);
    const sealed = chacha20poly1305(session.sessionKey, nonce, header).encrypt(plaintext);
    const note = concatBytes(header, sealed);
    if (note.length !== GROUP_MEMBERSHIP_NOTE_SIZE) {
        throw new PQError(`Group membership note is ${note.length} bytes`);
    }
    return note;
}

export function openGroupMembership(note: Uint8Array, session: PQSession): GroupMembership {
    requireSession(session);
    if (!isGroupMembership(note)) {
        throw new PQError('Not a group membership note');
    }
    const sender = note.slice(2, 34);
    const handshakeId = note.slice(34, 66);
    const nonce = note.slice(66, 78);
    if (!uint8ArrayEquals(sender, session.senderPublicKey)) {
        throw new PQError('Membership sender does not match the handshake');
    }
    if (!uint8ArrayEquals(handshakeId, session.handshakeId)) {
        throw new PQError('Membership is for a different handshake');
    }
    let plaintext: Uint8Array;
    try {
        plaintext = chacha20poly1305(session.sessionKey, nonce, note.slice(0, PQ_DATA_HEADER_SIZE)).decrypt(
            note.slice(PQ_DATA_HEADER_SIZE),
        );
    } catch {
        throw new PQError('Group membership authentication failed');
    }
    return decodeMembership(plaintext);
}

export function deriveGroupMessageKey(
    groupKey: Uint8Array,
    epoch: number,
    counter: number,
    groupId: Uint8Array,
    senderAddress: Uint8Array,
): Uint8Array {
    requireLength('group key', groupKey, 32);
    requireLength('group id', groupId, 32);
    requireLength('sender address', senderAddress, 32);
    requireEpoch(epoch);
    requireCounter(counter);
    const salt = new Uint8Array(8);
    writeUint32(salt, 0, epoch);
    writeUint32(salt, 4, counter);
    const info = concatBytes(new TextEncoder().encode(GROUP_INFO_LABEL), groupId, senderAddress);
    const key = hkdf(sha256, groupKey, salt, info, 32);
    if (key.length !== 32) {
        throw new PQError('Group message KDF returned a key that is not 32 bytes');
    }
    return key;
}

export function sealGroupMessage(
    plaintext: Uint8Array,
    groupKey: Uint8Array,
    groupId: Uint8Array,
    epoch: number,
    counter: number,
    senderAddress: Uint8Array,
    nonce: Uint8Array = randomBytes(12),
): Uint8Array {
    if (plaintext.length > GROUP_MAX_PAYLOAD_SIZE) {
        throw new PQError(`Group message too large: ${plaintext.length} bytes, max ${GROUP_MAX_PAYLOAD_SIZE}`);
    }
    requireLength('nonce', nonce, 12);
    const messageKey = deriveGroupMessageKey(groupKey, epoch, counter, groupId, senderAddress);
    const header = messageHeader(groupId, epoch, counter, nonce);
    const sealed = chacha20poly1305(messageKey, nonce, header).encrypt(plaintext);
    const note = concatBytes(header, sealed);
    if (note.length > MAX_NOTE_SIZE) {
        throw new PQError(`Group message note is ${note.length} bytes`);
    }
    return note;
}

export function openGroupMessage(
    note: Uint8Array,
    groupKey: Uint8Array,
    senderAddress: Uint8Array,
    accepted: readonly GroupCounter[],
): OpenedGroupMessage {
    if (!isGroupMessage(note)) {
        throw new PQError('Not a group message');
    }
    const groupId = note.slice(2, 34);
    const epoch = readUint32(note, 34);
    const counter = readUint32(note, 38);
    const nonce = note.slice(42, 54);
    requireEpoch(epoch);
    requireCounter(counter);
    if (accepted.some((item) => item.epoch === epoch && item.counter === counter)) {
        throw new PQError('Repeated group counter');
    }
    const messageKey = deriveGroupMessageKey(groupKey, epoch, counter, groupId, senderAddress);
    let plaintext: Uint8Array;
    try {
        plaintext = chacha20poly1305(messageKey, nonce, note.slice(0, GROUP_MESSAGE_HEADER_SIZE)).decrypt(
            note.slice(GROUP_MESSAGE_HEADER_SIZE),
        );
    } catch {
        throw new PQError('Group message authentication failed');
    }
    return { plaintext, groupId, epoch, counter };
}

function requireSession(session: PQSession): void {
    requireLength('session key', session.sessionKey, 32);
    requireLength('sender public key', session.senderPublicKey, 32);
    requireLength('handshake id', session.handshakeId, 32);
}

function encodeMembership(membership: GroupMembership): Uint8Array {
    if (
        membership.action !== GROUP_ACTION.CREATE &&
        membership.action !== GROUP_ACTION.ADD &&
        membership.action !== GROUP_ACTION.REMOVE &&
        membership.action !== GROUP_ACTION.REKEY
    ) {
        throw new PQError('Group action is not create, add, remove, or rekey');
    }
    requireEpoch(membership.epoch);
    requireLength('group id', membership.groupId, 32);
    requireLength('mailbox', membership.mailbox, 32);
    requireLength('group key', membership.groupKey, 32);
    const out = new Uint8Array(GROUP_MEMBERSHIP_PLAINTEXT_SIZE);
    out[0] = membership.action;
    writeUint32(out, 1, membership.epoch);
    out.set(membership.groupId, 5);
    out.set(membership.mailbox, 37);
    out.set(membership.groupKey, 69);
    return out;
}

function decodeMembership(plaintext: Uint8Array): GroupMembership {
    if (plaintext.length !== GROUP_MEMBERSHIP_PLAINTEXT_SIZE) {
        throw new PQError('Group membership plaintext is the wrong length');
    }
    const membership = {
        action: plaintext[0],
        epoch: readUint32(plaintext, 1),
        groupId: plaintext.slice(5, 37),
        mailbox: plaintext.slice(37, 69),
        groupKey: plaintext.slice(69, 101),
    };
    encodeMembership(membership);
    return membership;
}

function membershipHeader(session: PQSession, nonce: Uint8Array): Uint8Array {
    const header = new Uint8Array(PQ_DATA_HEADER_SIZE);
    header[0] = PQ_PROTOCOL.VERSION;
    header[1] = GROUP_PROTOCOL_MEMBERSHIP;
    header.set(session.senderPublicKey, 2);
    header.set(session.handshakeId, 34);
    header.set(nonce, 66);
    return header;
}

function messageHeader(groupId: Uint8Array, epoch: number, counter: number, nonce: Uint8Array): Uint8Array {
    const header = new Uint8Array(GROUP_MESSAGE_HEADER_SIZE);
    header[0] = PQ_PROTOCOL.VERSION;
    header[1] = GROUP_PROTOCOL_MESSAGE;
    header.set(groupId, 2);
    writeUint32(header, 34, epoch);
    writeUint32(header, 38, counter);
    header.set(nonce, 42);
    return header;
}

function requireEpoch(epoch: number): void {
    if (!Number.isInteger(epoch) || epoch < 1 || epoch > 0xffffffff) {
        throw new PQError('Group epoch must be from 1 through 4294967295');
    }
}

function requireCounter(counter: number): void {
    if (!Number.isInteger(counter) || counter < 0 || counter > 0xffffffff) {
        throw new PQError('Group counter must be from 0 through 4294967295');
    }
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
    target[offset] = (value >>> 24) & 0xff;
    target[offset + 1] = (value >>> 16) & 0xff;
    target[offset + 2] = (value >>> 8) & 0xff;
    target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number): number {
    return ((source[offset] << 24) | (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3]) >>> 0;
}
