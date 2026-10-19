import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evidence import REQUIRED, EXPECTED, digest, validate
from provenance import release_range
from qualify import extract
from packages import validate_package
import io
import tarfile
import zipfile
import re

SHA = 'a' * 40

def make_package(lane, path, wrong_identity=False, missing_member=False):
    name = 'wrong' if wrong_identity else None
    if path.name == 'Cargo.lock':
        path.write_text('version = 4\n'); return
    if path.suffix == '.xml':
        path.write_text('<project xmlns="http://maven.apache.org/POM/4.0.0"><groupId>com.corvidlabs</groupId><artifactId>' + (name or 'kt-algochat') + '</artifactId><version>0.3.0</version></project>'); return
    if lane == 'ts':
        files={'package/package.json':json.dumps({'name':name or '@corvidlabs/ts-algochat'}).encode(), 'package/dist/index.js':b'export {};', 'package/dist/index.d.ts':b'export {};'}
    elif lane == 'py' and path.suffix == '.whl':
        files={'py_algochat-0.2.0.dist-info/METADATA':('Name: '+(name or 'py-algochat')+'\nVersion: 0.2.0\n').encode(), 'algochat/__init__.py':b'# package'}
    elif lane == 'py':
        files={'py_algochat-0.2.0/pyproject.toml':('[project]\nname="'+(name or 'py-algochat')+'"\n').encode(), 'py_algochat-0.2.0/src/algochat/__init__.py':b'# package'}
    elif lane == 'rs':
        files={'algochat-0.3.0/Cargo.toml':('[package]\nname="'+(name or 'algochat')+'"\n').encode(), 'algochat-0.3.0/src/lib.rs':b'// source'}
    elif lane == 'kt':
        files={('wrong.class' if wrong_identity else 'com/corvidlabs/algochat/Keys.class'):b'CAFEBABE'}
    elif lane == 'go':
        files={'go/go.mod':('module '+(name or 'github.com/CorvidLabs/algochat/go')+'\n').encode(), 'go/chat.go':b'package algochat'}
    else:
        files={'Package.swift':('let package = Package(name: "'+('wrong' if wrong_identity else 'algochat')+'")\n.library(name: "'+(name or 'AlgoChat')+'", targets: ["AlgoChat"])').encode(), 'swift/Sources/AlgoChat/Chat.swift':b'// source'}
    if lane in {'go', 'swift', 'swift-linux'}:
        files['vectors/pq-mlkem768.json'] = b'{"handshake_bytes":2366}'
    if missing_member:
        del files[next(iter(files))]
    if path.suffix in {'.whl','.jar'}:
        with zipfile.ZipFile(path,'w') as archive:
            for member, data in files.items(): archive.writestr(member,data)
    else:
        with tarfile.open(path,'w:gz' if path.name.endswith(('.tgz','.tar.gz','.crate')) else 'w') as archive:
            for member,data in files.items():
                info=tarfile.TarInfo(member);info.size=len(data);archive.addfile(info,io.BytesIO(data))


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for lane in REQUIRED:
            path = self.root / lane
            path.mkdir()
            names = [pattern.replace('*', 'package') for pattern in EXPECTED[lane]]
            for name in names: make_package(lane, path / name)
            record = {'schema':1, 'lane':lane, 'sha':SHA, 'tree_state':'clean', 'category':'hosted',
                'platform':'Darwin-26' if lane == 'swift' else 'Linux', 'toolchain':{'tool':'1'},
                'commands':[{'argv':['test'], 'exit_code':0}],
                'artifacts':[{'path':name,'sha256':digest(path/name)} for name in names]}
            (path / 'receipt.json').write_text(json.dumps(record))

    def mutate(self, callback):
        path = self.root / 'ts/receipt.json'
        data = json.loads(path.read_text())
        callback(data)
        path.write_text(json.dumps(data))

    def test_complete(self):
        self.assertFalse(validate(self.root, SHA)['release_authorized'])

    def test_invalid_evidence(self):
        original = (self.root / 'ts/receipt.json').read_text()
        mutations = [lambda d:d.update(sha='b'*40), lambda d:d.update(tree_state='dirty'),
            lambda d:d.update(category='author-reported'), lambda d:d.update(commands=[]),
            lambda d:d['commands'][0].update(exit_code=1), lambda d:d['commands'][0].update(exit_code=False), lambda d:d['commands'][0].update(argv='fake'), lambda d:d.update(artifacts=[]),
            lambda d:d.update(toolchain={}), lambda d:d.update(toolchain={'compiler':False}), lambda d:d.update(schema=True), lambda d:d.update(lane='unknown'),
            lambda d:d['artifacts'][0].update(path='../escape'),
            lambda d:d['artifacts'][0].update(sha256='0'*64), lambda d:d.update(schema=2), lambda d:d['artifacts'][0].update(path='commands.json')]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                (self.root / 'ts/receipt.json').write_text(original)
                self.mutate(mutation)
                with self.assertRaises(ValueError): validate(self.root,SHA)

    def test_missing_lane(self):
        (self.root/'go/receipt.json').unlink()
        with self.assertRaises(ValueError): validate(self.root,SHA)

    def test_missing_apple(self):
        path = self.root/'swift/receipt.json'
        data=json.loads(path.read_text()); data['platform']='Linux'; path.write_text(json.dumps(data))
        with self.assertRaises(ValueError): validate(self.root,SHA)

    def test_missing_or_tampered_artifact(self):
        (self.root/'ts/package.tgz').write_bytes(b'tampered')
        with self.assertRaises(ValueError): validate(self.root,SHA)
        (self.root/'ts/package.tgz').unlink()
        with self.assertRaises(ValueError): validate(self.root,SHA)

    def test_malformed(self):
        (self.root/'ts/receipt.json').write_text('{')
        with self.assertRaises(ValueError): validate(self.root,SHA)

    def test_duplicate(self):
        copy_path=self.root/'duplicate'; copy_path.mkdir()
        (copy_path/'receipt.json').write_text((self.root/'ts/receipt.json').read_text())
        with self.assertRaises(ValueError): validate(self.root,SHA)

