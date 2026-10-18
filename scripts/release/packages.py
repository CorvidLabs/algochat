"""Check package structure and identity; hosted consumers check actual usability."""
import json
import re
import tarfile
import tomllib
import zipfile
from email.parser import Parser
from pathlib import PurePosixPath
from xml.etree import ElementTree


def safe_name(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError('unsafe archive path')


def contents(path):
    if path.name.endswith(('.whl', '.jar')):
        with zipfile.ZipFile(path) as archive:
            if archive.testzip() is not None:
                raise ValueError('archive CRC failure')
            result = {}
            for entry in archive.infolist():
                safe_name(entry.filename)
                if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('archive symlink')
                if not entry.is_dir():
                    if entry.filename in result:
                        raise ValueError('duplicate archive member')
                    result[entry.filename] = archive.read(entry)
            return result
    with tarfile.open(path) as archive:
        result = {}
        for member in archive.getmembers():
            safe_name(member.name)
            if not (member.isfile() or member.isdir()):
                raise ValueError('archive links/special files are not package inputs')
            if member.isfile():
                if member.name in result:
                    raise ValueError('duplicate archive member')
                result[member.name] = archive.extractfile(member).read()
        return result


def require(files, name):
    if name not in files or not files[name]:
        raise ValueError('missing/empty package member: ' + name)
    return files[name]


def validate_package(lane, path):
    """Ignore ancillary logs/locks; validate the package formats for this lane."""
    try:
        if lane == 'kt' and path.suffix == '.xml':
            root = ElementTree.parse(path).getroot()
            ns = {'m': 'http://maven.apache.org/POM/4.0.0'}
            actual = [root.findtext('m:' + key, namespaces=ns) for key in ('groupId', 'artifactId', 'version')]
            if actual != ['com.corvidlabs', 'kt-algochat', '0.2.0']:
                raise ValueError('unexpected Kotlin POM coordinates')
            return
        if not path.name.endswith(('.tgz', '.whl', '.tar.gz', '.crate', '.jar', '.tar')):
            return
        files = contents(path)
        if lane == 'ts':
            manifest = json.loads(require(files, 'package/package.json'))
            if manifest['name'] != '@corvidlabs/ts-algochat':
                raise ValueError('unexpected TypeScript identity')
            require(files, 'package/dist/index.js')
            require(files, 'package/dist/index.d.ts')
        elif lane == 'py' and path.suffix == '.whl':
            metadata = [name for name in files if name.endswith('.dist-info/METADATA')]
            if len(metadata) != 1:
                raise ValueError('missing/ambiguous wheel metadata')
            name = Parser().parsestr(require(files, metadata[0]).decode())['Name']
            if name is None or re.sub(r'[-_.]+', '-', name).lower() != 'py-algochat':
                raise ValueError('unexpected Python wheel identity')
            require(files, 'algochat/__init__.py')
        elif lane in {'py', 'rs'}:
            manifest = 'pyproject.toml' if lane == 'py' else 'Cargo.toml'
            matches = [name for name in files if len(PurePosixPath(name).parts) == 2 and name.endswith('/' + manifest)]
            if len(matches) != 1:
                raise ValueError('missing/ambiguous source manifest')
            data = tomllib.loads(require(files, matches[0]).decode())
            section, identity, source = ('project', 'py-algochat', 'src/algochat/__init__.py') if lane == 'py' else ('package', 'algochat', 'src/lib.rs')
            if data[section]['name'] != identity:
                raise ValueError('unexpected source package identity')
            require(files, str(PurePosixPath(matches[0]).parent / source))
        elif lane == 'kt':
            if path.name.endswith('-sources.jar'):
                require(files, 'com/corvidlabs/algochat/Keys.kt')
            elif path.name.endswith('-javadoc.jar'):
                require(files, 'META-INF/MANIFEST.MF')
            else:
                require(files, 'com/corvidlabs/algochat/Keys.class')
        elif lane == 'go':
            require(files, 'vectors/pq-mlkem768.json')
            module = require(files, 'go/go.mod').decode()
            if not re.search(r'^module\s+github\.com/CorvidLabs/algochat/go\s*$', module, re.M):
                raise ValueError('unexpected Go module identity')
            if not any(name.startswith('go/') and name.endswith('.go') for name in files):
                raise ValueError('Go sources missing')
        elif lane in {'swift', 'swift-linux'}:
            require(files, 'vectors/pq-mlkem768.json')
            manifest = require(files, 'Package.swift').decode()
            if not re.search(r'name:\s*"algochat"', manifest):
                raise ValueError('unexpected Swift package name')
            if not re.search(r'\.library\(\s*name:\s*"AlgoChat"', manifest):
                raise ValueError('AlgoChat Swift product missing')
            if not any(name.startswith('swift/Sources/AlgoChat/') and name.endswith('.swift') for name in files):
                raise ValueError('Swift sources missing')
    except (KeyError, TypeError, UnicodeError, tarfile.TarError, zipfile.BadZipFile, ElementTree.ParseError) as error:
        raise ValueError(f'invalid {lane} package {path.name}: {error}') from error
