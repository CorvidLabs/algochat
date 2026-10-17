/**
 * AlgoChat Web - PSK Exchange URI
 *
 * Encodes/decodes PSK exchange URIs for out-of-band key sharing.
 *
 * Format: algochat-psk://v1?addr=<address>&psk=<base64url>&label=<label>
 */

/**
 * Encodes a Uint8Array to base64url (URL-safe base64 without padding).
 */
function toBase64Url(data: Uint8Array): string {
    // Convert to standard base64
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);

    // Convert to base64url: replace + with -, / with _, strip = padding
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Decodes a base64url string to Uint8Array.
 */
function fromBase64Url(str: string): Uint8Array {
    // Convert from base64url to standard base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const pad = base64.length % 4;
    if (pad === 2) {
        base64 += '==';
    } else if (pad === 3) {
        base64 += '=';
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Creates a PSK exchange URI for out-of-band key sharing.
 *
 * @param address - Algorand address
 * @param psk - Pre-shared key (32 bytes)
 * @param label - Optional human-readable label
 * @returns URI string
 */
export function createPSKExchangeURI(address: string, psk: Uint8Array, label?: string): string {
    const pskEncoded = toBase64Url(psk);
    let uri = `algochat-psk://v1?addr=${encodeURIComponent(address)}&psk=${pskEncoded}`;

    if (label !== undefined && label.length > 0) {
        uri += `&label=${encodeURIComponent(label)}`;
    }

    return uri;
}

/**
 * Parses a PSK exchange URI.
 *
 * @param uri - URI string to parse
 * @returns Parsed components: address, psk, and optional label
 * @throws Error if URI format is invalid
 */
export function parsePSKExchangeURI(uri: string): { address: string; psk: Uint8Array; label?: string } {
    if (!uri.startsWith('algochat-psk://v1?')) {
        throw new Error(`Invalid PSK exchange URI scheme: ${uri.split('?')[0]}`);
    }

    const queryString = uri.slice('algochat-psk://v1?'.length);
    const params = new URLSearchParams(queryString);

    const address = params.get('addr');
    if (!address) {
        throw new Error('Missing addr parameter in PSK exchange URI');
    }

    const pskParam = params.get('psk');
    if (!pskParam) {
        throw new Error('Missing psk parameter in PSK exchange URI');
    }

    const psk = fromBase64Url(pskParam);
    if (psk.length !== 32) {
        throw new Error(`PSK must be 32 bytes, got ${psk.length}`);
    }

    const label = params.get('label') ?? undefined;

    return { address, psk, label };
}