class PackageTests(unittest.TestCase):
    def test_wrong_identity_and_malformed_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            for lane, patterns in EXPECTED.items():
                for pattern in patterns:
                    path=Path(directory)/pattern.replace('*','package')
                    if path.name == 'Cargo.lock': continue
                    with self.subTest(lane=lane,artifact=path.name):
                        make_package(lane,path)
                        validate_package(lane,path)
                        if path.suffix != '.xml':
                            make_package(lane,path,missing_member=True)
                            with self.assertRaises(ValueError): validate_package(lane,path)
                        make_package(lane,path,wrong_identity=True)
                        with self.assertRaises(ValueError): validate_package(lane,path)
                        path.write_bytes(b'candidate bytes')
                        with self.assertRaises(ValueError): validate_package(lane,path)

    def test_receipt_integrity_is_distinct_from_package_validation(self):
        fixture=EvidenceTests();fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        artifact=fixture.root/'ts/package.tgz'
        artifact.write_bytes(b'candidate bytes')
        fixture.mutate(lambda data:data['artifacts'][0].update(sha256=digest(artifact)))
        validate(fixture.root,SHA)  # A hash is not semantic validation or an attestation.
        with self.assertRaises(ValueError): validate_package('ts',artifact)


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.git('init','-q'); self.git('config','user.email','test@example.invalid'); self.git('config','user.name','Test')
        self.git('commit','--allow-empty','-qm','base'); self.base=self.git('rev-parse','HEAD')
        self.git('commit','--allow-empty','-qm','candidate'); self.head=self.git('rev-parse','HEAD')

    def git(self,*args):
        return subprocess.check_output(['git','-C',str(self.root),*args],text=True).strip()

    def check_range(self,base,head):
        import os
        cwd=os.getcwd()
        try:
            os.chdir(self.root)
            return release_range(base,head)
        finally: os.chdir(cwd)

    def test_valid(self):
        self.assertEqual(self.check_range(self.base,self.head),self.base+'..'+self.head)

    def test_empty(self):
        with self.assertRaises(ValueError): self.check_range(self.head,self.head)

    def test_invalid_and_nonancestor(self):
        with self.assertRaises(subprocess.CalledProcessError): self.check_range('missing',self.head)
        with self.assertRaises(subprocess.CalledProcessError): self.check_range(self.head,self.base)

    def test_attest_failure_propagates(self):
        import provenance
        with patch('sys.argv',['provenance',self.base,self.head]), patch('provenance.release_range',return_value='base..head'), patch('provenance.subprocess.run',return_value=subprocess.CompletedProcess([],1)) as run:
            self.assertEqual(provenance.main(),1)
            self.assertIn('.attest.json',run.call_args.args[0])

    def test_missing_attest(self):
        import provenance
        with patch('sys.argv',['provenance',self.base,self.head]), patch('provenance.release_range',return_value='base..head'), patch('provenance.subprocess.run',side_effect=FileNotFoundError('attest')):
            with self.assertRaises(SystemExit) as error: provenance.main()
            self.assertEqual(error.exception.code,1)

