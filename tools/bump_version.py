"""Dev-only: replace the ?v= cache-busting string in src/index.src.html (UTF-8 safe, unlike PowerShell 5.1 Set-Content).

Usage: python tools/bump_version.py <old> <new>
"""
import sys
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "src/index.src.html"
old, new = sys.argv[1], sys.argv[2]
t = p.read_bytes().decode("utf-8")
n = t.count(old)
if not n:
    raise SystemExit(f"{old!r} not found")
p.write_bytes(t.replace(old, new).encode("utf-8"))
print(f"replaced {n}x {old} -> {new}")
