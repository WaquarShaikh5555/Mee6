#!/usr/bin/env python3
"""Regenerate SKILLS.md from the manifest and each skill's frontmatter."""

from __future__ import annotations

import re
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
MANIFEST = ROOT / "tools" / "skills.manifest.tsv"
LOCK = ROOT / "tools" / "skills.lock"
OUT = ROOT / "SKILLS.md"

SOURCE_LABEL = {
    "anthropics": "anthropics/skills",
    "vercel": "vercel-labs/agent-skills",
    "addy": "addyosmani/agent-skills",
    "expo": "expo/skills",
    "flutter": "flutter/agent-plugins",
    "dart": "dart-lang/skills",
    "chrisbanes": "chrisbanes/skills",
    "android-awesome": "new-silvermoon/awesome-android-agent-skills",
    "partme-kotlin": "full-stack-skills/kotlin-skills",
    "partme-swift": "full-stack-skills/swift-skills",
    "twostraws": "twostraws/SwiftUI-Agent-Skill",
    "apple": "rshankras/claude-code-apple-skills",
    "ts": "mkosir/typescript-style-guide",
}


def frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    block = text[3:end] if end != -1 else ""
    data: dict[str, str] = {}
    key = None
    for raw in block.splitlines():
        if not raw.strip():
            continue
        if re.match(r"^\s", raw) and key:
            data[key] = (data[key] + " " + raw.strip()).strip()
            continue
        if ":" in raw:
            key, _, value = raw.partition(":")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            data[key] = value
    return data


def shorten(text: str, limit: int = 190) -> str:
    """Keep the upstream summary sentence and as much of the `Use when` triggers as fit."""
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    summary = parts[0]
    rest = parts[1] if len(parts) > 1 else ""

    def clip(value: str, budget: int) -> str:
        value = value.strip()
        if len(value) <= budget:
            return value
        return value[:budget].rsplit(" ", 1)[0].rstrip(",;:") + "..."

    if not rest or len(summary) >= limit:
        return clip(summary, limit)
    extra = clip(rest, limit - len(summary) - 1)
    return f"{summary} {extra}".strip()