class ArchiveTests(unittest.TestCase):
    def test_real_swift_source_archive(self):
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            archive = work / 'swift.tar'
            subprocess.run(['git', 'archive', '-o', str(archive), 'HEAD', 'Package.swift', 'swift/Sources', 'swift/Tests', 'vectors', 'LICENSE'], cwd=root, check=True)
            target = work / 'consumer'
            target.mkdir()
            extract(archive, target)
            self.assertTrue((target / 'vectors/pq-mlkem768.json').is_file())
            self.assertTrue((target / 'Package.swift').is_file())
            self.assertTrue((target / 'swift/Sources/AlgoChat').is_dir())


    def test_reject_links_and_special_files(self):
        for kind in (tarfile.SYMTYPE,tarfile.LNKTYPE,tarfile.FIFOTYPE,tarfile.CHRTYPE,tarfile.BLKTYPE):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root=Path(directory); archive=root/'unsafe.tar'
                with tarfile.open(archive,'w') as tar:
                    member=tarfile.TarInfo('unsafe');member.type=kind;member.linkname='outside';tar.addfile(member)
                with self.assertRaises(ValueError): extract(archive,root/'consumer')

    def test_reject_traversal(self):
        import tarfile
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); archive=root/'bad.tar'
            with tarfile.open(archive,'w') as tar: tar.addfile(tarfile.TarInfo('../escape'))
            with self.assertRaises(ValueError): extract(archive,root/'consumer')

def check_workflow(text):
    if re.findall(r'(?m)^permissions:\n  contents: ([^\n]+)',text) != ['read']:
        raise ValueError('qualification requires explicit read-only permissions')
    if re.search(r'(?i)\b(write|id-token|secrets|publish)\b',text):
        raise ValueError('publication-capable workflow configuration')
    if 'persist-credentials: false' not in text:
        raise ValueError('checkout credentials must not persist')


def _workflows(root):
    parsed = {}
    for path in sorted((root / '.github/workflows').glob('*.yml')):
        parsed[path.name] = _parse_workflow(path.read_text())
    return parsed


def _parse_workflow(text):
    lines = [line for line in text.splitlines() if line.strip() and not line.lstrip().startswith('#')]
    value, index = _parse_node(lines, 0, 0)
    if index != len(lines):
        raise ValueError('unparsed workflow line: ' + lines[index])
    return value


def _indent(line):
    return len(line) - len(line.lstrip(' '))


def _parse_node(lines, index, indent):
    if index < len(lines) and _indent(lines[index]) == indent and lines[index].lstrip().startswith('-'):
        return _parse_list(lines, index, indent)
    return _parse_mapping(lines, index, indent)


