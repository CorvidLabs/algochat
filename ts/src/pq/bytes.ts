import { sha256 } from '@noble/hashes/sha256';

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    let length = 0;
    for (const part of parts) length += part.length;
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
    return sha256(data);
}

export function requireLength(name: string, value: Uint8Array, length: number): void {
    if (value.length !== length) {
        throw new Error(`${name} must be ${length} bytes, got ${value.length}`);
    }
}
