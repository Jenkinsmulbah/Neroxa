#!/usr/bin/env python3
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.refs=[]
    def handle_starttag(self, tag, attrs):
        for k,v in attrs:
            if k in ("href", "src") and v: self.refs.append(v)
missing=[]
for page in (ROOT/"frontend").rglob("*.html"):
    parser=Links(); parser.feed(page.read_text(encoding="utf-8"))
    for ref in parser.refs:
        if ref.startswith(("#", "//", "http://", "https://", "mailto:", "tel:", "data:", "javascript:")): continue
        path=urlsplit(ref).path
        if not path: continue
        target=(page.parent/path).resolve()
        if not target.exists(): missing.append((page.relative_to(ROOT), ref))
if missing:
    for page,ref in missing: print(f"MISSING: {page} -> {ref}")
    raise SystemExit(1)
print("PASS: all local HTML href/src references resolve.")
