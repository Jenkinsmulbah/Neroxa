#!/usr/bin/env python3
"""Static Phase 5 checks; not a live security or database test."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
errors=[]
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.refs=[]; self.ids=set(); self.duplicates=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a:
            if a['id'] in self.ids:self.duplicates.append(a['id'])
            self.ids.add(a['id'])
        for k in ('href','src'):
            v=a.get(k,'')
            if v and not v.startswith(('#','http://','https://','mailto:','tel:','data:','javascript:')):self.refs.append(v.split('#')[0].split('?')[0])
for html in (ROOT/'frontend').rglob('*.html'):
    p=Parser();p.feed(html.read_text(encoding='utf-8'))
    if p.duplicates:errors.append(f'{html.relative_to(ROOT)} duplicate IDs: {p.duplicates}')
    for ref in p.refs:
        if ref and not (html.parent/ref).resolve().exists():errors.append(f'{html.relative_to(ROOT)} missing {ref}')
js=list((ROOT/'frontend/assets/js').rglob('*.js'))
for f in js:
    r=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    if r.returncode:errors.append(f'{f.relative_to(ROOT)} JS syntax: {r.stderr.strip()}')
required=['backend/src/modules/applications/applicant.routes.ts','backend/src/modules/applications/admin.routes.ts','database/migrations/003_server_side_applications.sql','frontend/assets/js/core/applications-client.js','frontend/assets/js/core/admin-applications.js']
for item in required:
    if not (ROOT/item).is_file():errors.append(f'missing {item}')
app=(ROOT/'backend/src/app.ts').read_text()
if "app.use('/api/applications', applicantApplicationsRouter)" not in app:errors.append('applicant router not mounted')
old=(ROOT/'frontend/assets/js/app.js').read_text()
if 'nexora.applications.v1' in old:errors.append('legacy localStorage application workflow still active')
if errors:
    print('FAILED\n'+'\n'.join('- '+e for e in errors));sys.exit(1)
print(f'PASS: {len(list((ROOT/"frontend").rglob("*.html")))} HTML pages; local references and IDs')
print(f'PASS: syntax for {len(js)} frontend JavaScript files')
print('PASS: PostgreSQL application routes, admin routes and Phase 5 migration present')
print('PASS: localStorage application intake removed from active app.js')
print('NOTE: TypeScript compilation and live PostgreSQL/API tests require dependencies and a configured database.')