def _parse_mapping(lines, index, indent):
    mapping = {}
    while index < len(lines) and _indent(lines[index]) == indent and not lines[index].lstrip().startswith('-'):
        key, value, index = _parse_pair(lines, index, indent)
        mapping[key] = value
    return mapping, index


def _parse_list(lines, index, indent):
    items = []
    while index < len(lines) and _indent(lines[index]) == indent and lines[index].lstrip().startswith('-'):
        raw = lines[index]
        body = raw.lstrip()[1:]
        content = body.lstrip()
        if content.startswith(('"', "'", '!', '[', '{')) or ':' not in content:
            items.append(_scalar(content))
            index += 1
            continue
        content_indent = _indent(raw) + 1 + (len(body) - len(content))
        lines[index] = ' ' * content_indent + content
        item, index = _parse_mapping(lines, index, content_indent)
        items.append(item)
    return items, index


def _parse_pair(lines, index, indent):
    key, _, rest = lines[index].strip().partition(':')
    key = key.strip().strip('"').strip("'")
    rest = rest.strip()
    index += 1
    if rest in {'|', '|-', '|+', '>', '>-', '>+'}:
        block = []
        while index < len(lines) and _indent(lines[index]) > indent:
            block.append(lines[index].strip())
            index += 1
        return key, '\n'.join(block), index
    if rest == '':
        if index < len(lines) and _indent(lines[index]) > indent:
            value, index = _parse_node(lines, index, _indent(lines[index]))
            return key, value, index
        return key, None, index
    return key, _scalar(rest), index


def _scalar(text):
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        return text[1:-1]
    if text == 'true':
        return True
    if text == 'false':
        return False
    if text in {'null', '~'}:
        return None
    if text.startswith('[') and text.endswith(']') and '{' not in text:
        inner = text[1:-1].strip()
        return [] if not inner else [_scalar(part.strip()) for part in inner.split(',')]
    return text


def _event_block(document, event):
    trigger = document.get('on')
    if not isinstance(trigger, dict) or event not in trigger:
        return None
    block = trigger.get(event)
    return {} if block is None else block


def _glob_match(path, pattern):
    pattern = pattern[1:] if pattern.startswith('!') else pattern
    regex = ['^']
    index = 0
    while index < len(pattern):
        if pattern.startswith('**/', index):
            regex.append('(?:.*/)?')
            index += 3
        elif pattern.startswith('**', index):
            regex.append('.*')
            index += 2
        elif pattern[index] == '*':
            regex.append('[^/]*')
            index += 1
        elif pattern[index] == '?':
            regex.append('[^/]')
            index += 1
        else:
            regex.append(re.escape(pattern[index]))
            index += 1
    regex.append('$')
    return re.match(''.join(regex), path) is not None


def _paths_match(path, patterns):
    matched = False
    for pattern in patterns:
        body = pattern[1:] if str(pattern).startswith('!') else pattern
        if _glob_match(path, body):
            matched = not str(pattern).startswith('!')
    return matched


def _triggered(document, event, changed):
    block = _event_block(document, event)
    if block is None:
        return False
    if not isinstance(block, dict):
        return True
    if 'paths' in block and 'paths-ignore' in block:
        raise ValueError('paths and paths-ignore cannot be combined')
    if 'paths' in block:
        return _paths_match(changed, block['paths'] or [])
    if 'paths-ignore' in block:
        return not any(_glob_match(changed, pattern) for pattern in block['paths-ignore'] or [])
    return True


def _truthy(value):
    if value is None or value is False:
        return False
    if isinstance(value, str):
        return value != ''
    if isinstance(value, (int, float)):
        return value != 0
    return True


def _as_number(value):
    if value is None or value is False:
        return 0
    if value is True:
        return 1
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        if value == '':
            return 0
        return float(value) if re.fullmatch(r'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?', value) else float('nan')
    return float('nan')


