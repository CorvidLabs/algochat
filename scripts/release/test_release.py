import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from evidence import REQUIRED, EXPECTED, digest, validate
from provenance import release_range
from qualify import extract

SHA = 'a' * 40

class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for lane in REQUIRED:
            path = self.root / lane
            path.mkdir()
            names = [pattern.replace('*', 'package') for pattern in EXPECTED[lane]]
            for name in names: (path / name).write_bytes(b'candidate bytes')
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
            lambda d:d['commands'][0].update(exit_code=1), lambda d:d.update(artifacts=[]),
            lambda d:d.update(toolchain={}), lambda d:d.update(lane='unknown'),
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
    def test_reject_traversal(self):
        import tarfile
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); archive=root/'bad.tar'
            with tarfile.open(archive,'w') as tar: tar.addfile(tarfile.TarInfo('../escape'))
            with self.assertRaises(ValueError): extract(archive,root/'consumer')

if __name__ == '__main__': unittest.main()
