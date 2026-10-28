#!/usr/bin/env python3
"""Run one credential-free qualification lane; emit a receipt only on success."""
import argparse
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path
from evidence import REQUIRED, digest
from packages import validate_package

ROOT = Path(__file__).resolve().parents[2]
COMMANDS = []
VERSIONS = {}


def run(argv, cwd=ROOT):
    print('+', ' '.join(map(str, argv)), flush=True)
    result = subprocess.run(list(map(str, argv)), cwd=cwd, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end='', flush=True)
    COMMANDS.append({'argv': list(map(str, argv)), 'cwd': str(cwd),
                     'exit_code': result.returncode, 'output': result.stdout})
    result.check_returncode()
    return result.stdout


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def copy_artifact(source, output):
    shutil.copy2(source, output / source.name)


def source_archive(output, lane, paths):
    archive = output / (lane + '-source.tar')
    run(['git', 'archive', '--format=tar', '-o', archive, 'HEAD', *paths])
    return archive


def extract(archive, target):
    with tarfile.open(archive) as tar:
        # Only generated git/cargo archives, still reject path traversal and links.
        for member in tar.getmembers():
            if not (target / member.name).resolve().is_relative_to(target.resolve()) or not (member.isfile() or member.isdir()):
                raise ValueError('unsafe archive member')
        tar.extractall(target)


def resolve_npm_tarball(packed_stdout, destination, package_dir):
    """Return the tarball npm wrote, not a scoped name that only appears in JSON.

    npm 8 can report ``@scope/name-version.tgz`` while the archive on disk is
    ``scope-name-version.tgz``, and it can ignore ``--pack-destination``.
    """
    try:
        packed = json.loads(packed_stdout)
    except json.JSONDecodeError as error:
        raise ValueError('npm pack did not return JSON') from error
    if not isinstance(packed, list) or not packed or not isinstance(packed[0], dict):
        raise ValueError('npm pack JSON has no package entry')
    reported = packed[0].get('filename')
    names = []
    if isinstance(reported, str) and reported.endswith('.tgz'):
        names.append(Path(reported).name)
        if reported.startswith('@'):
            names.append(reported[1:].replace('/', '-'))
    seen = []
    for directory in (Path(destination), Path(package_dir)):
        for name in names:
            candidate = directory / name
            seen.append(candidate)
            if candidate.is_file():
                return _publish_tarball(candidate, destination)
        tarballs = sorted(path for path in directory.glob('*.tgz') if path.is_file())
        if len(tarballs) == 1:
            return _publish_tarball(tarballs[0], destination)
    raise FileNotFoundError('npm pack did not produce a readable tarball: ' + ', '.join(map(str, seen)))