def _loose_equal(left, right):
    if isinstance(left, str) and isinstance(right, str):
        return left.lower() == right.lower()
    if type(left) is type(right):
        return left == right
    left_number, right_number = _as_number(left), _as_number(right)
    if left_number != left_number or right_number != right_number:
        return False
    return left_number == right_number


_EXPR = re.compile(r"\s+|&&|\|\||==|!=|!|\(|\)|,|\.|true|false|null|'(?:[^']|'')*'|[A-Za-z_][\w-]*|\d+(?:\.\d+)?")


def _github_if(expression, event_name, inputs):
    """Evaluate the job condition a called workflow actually sees.

    github.event_name stays the caller event. It is never workflow_call.
    A missing input is an empty string, not the workflow_call default.
    """
    text = expression.strip()
    if text.startswith('${{') and text.endswith('}}'):
        text = text[3:-2].strip()
    tokens, cursor = [], 0
    while cursor < len(text):
        match = _EXPR.match(text, cursor)
        if not match:
            raise ValueError('unsupported workflow expression: ' + text[cursor:])
        cursor = match.end()
        if not match.group(0).isspace():
            tokens.append(match.group(0))

    def lookup(path):
        if path == ['github', 'event_name']:
            return event_name
        if len(path) == 2 and path[0] == 'inputs':
            return inputs.get(path[1], '')
        return ''

    def call(path):
        name = '.'.join(path)
        if name == 'always' or name == 'success':
            return True
        if name in {'failure', 'cancelled'}:
            return False
        raise ValueError('unsupported workflow call: ' + name)

    position = 0

    def peek():
        return tokens[position] if position < len(tokens) else None

    def pop():
        nonlocal position
        token = peek()
        if token is None:
            raise ValueError('truncated workflow expression: ' + text)
        position += 1
        return token

    def parse_or():
        value = parse_and()
        while peek() == '||':
            pop()
            right = parse_and()
            value = value if _truthy(value) else right
        return value

    def parse_and():
        value = parse_not()
        while peek() == '&&':
            pop()
            right = parse_not()
            value = right if _truthy(value) else value
        return value

    def parse_not():
        if peek() == '!':
            pop()
            return not _truthy(parse_not())
        return parse_cmp()

    def parse_cmp():
        value = parse_atom()
        if peek() in {'==', '!='}:
            operator = pop()
            right = parse_atom()
            same = _loose_equal(value, right)
            return same if operator == '==' else not same
        return value

    def parse_atom():
        token = pop()
        if token == '(':
            value = parse_or()
            if pop() != ')':
                raise ValueError('expected ) in ' + text)
            return value
        if token == 'true':
            return True
        if token == 'false':
            return False
        if token == 'null':
            return None
        if token.startswith("'"):
            return token[1:-1].replace("''", "'")
        if token[0].isdigit():
            return float(token) if '.' in token else int(token)
        path = [token]
        while peek() == '.':
            pop()
            path.append(pop())
        if peek() == '(':
            pop()
            if pop() != ')':
                raise ValueError('unsupported call arguments in ' + text)
            return call(path)
        return lookup(path)

    value = parse_or()
    if peek() is not None:
        raise ValueError('trailing workflow expression: ' + peek())
    return value


def _job_enabled(job, event_name, inputs):
    condition = job.get('if') if isinstance(job, dict) else None
    if condition is None:
        return True
    if not isinstance(condition, str):
        return _truthy(condition)
    return _truthy(_github_if(condition, event_name, inputs))


def _resolved_inputs(document, passed, called):
    if not called:
        return {}
    defined = (((document.get('on') or {}).get('workflow_call') or {}).get('inputs') or {})
    resolved = {}
    for name, spec in defined.items():
        if name in passed:
            resolved[name] = passed[name]
        elif isinstance(spec, dict) and 'default' in spec:
            resolved[name] = spec['default']
        else:
            resolved[name] = ''
    return resolved


