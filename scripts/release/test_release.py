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
        path.write_text('<project xmlns="http://maven.apache.org/POM/4.0.0"><groupId>com.corvidlabs</groupId><artifactId>' + (name or 'kt-algochat') + '</artifactId><version>0.2.0</version></project>'); return
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
        files={'go/go.mod':('module '+(name or 'github.com/CorvidLabs/go-algochat')+'\n').encode(), 'go/chat.go':b'package algochat'}
    else:
        files={'Package.swift':('.library(name: "'+(name or 'AlgoChat')+'", targets: ["AlgoChat"])').encode(), 'swift/Sources/AlgoChat/Chat.swift':b'// source'}
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


class WorkflowTests(unittest.TestCase):
    def test_no_publication_workflows(self):
        root=Path(__file__).resolve().parents[2]
        for name in ['ts','py','rs','kt','go','swift','release-qualification']:
            text=(root/'.github/workflows'/f'{name}.yml').read_text()
            check_workflow(text)
            for extra in ['\n  packages: write', '\n  id-token: write', '\n  run: npm publish', '\n  env: ${{ secrets.TOKEN }}']:
                with self.assertRaises(ValueError): check_workflow(text+extra)
        script=(root/'scripts/release/qualify.py').read_text()
        # Bounded command regression guard, not a general malicious-code sandbox.
        self.assertNotRegex(script, r"['\"](?:npm|cargo)['\"]\s*,\s*['\"]publish['\"]")
        self.assertNotRegex(script, r"['\"](?:publish|publishAllPublicationsToGitHubPackagesRepository|publishMavenPublicationToGitHubPackagesRepository)['\"]")
        self.assertIn("'publishToMavenLocal'",script)


if __name__ == '__main__': unittest.main()