def _publish_tarball(source, destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / source.name
    if source.resolve() != target.resolve():
        shutil.copy2(source, target)
    if not target.is_file() or target.stat().st_size == 0:
        raise FileNotFoundError(f'npm tarball is empty: {target}')
    return target


def qualify(lane, output, work):
    consumer = work / 'consumer'
    consumer.mkdir()
    if lane == 'ts':
        VERSIONS['bun'] = run(['bun', '--version']).strip()
        VERSIONS['node'] = run(['node', '--version']).strip()
        run(['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], ROOT / 'ts')
        run(['bun', 'test'], ROOT / 'ts')
        run(['bun', 'run', 'build'], ROOT / 'ts')
        packed_stdout = run(['npm', 'pack', '--ignore-scripts', '--json', '--pack-destination', output], ROOT / 'ts')
        archive = resolve_npm_tarball(packed_stdout, output, ROOT / 'ts')
        validate_package(lane, archive)
        write(consumer / 'package.json', '{"private":true,"type":"module"}')
        run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer)
        write(consumer / 'smoke.mjs', "import * as chat from '@corvidlabs/ts-algochat'; if (!Object.keys(chat).length) throw Error('empty exports');\n")
        run(['node', 'smoke.mjs'], consumer)
        write(consumer / 'smoke.ts', "import * as chat from '@corvidlabs/ts-algochat'; console.log(chat);\n")
        run([ROOT / 'ts/node_modules/.bin/tsc', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'smoke.ts'], consumer)
    elif lane == 'py':
        VERSIONS['python'] = run(['python', '--version']).strip()
        run(['python', '-m', 'pip', 'install', '-e', '.[dev]', 'build'], ROOT / 'py')
        run(['python', '-m', 'pytest'], ROOT / 'py')
        run(['python', '-m', 'build', '--outdir', output], ROOT / 'py')
        wheels = list(output.glob('*.whl'))
        sdists = list(output.glob('*.tar.gz'))
        assert len(wheels) == len(sdists) == 1
        for i, artifact in enumerate(wheels + sdists):
            env = work / f'venv-{i}'
            run(['python', '-m', 'venv', env])
            python = env / 'bin/python'
            run([python, '-m', 'pip', 'install', artifact], consumer)
            run([python, '-c', "import algochat; from importlib.metadata import version; assert version('py-algochat'); print(algochat.__file__)"], consumer)
    elif lane == 'rs':
        VERSIONS['rustc'] = run(['rustc', '--version']).strip()
        VERSIONS['cargo'] = run(['cargo', '--version']).strip()
        run(['cargo', 'generate-lockfile'], ROOT / 'rs')
        copy_artifact(ROOT / 'rs/Cargo.lock', output)
        run(['cargo', 'test', '--locked'], ROOT / 'rs')
        run(['cargo', 'package', '--locked'], ROOT / 'rs')
        crates = list((ROOT / 'rs/target/package').glob('*.crate'))
        assert len(crates) == 1
        copy_artifact(crates[0], output)
        extract(crates[0], work)
        crate = work / crates[0].name.removesuffix('.crate')
        write(consumer / 'Cargo.toml', '[package]\nname="release-consumer"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nalgochat={path=' + json.dumps(str(crate)) + '}\n')
        write(consumer / 'src/main.rs', 'use algochat as _; fn main() {}\n')
        run(['cargo', 'run'], consumer)
    elif lane == 'kt':
        VERSIONS['java'] = run(['java', '-version']).strip()
        VERSIONS['gradle'] = run(['gradle', '--version']).strip()
        repo = work / 'maven'
        run(['./gradlew', 'test', 'jar', 'sourcesJar', 'generatePomFileForMavenPublication',
             'publishToMavenLocal', '-Dmaven.repo.local=' + str(repo), '--no-daemon'], ROOT / 'kt')
        # Maven-local only: no configured remote repository publish task is invoked.
        import xml.etree.ElementTree as ET
        pom = ROOT / 'kt/build/publications/maven/pom-default.xml'
        root = ET.parse(pom).getroot()
        ns = {'m': 'http://maven.apache.org/POM/4.0.0'}
        coords = [root.find('m:' + key, ns).text for key in ('groupId', 'artifactId', 'version')]
        validate_package(lane, pom)
        copy_artifact(pom, output)
        for jar in (ROOT / 'kt/build/libs').glob('*.jar'):
            copy_artifact(jar, output)
        write(consumer / 'settings.gradle.kts', 'rootProject.name="release-consumer"\n')
        write(consumer / 'build.gradle.kts', '''import java.net.URLClassLoader
plugins { java }
repositories { maven { url = uri("''' + str(repo) + '''") }; mavenCentral() }
dependencies { implementation("''' + ':'.join(coords) + '''") }
tasks.register("smoke") { doLast {
    val jars = configurations.runtimeClasspath.get().files
    check(jars.any { it.name == "kt-algochat-0.4.0.jar" })
    val loader = URLClassLoader(jars.map { it.toURI().toURL() }.toTypedArray(), null)
    loader.loadClass("com.corvidlabs.algochat.Keys")
} }
''')
        run(['gradle', 'smoke', '--no-daemon'], consumer)
    elif lane == 'go':
        VERSIONS['go'] = run(['go', 'version']).strip()
        run(['go', 'test', './...'], ROOT / 'go')
        run(['go', 'build', './...'], ROOT / 'go')
        assert run(['go', 'list', '-m'], ROOT / 'go').strip() == 'github.com/CorvidLabs/algochat/go'
        archive = source_archive(output, 'go', ['go', 'vectors'])
        extract(archive, work)
        run(['go', 'test', '-run', '^TestPQParityFixture$', './...'], work / 'go')
        write(consumer / 'go.mod', 'module release-consumer\n\ngo 1.25.0\n\nrequire github.com/CorvidLabs/algochat/go v0.0.0\nreplace github.com/CorvidLabs/algochat/go => ' + str(work / 'go') + '\n')
        write(consumer / 'main.go', 'package main\nimport _ "github.com/CorvidLabs/algochat/go"\nfunc main() {}\n')
        run(['go', 'mod', 'tidy'], consumer)
        run(['go', 'run', '.'], consumer)
        write(output / 'distribution-limit.txt', 'Consumer uses an explicit local replacement of github.com/CorvidLabs/algochat/go. The release tag go/v0.4.0 is not fetched here.\n')
    elif lane in {'swift', 'swift-linux'}:
        VERSIONS['swift'] = run(['swift', '--version']).strip()
        if lane == 'swift':
            assert platform.system() == 'Darwin'
            VERSIONS['macOS'] = run(['sw_vers', '-productVersion']).strip()
            assert int(VERSIONS['macOS'].split('.')[0]) >= 26, 'Apple hybrid lane requires macOS 26+'
        else:
            assert platform.system() == 'Linux'
        run(['swift', 'test'])
        run(['swift', 'build'])
        if lane == 'swift-linux':
            # Expected failure is a successful assertion, not a successful ML-KEM call.
            binary = Path(run(['swift', 'build', '--show-bin-path']).strip()) / 'pqcross'
            code = "import subprocess,sys; p=subprocess.run([sys.argv[1]],capture_output=True); assert p.returncode==1 and p.stdout==b'' and p.stderr==b'ML-KEM-768 needs macOS 26\\n', (p.returncode,p.stdout,p.stderr)"
            run(['python3', '-c', code, binary])
        archive = source_archive(output, lane, ['Package.swift', 'swift/Sources', 'swift/Tests', 'vectors', 'LICENSE'])
        package = work / 'algochat'
        package.mkdir()
        extract(archive, package)
        run(['swift', 'test', '--filter', 'PQTests'], package)
        write(consumer / 'Package.swift', '// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name:"Consumer", platforms:[.macOS(.v12)], dependencies:[.package(path:' + json.dumps(str(package)) + ')], targets:[.executableTarget(name:"Consumer", dependencies:[.product(name:"AlgoChat", package:"algochat")])])\n')
        write(consumer / 'Sources/Consumer/main.swift', 'import AlgoChat\nprint("AlgoChat consumer import succeeded")\n')
        run(['swift', 'run', 'Consumer'], consumer)
        write(output / 'distribution-limit.txt', 'Consumer uses exported root Swift package sources. Remote tag selection and Apple runtime minima are separate owner gates.\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('lane', choices=sorted(REQUIRED))
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(ROOT) or output.exists():
        parser.error('output must be a new directory outside the checkout')
    sha = run(['git', 'rev-parse', 'HEAD']).strip()
    if run(['git', 'status', '--porcelain']).strip():
        parser.error('qualification requires a clean candidate checkout')
    expected = os.environ.get('CANDIDATE_SHA', sha)
    if sha != expected:
        parser.error('checkout differs from requested candidate')
    output.mkdir(parents=True)
    try:
        with tempfile.TemporaryDirectory(prefix='algochat-consumer-') as work:
            qualify(args.lane, output, Path(work))
        if run(['git', 'rev-parse', 'HEAD']).strip() != sha:
            raise ValueError('candidate changed during qualification')
        if run(['git', 'diff', '--exit-code', 'HEAD']).strip():
            raise ValueError('tracked tree changed during qualification')
        write(output / 'commands.json', json.dumps(COMMANDS, indent=2))
        files = sorted(p for p in output.iterdir() if p.is_file())
        if not any(p.name not in {'commands.json', 'distribution-limit.txt'} for p in files):
            raise ValueError('no package artifact generated')
        for artifact in files:
            validate_package(args.lane, artifact)
        receipt = {'schema': 1, 'lane': args.lane, 'sha': sha, 'tree_state': 'clean',
                   'category': 'hosted' if os.environ.get('GITHUB_ACTIONS') == 'true' else 'local',
                   'platform': platform.system() + '-' + platform.platform(), 'toolchain': VERSIONS,
                   'commands': [{k:v for k,v in c.items() if k != 'output'} for c in COMMANDS],
                   'artifacts': [{'path': p.name, 'sha256': digest(p)} for p in files]}
        write(output / 'receipt.json', json.dumps(receipt, indent=2))
    finally:
        write(output / 'commands.json', json.dumps(COMMANDS, indent=2))

if __name__ == '__main__':
    main()
