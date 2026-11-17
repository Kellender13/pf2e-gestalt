"""Build an installable release; URLs come from the actual destination repository."""
import argparse
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

parser = argparse.ArgumentParser()
parser.add_argument('--repository', help='GitHub owner/repository; omit for manual installation only')
parser.add_argument('--tag', help='Must match v plus the manifest version')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'module.json').read_text())
version = manifest['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    parser.error('Expected a stable semantic version')
tag = 'v' + version
if args.tag and args.tag != tag:
    parser.error('Tag and module version do not match')
if args.repository:
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repository):
        parser.error('Expected owner/repository')
    url = 'https://github.com/' + args.repository
    manifest.update(url=url, manifest=url+'/releases/latest/download/module.json',
                    download=url+'/releases/download/'+tag+'/pf2e-gestalt.zip',
                    bugs=url+'/issues', changelog=url+'/blob/main/CHANGELOG.md')
out = root / 'dist'
out.mkdir(exist_ok=True)
payload = json.dumps(manifest, indent=2) + '\n'
(out / 'module.json').write_text(payload)
files = [root / n for n in ['LICENSE', 'README.md', 'UPSTREAM.md', 'CHANGELOG.md', 'RELICS-AND-IMPORTS.md', 'VALIDATION.md']]
for directory in ['scripts', 'styles', 'lang']:
    files.extend(f for f in (root / directory).rglob('*') if f.is_file())
with ZipFile(out / 'pf2e-gestalt.zip', 'w', ZIP_DEFLATED) as archive:
    archive.writestr('pf2e-gestalt/module.json', payload)
    for file in sorted(files):
        archive.write(file, Path('pf2e-gestalt') / file.relative_to(root))
with ZipFile(out / 'pf2e-gestalt.zip') as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read('pf2e-gestalt/module.json')) == manifest
    for file in manifest['esmodules'] + manifest['styles'] + [entry['path'] for entry in manifest['languages']]:
        assert 'pf2e-gestalt/' + file in archive.namelist()
print(f'Built {tag}: {out}')