def _emits_swift_linux(job):
    for step in job.get('steps') or []:
        if not isinstance(step, dict):
            continue
        run = step.get('run') if isinstance(step.get('run'), str) else ''
        if re.search(r'qualify\.py\s+swift-linux\b', run):
            return True
        uses = step.get('uses') if isinstance(step.get('uses'), str) else ''
        artifact = (step.get('with') or {}).get('name') if isinstance(step.get('with'), dict) else None
        if 'upload-artifact' in uses and artifact == 'qualification-swift-linux':
            return True
    return False


def _runs_publication_checks(job):
    for step in job.get('steps') or []:
        run = step.get('run') if isinstance(step, dict) and isinstance(step.get('run'), str) else ''
        if 'unittest' in run and ('scripts/release' in run or 'WorkflowTests' in run or 'test_release' in run):
            return True
    return False


def _walk_jobs(workflows, name, event_name, passed, called, stack, visit):
    if name in stack:
        raise ValueError('workflow cycle: ' + name)
    document = workflows[name]
    inputs = _resolved_inputs(document, passed, called)
    for job_name, job in (document.get('jobs') or {}).items():
        if not isinstance(job, dict) or not _job_enabled(job, event_name, inputs):
            continue
        visit(name, job_name, job)
        uses = job.get('uses')
        if isinstance(uses, str) and uses.startswith('./.github/workflows/') and uses.endswith('.yml'):
            _walk_jobs(workflows, uses.rsplit('/', 1)[-1], event_name, job.get('with') or {}, True, stack + (name,), visit)


def _swift_linux_jobs(workflows, entry, event_name):
    found = []
    def visit(name, job_name, job):
        if _emits_swift_linux(job):
            found.append(name + ':' + job_name)
    _walk_jobs(workflows, entry, event_name, {}, False, (), visit)
    return found


def _safety_checks_run(workflows, changed, event_name):
    triggered = [name for name, document in workflows.items() if _triggered(document, event_name, changed)]
    found = []
    for name in triggered:
        def visit(workflow_name, job_name, job, source=name):
            if _runs_publication_checks(job):
                found.append(source + '→' + workflow_name + ':' + job_name)
        _walk_jobs(workflows, name, event_name, {}, False, (), visit)
    return triggered, found


class WorkflowTests(unittest.TestCase):
    def test_no_publication_workflows(self):
        root=Path(__file__).resolve().parents[2]
        for name in ['ts','py','rs','kt','go','swift','release-qualification','workflow-safety']:
            text=(root/'.github/workflows'/f'{name}.yml').read_text()
            check_workflow(text)
            for extra in ['\n  packages: write', '\n  id-token: write', '\n  run: npm publish', '\n  env: ${{ secrets.TOKEN }}']:
                with self.assertRaises(ValueError): check_workflow(text+extra)
        script=(root/'scripts/release/qualify.py').read_text()
        # Bounded command regression guard, not a general malicious-code sandbox.
        self.assertNotRegex(script, r"['\"](?:npm|cargo)['\"]\s*,\s*['\"]publish['\"]")
        self.assertNotRegex(script, r"['\"](?:publish|publishAllPublicationsToGitHubPackagesRepository|publishMavenPublicationToGitHubPackagesRepository)['\"]")
        self.assertIn("'publishToMavenLocal'",script)

    def test_readme_does_not_run_the_language_matrix(self):
        root = Path(__file__).resolve().parents[2]
        orchestrator = (root / '.github/workflows/release-qualification.yml').read_text()
        self.assertIn('paths:', orchestrator)
        self.assertNotIn('"README.md"', orchestrator)
        self.assertNotIn('"docs/**"', orchestrator)
        self.assertNotIn('"hi/**"', orchestrator)
        lanes = {
            'ts': 'ts/**',
            'py': 'py/**',
            'rs': 'rs/**',
            'kt': 'kt/**',
            'go': 'go/**',
            'swift': 'swift/**',
        }
        for name, own in lanes.items():
            text = (root / '.github/workflows' / f'{name}.yml').read_text()
            self.assertIn(f'"{own}"', text)
            self.assertIn('"!**/*.md"', text)
            self.assertNotIn('"README.md"', text)

    def test_matrix_emits_one_swift_linux_receipt(self):
        workflows = _workflows(Path(__file__).resolve().parents[2])
        # The called workflow does not observe workflow_call. An event_name
        # guard therefore stays true and would qualify Linux twice.
        self.assertTrue(_truthy(_github_if("github.event_name != 'workflow_call'", 'pull_request', {})))
        self.assertFalse(_truthy(_github_if("inputs.skip_linux != true", 'pull_request', {'skip_linux': True})))
        self.assertTrue(_truthy(_github_if("inputs.skip_linux != true", 'pull_request', {})))
        for event in ('pull_request', 'push', 'workflow_dispatch'):
            matrix = _swift_linux_jobs(workflows, 'release-qualification.yml', event)
            direct = _swift_linux_jobs(workflows, 'swift.yml', event)
            self.assertEqual(matrix, ['release-qualification.yml:swift-linux'], event)
            self.assertEqual(direct, ['swift.yml:linux'], event)

    def test_lane_workflow_edit_runs_safety_checks(self):
        root = Path(__file__).resolve().parents[2]
        workflows = _workflows(root)
        lanes = ['ts', 'py', 'rs', 'kt', 'go', 'swift', 'workflow-safety']
        for event in ('pull_request', 'push'):
            for name in lanes:
                changed = f'.github/workflows/{name}.yml'
                triggered, checks = _safety_checks_run(workflows, changed, event)
                self.assertNotIn('release-qualification.yml', triggered, changed)
                self.assertTrue(checks, changed)
                text = (root / '.github/workflows' / f'{name}.yml').read_text()
                with self.assertRaises(ValueError):
                    check_workflow(text + '\n  packages: write')
                with self.assertRaises(ValueError):
                    check_workflow(text + '\n  run: npm publish')