def main() -> None:
    rows = []
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        category, name, repo, _path, _upstream = (line.split("\t") + [""] * 5)[:5]
        rows.append((category, name, repo))

    cats: "OrderedDict[str, list[tuple[str, str, str]]]" = OrderedDict()
    for category, name, repo in rows:
        skill_md = SKILLS / name / "SKILL.md"
        meta = frontmatter(skill_md.read_text(encoding="utf-8", errors="replace"))
        desc = shorten(meta.get("description", ""))
        cats.setdefault(category, []).append((name, desc, SOURCE_LABEL.get(repo, repo)))

    counts: dict[str, int] = {}
    if LOCK.exists():
        for line in LOCK.read_text(encoding="utf-8").splitlines():
            if line.startswith("#") or not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) >= 4:
                counts[parts[1]] = counts.get(parts[1], 1)

    out: list[str] = []
    out.append("# Installed skills\n")
    out.append(
        f"{len(rows)} Agent Skills across {len(cats)} categories, installed under "
        "[`skills/`](skills) and linked to `.claude/skills` for automatic discovery.\n"
    )
    out.append(
        "Each skill is a directory with a `SKILL.md` (YAML frontmatter + instructions) and, "
        "where the upstream project ships them, `references/`, `templates/`, or `scripts/` "
        "loaded only when the skill is in use.\n"
    )
    out.append("> Skills are knowledge, not toolchains. Installing one does not install a SDK, "
               "simulator, signing identity, or CI runner. See "
               "[docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md](docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md).\n")
    out.append("## Category index\n")
    for category in cats:
        anchor = re.sub(r"[^a-z0-9 -]", "", category.lower()).replace(" ", "-")
        out.append(f"- [{category}](#{anchor}) ({len(cats[category])})")
    out.append("")

    for category, entries in cats.items():
        out.append(f"## {category}\n")
        out.append("| Skill | What it is for | Upstream |")
        out.append("| --- | --- | --- |")
        for name, desc, repo in entries:
            out.append(f"| [`{name}`](skills/{name}/SKILL.md) | {desc} | {repo} |")
        out.append("")


    out.append("## Coverage map\n")
    out.append(
        "How the requested engineering areas map onto installed skills. Platform-specific "
        "testing, performance, and release skills deliberately live in their platform "
        "category, not in a separate bucket.\n"
    )
    out.append("| Area | Skills |")
    out.append("| --- | --- |")
    coverage = [
        ("Mobile UI/UX, design systems, typography, responsive layout, platform conventions",
         ["frontend-design", "expo-design-system", "expo-native-ui", "expo-ui", "ios-typography",
          "ios-sf-symbols", "flutter-build-responsive-layout", "flutter-fix-layout-issues",
          "frontend-ui-engineering", "android-accessibility"]),
        ("React Native and Expo",
         ["expo-overview", "expo-project-structure", "expo-router", "expo-module",
          "expo-dev-client", "expo-upgrade", "expo-brownfield", "expo-app-clip",
          "vercel-react-native-skills", "vercel-composition-patterns"]),
        ("Flutter and Dart",
         ["flutter-apply-architecture-best-practices", "flutter-setup-declarative-routing",
          "flutter-setup-localization", "flutter-implement-json-serialization",
          "flutter-use-http-package", "dart-run-static-analysis", "dart-use-pattern-matching",
          "dart-use-primary-constructors", "dart-setup-ffi-assets", "dart-use-ffigen"]),
        ("TypeScript",
         ["typescript-style-guide", "typescript-types", "typescript-discriminated-unions",
          "typescript-functions", "typescript-naming", "typescript-variables",
          "typescript-react", "typescript-source-organization", "typescript-tests"]),
        ("Native Android: Kotlin and Jetpack Compose",
         ["android-architecture", "kotlin-stable", "kotlin-api-design", "compose-component-design",
          "compose-state-and-effects", "compose-navigation3", "compose-animations",
          "compose-focus-navigation", "coil-compose", "kotlin-gradle-build"]),
        ("Native iOS: Swift and SwiftUI",
         ["swiftui-pro", "swift-stable", "swift-concurrency", "ios-coding-best-practices",
          "ios-navigation-patterns", "ios-typography", "ios-animation-patterns",
          "swift-package-manager"]),
        ("Navigation, state management, reusable components, scalable architecture",
         ["expo-router", "compose-navigation3", "ios-navigation-patterns",
          "flutter-setup-declarative-routing", "compose-state-and-effects", "android-viewmodel",
          "kotlin-concurrency-and-flow", "vercel-composition-patterns", "android-architecture",
          "flutter-apply-architecture-best-practices", "api-and-interface-design"]),
        ("Animations, gestures, transitions",
         ["expo-animation", "compose-animations", "ios-animation-patterns"]),
        ("API integration, backend, databases, auth, secure storage",
         ["expo-data-fetching", "android-retrofit", "android-data-layer", "flutter-use-http-package",
          "ios-http-cache", "ios-auth-flow", "ios-persistence-setup", "api-and-interface-design",
          "security-and-hardening"]),
        ("Native capabilities: permissions, camera, notifications, files, background tasks",
         ["ios-permission-priming", "ios-push-notifications", "ios-background-processing",
          "ios-persistence-setup", "expo-module", "expo-dev-client", "expo-native-ui"]),
        ("Offline support, caching, synchronization, error handling, network resilience",
         ["ios-offline-queue", "ios-http-cache", "expo-data-fetching",
          "flutter-apply-architecture-best-practices", "debugging-and-error-recovery",
          "observability-and-instrumentation"]),
        ("Performance, memory management, battery efficiency",
         ["performance-optimization", "compose-performance", "android-benchmark-comparison",
          "gradle-build-performance", "vercel-react-native-skills", "ios-performance-profiling",
          "coil-compose"]),
        ("Unit, integration, UI testing, debugging, regression testing",
         ["test-driven-development", "kotlin-testing", "compose-ui-testing-patterns",
          "android-testing", "android-emulator-skill", "swift-testing", "ios-snapshot-test-setup",
          "flutter-add-widget-test", "flutter-add-integration-test", "dart-add-unit-test",
          "dart-generate-test-mocks", "dart-collect-coverage", "dart-migrate-to-checks-package",
          "typescript-tests", "debugging-and-error-recovery"]),
        ("Security reviews, dependency management, sensitive information",
         ["security-and-hardening", "ios-privacy-manifests", "ios-auth-flow",
          "swift-package-manager", "dart-resolve-package-conflicts", "dart-run-static-analysis",
          "code-review-and-quality"]),
        ("Android builds, APK/AAB, iOS build workflows, signing, release, app stores",
         ["gradle-run", "kotlin-gradle-build", "android-gradle-logic", "eas-app-stores",
          "eas-simulator", "ios-run-simulator", "ios-beta-testing",
          "ios-app-store-rejection-handler", "shipping-and-launch"]),
        ("Git, GitHub, CI/CD, automated builds, production deployment",
         ["git-workflow-and-versioning", "ci-cd-and-automation", "eas-workflows", "eas-update",
          "eas-observe", "shipping-and-launch", "planning-and-task-breakdown",
          "incremental-implementation"]),
    ]
    for area, names in coverage:
        cells = ", ".join(f"[`{n}`](skills/{n}/SKILL.md)" for n in names)
        out.append(f"| {area} | {cells} |")
    out.append("")
    out.append("## Provenance\n")
    out.append(
        "Every directory is copied verbatim from a pinned upstream commit recorded in "
        "[`tools/skills.lock`](tools/skills.lock). "
        "Licences and attribution are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). "
        "Re-install or update with `tools/install-skills.sh`, then re-run "
        "`tools/validate-skills.py`.\n"
    )
    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} skills, {len(cats)} categories)")
    if counts:
        print("lockfile sources:", len(counts))


if __name__ == "__main__":
    main()
