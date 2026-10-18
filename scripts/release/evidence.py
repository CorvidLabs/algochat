#!/usr/bin/env python3
"""Fail-closed qualification receipts. Hashes bind bytes, not reviewer trust."""
import argparse
import hashlib
import fnmatch
import json
import re
from pathlib import Path

EXPECTED = {'ts': ['*.tgz'], 'py': ['*.whl', '*.tar.gz'], 'rs': ['*.crate', 'Cargo.lock'],
            'kt': ['*.jar', '*.xml'], 'go': ['go-source.tar'],
            'swift': ['swift-source.tar'], 'swift-linux': ['swift-linux-source.tar']}
REQUIRED = set(EXPECTED)

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def validate(directory, sha):
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('expected a full candidate SHA')
    directory = Path(directory).resolve()
    seen = set()
    receipts = list(directory.rglob('receipt.json'))
    for path in receipts:
        data = json.loads(path.read_text())
        lane = data['lane']
        if lane not in REQUIRED or lane in seen:
            raise ValueError('unknown or duplicate lane')
        seen.add(lane)
        if data['schema'] != 1 or data['sha'] != sha or data['tree_state'] != 'clean':
            raise ValueError('stale or dirty source evidence')
        if data['category'] != 'hosted' or not data['platform'] or not data['toolchain']:
            raise ValueError('missing hosted platform/toolchain evidence')
        if lane == 'swift' and not data['platform'].startswith('Darwin'):
            raise ValueError('required Apple lane absent')
        if not data['commands'] or any(c['exit_code'] != 0 or not c['argv'] for c in data['commands']):
            raise ValueError('missing or failed command')
        if not data['artifacts']:
            raise ValueError('missing artifact')
        names = [a['path'] for a in data['artifacts']]
        if any(not any(fnmatch.fnmatchcase(name, pattern) for name in names) for pattern in EXPECTED[lane]):
            raise ValueError('missing required package artifact')
        for artifact in data['artifacts']:
            target = (path.parent / artifact['path']).resolve()
            if not target.is_relative_to(path.parent.resolve()) or not target.is_file():
                raise ValueError('missing or unsafe artifact path')
            if not re.fullmatch(r'[0-9a-f]{64}', artifact['sha256']) or digest(target) != artifact['sha256']:
                raise ValueError('artifact digest mismatch')
    if seen != REQUIRED:
        raise ValueError('missing lanes: ' + ', '.join(sorted(REQUIRED - seen)))
    return {'sha': sha, 'qualified_lanes': sorted(seen), 'release_authorized': False,
            'scope': 'hosted tests and consumers only; provenance and owner decisions are separate gates'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('sha')
    args = parser.parse_args()
    try:
        print(json.dumps(validate(args.directory, args.sha), indent=2))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f'qualification failed: {error}\n')
