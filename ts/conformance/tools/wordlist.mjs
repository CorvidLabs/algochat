/**
 * Reads algosdk's English wordlist. algosdk does not export it, so this reads
 * the installed module file and fails if its shape changes.
 */
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

export function readEnglishWordlist() {
    const require = createRequire(import.meta.url);
    const root = path.dirname(require.resolve('algosdk/package.json'));
    const text = fs.readFileSync(path.join(root, 'dist/esm/mnemonic/wordlists/english.js'), 'utf8');
    const words = (text.match(/'[a-z]+'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    if (words.length !== 2048) {
        throw new Error(`algosdk English wordlist: expected 2048 words, found ${words.length}`);
    }
    return words;
}
