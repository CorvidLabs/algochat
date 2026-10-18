#!/usr/bin/env python3
"""Verify a nonempty explicit release range under the existing Attest policy.

Fetch refs/notes/attest from the canonical origin before calling this command.
This command does not sign, forward, fabricate, or publish evidence.
"""
import argparse
import subprocess


def release_range(base, head):
    def git(*args):
        return subprocess.check_output(['git', *args], text=True).strip()
    base_sha = git('rev-parse', '--verify', '--end-of-options', base + '^{commit}')
    head_sha = git('rev-parse', '--verify', '--end-of-options', head + '^{commit}')
    subprocess.run(['git', 'merge-base', '--is-ancestor', base_sha, head_sha], check=True)
    if base_sha == head_sha:
        raise ValueError('empty release range is not evidence')
    return base_sha + '..' + head_sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base')
    parser.add_argument('head')
    args = parser.parse_args()
    try:
        selected = release_range(args.base, args.head)
        print('Checking explicit release range ' + selected, flush=True)
        return subprocess.run(['attest', 'verify', '--range', selected, '--policy', '.attest.json', '--json']).returncode
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'provenance failed: {error}\n')

if __name__ == '__main__':
    raise SystemExit(main())
