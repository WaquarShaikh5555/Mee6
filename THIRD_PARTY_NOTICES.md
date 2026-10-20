# Third-party notices

Every skill in `skills/` is copied, unmodified except where noted, from the projects below.
Exact pinned commits are recorded in [`tools/skills.lock`](tools/skills.lock); the file-by-file
mapping from upstream path to installed directory is in
[`tools/skills.manifest.tsv`](tools/skills.manifest.tsv).

Nothing in this repository relicenses upstream work. If you redistribute this repository
(or a product built from it), keep this file and the upstream licence files with it.

| Source | Commit | Licence | Skills installed |
| --- | --- | --- | --- |
| [anthropics/skills](https://github.com/anthropics/skills) | `dbd4588f9e10` | Apache-2.0 (`skills/frontend-design/LICENSE.txt`, shipped inside the skill) | 1 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `063bee94c3f4` | MIT, declared in each `SKILL.md` frontmatter (`license: MIT`) | 2 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | `aeac41d4d005` | MIT | 16 |
| [expo/skills](https://github.com/expo/skills) | `55ec65cd1649` | MIT (650 Industries, Inc.) | 18 |
| [flutter/agent-plugins](https://github.com/flutter/agent-plugins) | `6e590650bb4b` | BSD-3-Clause (The Flutter Authors) | 10 |
| [dart-lang/skills](https://github.com/dart-lang/skills) | `bf984f3ef223` | BSD-3-Clause (Dart project authors) | 12 |
| [chrisbanes/skills](https://github.com/chrisbanes/skills) | `0bd44a0213d2` | Apache-2.0 | 10 |
| [new-silvermoon/awesome-android-agent-skills](https://github.com/new-silvermoon/awesome-android-agent-skills) | `82900eacc8db` | Apache-2.0 | 11 |
| [full-stack-skills/kotlin-skills](https://github.com/full-stack-skills/kotlin-skills) | `e4ea953143b6` | Apache-2.0 | 3 |
| [full-stack-skills/swift-skills](https://github.com/full-stack-skills/swift-skills) | `eee7666bf45d` | Apache-2.0 | 4 |
| [twostraws/SwiftUI-Agent-Skill](https://github.com/twostraws/SwiftUI-Agent-Skill) | `ce32af1693b9` | MIT (Paul Hudson) | 1 |
| [rshankras/claude-code-apple-skills](https://github.com/rshankras/claude-code-apple-skills) | `9ffb83138209` | MIT (Ravishankar) | 18 |
| [mkosir/typescript-style-guide](https://github.com/mkosir/typescript-style-guide) | `170074a0df9b` | MIT | 9 |

Total: 115 skills.

## Local modifications

Only one class of change is applied, and only where the manifest records an `upstream-name`:

- **Directory and frontmatter name.** Skills taken from `rshankras/claude-code-apple-skills` are
  installed under names prefixed with `ios-` (for example `typography` → `ios-typography`,
  `navigation-patterns` → `ios-navigation-patterns`) and `performance-profiling` →
  `ios-performance-profiling`. The `name:` field in each `SKILL.md` frontmatter is rewritten to
  match its directory, as required by the Agent Skills format. Body text, references, and
  templates are untouched.
- **`navigation3` → `compose-navigation3`.** Same reason: the upstream directory is
  `compose-navigation` while the declared skill name is `navigation3`.

No other file content is changed. No upstream install script, hook, or evaluation harness is
copied or executed.

## Licence notes worth knowing

- `anthropics/skills` has no repository-level licence; the `frontend-design` skill carries its own
  Apache-2.0 `LICENSE.txt`, which is installed alongside it.
- `vercel-labs/agent-skills` has no repository-level licence file; both installed skills declare
  `license: MIT` in their frontmatter. Ask upstream for written clarification if you need a
  repo-level grant.
- `flutter/agent-plugins` and `dart-lang/skills` are BSD-3-Clause. Their copyright notices must be
  retained in source redistributions.

## Not installed, and why

| Source | Reason |
| --- | --- |
| `flutter/agent-plugins` `dart-*` skills | Identical to the upstream `dart-lang/skills` versions; the `dart-lang` copies are installed instead to avoid duplicates. |
| `partme-ai/full-stack-skills` `mobile-native-skills` (`android-kotlin`, `ios-swift`) | Catalog repository only; the actual skills live in per-package repos. Its two mobile entries are ~2 KB generic stubs in Chinese and add nothing over the Compose/SwiftUI sets installed here. |
| `partme-ai/full-stack-skills` `codeguard-*`, `testing-skills`, `devops-skills` | Thin generic wrappers (mostly `./gradlew detekt`) that duplicate stronger skills already installed. |
| `anthropics/skills` `canvas-design`, `docx`, `pptx`, `xlsx`, `pdf`, `slack-gif-creator`, `brand-guidelines`, `theme-factory`, `webapp-testing`, `mcp-builder`, `claude-api` | Document, slide, chat, web-testing, and Anthropic-brand specific; unrelated to mobile app engineering. `theme-factory` styles slide decks and HTML artifacts, not app design systems. |
| `vercel-labs/agent-skills` `react-best-practices`, `web-design-guidelines`, `react-view-transitions`, `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-optimize` | React/Next.js web concerns (SSR, RSC, Web Vitals, Vercel hosting). The React Native equivalents are in `vercel-react-native-skills`. |
| `expo/skills` `expo-dom`, `expo-examples`, `expo-skill-eval`, `expo-skill-feedback`, `expo-migrate-module`, `eas-hosting`, `eas-update-insights` | Web DOM rendering, sample index, meta/eval tooling, or web hosting and analytics for EAS Update — outside mobile app construction. |
| `dart-lang/skills` `dart-build-cli-app`, `dart-use-doc-examples` | CLI package authoring and doc examples, not mobile app work. |
| `Kotlin/kotlin-agent-skills` | Official JetBrains set, but every skill is KMP migration/toolchain specific (AGP 9 KMP migration, CocoaPods→SwiftPM). No Kotlin Multiplatform app was requested. |
| `new-silvermoon/awesome-android-agent-skills` `android-coroutines`, `kotlin-concurrency-expert`, `compose-performance-audit`, `compose-ui`, `xml-to-compose-migration`, `rxjava-to-coroutines-migration` | Duplicates of `kotlin-concurrency-and-flow`, `compose-performance`, `compose-state-and-effects`/`compose-component-design`. |
| `chrisbanes/skills` `shepherd`, `to-plan`, `deliver-spec`, `implement-with-subagents`, `grounded-writing`, `release-kotlin-library`, `run-github-project`, `using-chrisbanes-skills` | Workflow/orchestration skills for that author's own repository, not mobile engineering knowledge. |
| `twostraws/SwiftUI-Agent-Skill` duplicate `swiftui-pro/SKILL.md` | Same skill at two paths; only the full `swiftui-pro/skills/swiftui-pro` copy is installed. |
| All remaining skills in every source repository | Unrelated to mobile development (marketing, ASO copywriting, game design, legal docs, macOS/visionOS/watchOS, spatial computing, etc.). |
