"""Copy seed/company.json into the app source (between the COMPANY_DATA markers) so the page carries the company's
master data in every run mode. Run after editing seed/company.json:  python3 tools/sync-company.py
With --check it only verifies they match (used by the tests)."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((root / 'seed' / 'company.json').read_text(encoding='utf-8'))
payload = {k: data[k] for k in ('version', 'users', 'items', 'suppliers')}
block = '/*COMPANY_DATA_START*/const COMPANY=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';/*COMPANY_DATA_END*/'
src = root / 'src' / 'npi-projects.html'
text = src.read_text(encoding='utf-8')
pat = re.compile(r'/\*COMPANY_DATA_START\*/.*?/\*COMPANY_DATA_END\*/', re.S)
if not pat.search(text):
    sys.exit('COMPANY_DATA markers not found in src/npi-projects.html')
new = pat.sub(lambda m: block, text, count=1)
if '--check' in sys.argv:
    sys.exit(0 if new == text else 'src/npi-projects.html is out of date: run python3 tools/sync-company.py')
if new != text:
    src.write_text(new, encoding='utf-8')
    print('company data written into src/npi-projects.html (run the build next)')
else:
    print('already in sync')
