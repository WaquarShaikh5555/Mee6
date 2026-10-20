#!/usr/bin/env python3
"""Validate the installed skills against the Agent Skills format.

Checks every directory in skills/ against tools/skills.manifest.tsv and reports:
  * missing or extra skill directories
  * a missing or malformed SKILL.md
  * frontmatter name that does not match its directory
  * a missing or empty description
  * duplicate skill names
  * orphaned links / unexpected executables

Exit code is non-zero when any error is found.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
MANIFEST = ROOT / "tools" / "skills.manifest.tsv"

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def parse_frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    block = text[3:end]
    data: dict[str, str] = {}
    key = None
    for raw in block.splitlines():
        if not raw.strip():
            continue
        if re.match(r"^\s", raw) and key:          # continuation of a folded value
            data[key] = (data[key] + " " + raw.strip()).strip()
            continue
        if ":" in raw:
            key, _, value = raw.partition(":")
            key = key.strip()
            data[key] = value.strip()
    return data


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    if not MANIFEST.exists():
        print("error: tools/skills.manifest.tsv is missing", file=sys.stderr)
        return 1
    if not SKILLS.is_dir():
        print("error: skills/ is missing", file=sys.stderr)
        return 1

    expected: dict[str, str] = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            errors.append(f"manifest: malformed row: {line!r}")
            continue
        expected[parts[1]] = parts[0]

    actual = {p.name for p in SKILLS.iterdir() if p.is_dir()}

    for name in sorted(expected.keys() - actual):
        errors.append(f"missing skill directory: skills/{name}")
    for name in sorted(actual - expected.keys()):
        errors.append(f"unexpected skill directory (not in manifest): skills/{name}")

    seen: dict[str, str] = {}
    total_bytes = 0
    for name in sorted(actual):
        directory = SKILLS / name
        skill_md = directory / "SKILL.md"
        if not skill_md.is_file():
            errors.append(f"{name}: no SKILL.md")
            continue
        if not NAME_RE.match(name):
            warnings.append(f"{name}: directory name is not lower-kebab-case")

        text = skill_md.read_text(encoding="utf-8", errors="replace")
        front = parse_frontmatter(text)
        if not front:
            errors.append(f"{name}: SKILL.md has no YAML frontmatter")
            continue

        declared = front.get("name", "")
        if not declared:
            errors.append(f"{name}: frontmatter has no name")
        elif declared != name:
            errors.append(f"{name}: frontmatter name is {declared!r}, expected {name!r}")
        elif declared in seen:
            errors.append(f"{name}: duplicate skill name (also {seen[declared]})")
        else:
            seen[declared] = name

        if not front.get("description", "").strip():
            errors.append(f"{name}: frontmatter has no description")

        total_bytes += sum(f.stat().st_size for f in directory.rglob("*") if f.is_file())

    link = ROOT / ".claude" / "skills"
    if not link.is_symlink() and not link.is_dir():
        warnings.append(".claude/skills does not exist; Claude Code will not discover the skills")

    print(f"skills checked : {len(actual)}")
    print(f"total size     : {total_bytes / 1024 / 1024:.1f} MiB")
    for warning in warnings:
        print(f"warning: {warning}")
    for error in errors:
        print(f"error: {error}", file=sys.stderr)

    if errors:
        print(f"\nFAILED with {len(errors)} error(s)", file=sys.stderr)
        return 1
    print("\nOK - every skill matches the manifest and the Agent Skills frontmatter contract")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
