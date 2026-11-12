#!/usr/bin/env python3
"""Static checks for the NEXORA Phase 4 migration. Not a security audit."""
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
errors = []

class RefParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs = []; self.ids = set(); self.duplicates = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            if a['id'] in self.ids: self.duplicates.append(a['id'])
            self.ids.add(a['id'])
        for key in ('href', 'src'):
            value = a.get(key, '')
            if value and not value.startswith(('#', 'http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:')):
                self.refs.append(value.split('#', 1)[0].split('?', 1)[0])

for html in (ROOT / 'frontend').rglob('*.html'):
    parser = RefParser(); parser.feed(html.read_text(encoding='utf-8'))
    if parser.duplicates: errors.append(f'{html.relative_to(ROOT)} duplicate IDs: {parser.duplicates}')
    for ref in parser.refs:
        if not ref: continue
        target = (html.parent / ref).resolve()
        if not target.exists(): errors.append(f'{html.relative_to(ROOT)} missing reference: {ref}')

for js in [ROOT/'frontend/assets/js/app.js', ROOT/'frontend/assets/js/editor.js', ROOT/'frontend/assets/js/core/auth-client.js']:
    result = subprocess.run(['node', '--check', str(js)], capture_output=True, text=True)
    if result.returncode: errors.append(f'{js.relative_to(ROOT)} syntax error: {result.stderr.strip()}')

required = [
 'backend/src/app.ts', 'backend/src/modules/auth/auth.routes.ts',
 'backend/src/modules/auth/auth.service.ts', 'backend/src/middleware/authenticate.ts',
 'backend/src/middleware/csrf.ts', 'database/migrations/002_authentication_and_access_control.sql',
 'frontend/assets/js/core/auth-client.js'
]
for item in required:
    if not (ROOT/item).is_file(): errors.append(f'Missing required Phase 4 file: {item}')

schema = (ROOT/'database/migrations/002_authentication_and_access_control.sql').read_text()
for token in ['CREATE TABLE users', 'CREATE TABLE user_sessions', 'CREATE TABLE audit_logs', "'client', 'designer', 'admin'", 'identity_verification_status']:
    if token not in schema: errors.append(f'Migration missing expected control: {token}')

if errors:
    print('FAILED')
    print('\n'.join(f'- {item}' for item in errors))
    sys.exit(1)
print('PASS: local HTML references and duplicate IDs')
print('PASS: frontend JavaScript syntax')
print('PASS: required Phase 4 backend/schema files')
print('PASS: role, session, audit and identity-verification schema markers')
print('NOTE: PostgreSQL execution, TypeScript build and live HTTP security tests require configured dependencies/database.')