class NpmPackTests(unittest.TestCase):
    def test_scoped_json_name_uses_the_archive_on_disk(self):
        from qualify import resolve_npm_tarball
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'out'
            package = root / 'pkg'
            destination.mkdir()
            package.mkdir()
            written = destination / 'corvidlabs-ts-algochat-0.9.0.tgz'
            written.write_bytes(b'packed-bytes')
            stdout = json.dumps([{'filename': '@corvidlabs/ts-algochat-0.9.0.tgz'}])
            found = resolve_npm_tarball(stdout, destination, package)
            self.assertEqual(found, written)
            self.assertEqual(found.read_bytes(), b'packed-bytes')

    def test_pack_destination_miss_copies_the_package_directory_archive(self):
        from qualify import resolve_npm_tarball
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / 'out'
            package = root / 'pkg'
            destination.mkdir()
            package.mkdir()
            written = package / 'corvidlabs-ts-algochat-0.9.0.tgz'
            written.write_bytes(b'from-package-dir')
            stdout = json.dumps([{'filename': '@corvidlabs/ts-algochat-0.9.0.tgz'}])
            found = resolve_npm_tarball(stdout, destination, package)
            self.assertEqual(found, destination / written.name)
            self.assertEqual(found.read_bytes(), b'from-package-dir')

    def test_reported_filename_wins_when_that_file_exists(self):
        from qualify import resolve_npm_tarball
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'out'
            destination.mkdir()
            reported = destination / 'corvidlabs-ts-algochat-0.9.0.tgz'
            reported.write_bytes(b'reported')
            stdout = json.dumps([{'filename': reported.name}])
            found = resolve_npm_tarball(stdout, destination, destination)
            self.assertEqual(found, reported)

    def test_missing_archive_is_not_a_successful_pack(self):
        from qualify import resolve_npm_tarball
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'out'
            destination.mkdir()
            stdout = json.dumps([{'filename': '@corvidlabs/ts-algochat-0.9.0.tgz'}])
            with self.assertRaises(FileNotFoundError):
                resolve_npm_tarball(stdout, destination, destination)


if __name__ == '__main__': unittest.main()
