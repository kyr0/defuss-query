"""Every caret range (`^x.y.z`) the docs state must equal package.json peerDependencies["defuss-morph"].

WHY: the README and ARCH.md once kept `^0.1.1` after the peer moved to `^0.2.0`; installers copy the range from the
README, so a stale one installs a morph build the facade no longer targets. Exits 1 and prints each stale line.
"""

import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[2]
want = json.loads((root / "package.json").read_text("utf-8"))["peerDependencies"]["defuss-morph"]
pages = [root / name for name in ("README.md", "ARCH.md", "SKILL.md", "AGENTS.md")]
pages += sorted((root / "docs").rglob("*.html")) if (root / "docs").is_dir() else []
stale = []
for page in pages:
    if not page.is_file():
        continue
    for number, line in enumerate(page.read_text("utf-8").splitlines(), 1):
        for found in re.findall(r"\^\d+\.\d+\.\d+", line):
            if found != want:
                stale.append(f"{page.relative_to(root)}:{number}: states {found}, peerDependencies says {want}")
if stale:
    print("\n".join(stale))
    print(f"fix: write the defuss-morph range as {want} (package.json peerDependencies)")
    sys.exit(1)
print(f"peer range {want} consistent across {len(pages)} pages")
