# Agent guide — mobile application engineering

This repository is a **skill library**, not an application. It equips a coding agent to build
production-grade Android and iOS apps with React Native/Expo, Flutter, native Kotlin/Compose,
or native Swift/SwiftUI.

- **Catalog:** [SKILLS.md](SKILLS.md) — all 115 skills with purpose and upstream source.
- **Files:** `skills/<name>/SKILL.md` (plus `references/`, `templates/`, `scripts/` where the
  upstream project ships them). `.claude/skills` is a symlink to `skills/`.
- **Provenance:** [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `tools/skills.lock`.
- **Toolchain reality:** [docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md](docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md).

## How to use a skill

1. **Route before you read.** Use the table below to find the one or two skills that own the
   task. Do not preload the library.
2. **Read `SKILL.md` first.** Open `references/` files only when the skill tells you to, or when
   the task needs that specific depth.
3. **Project conventions win.** Every skill is written to defer to the repository's existing
   architecture, styling system, and tooling. Detect them before writing code.
4. **A skill is not a build environment.** No skill installs a SDK, simulator, signing identity,
   or CI runner.

Agents that discover skills elsewhere can point at the same directory without copying it:

```bash
ln -s ../skills .agents/skills    # cross-agent convention (agentskills.io)
ln -s ../skills .codex/skills     # Codex
ln -s ../skills .cursor/skills    # Cursor
```

## Routing table

### Choosing a stack

| Situation | Load, in order |
| --- | --- |
| New cross-platform app, fastest path to both stores | `expo-overview` → `expo-project-structure` → `expo-router` → `expo-design-system` |
| Existing React Native app without Expo | `vercel-react-native-skills` → `typescript-style-guide` → `vercel-composition-patterns` |
| Add React Native screens to an existing native app | `expo-brownfield` → `expo-overview` |
| Flutter app | `flutter-apply-architecture-best-practices` → task-specific `flutter-*` / `dart-*` |
| Native Android | `android-architecture` → `compose-state-and-effects` → `compose-component-design` |
| Native iOS | `swiftui-pro` → `ios-navigation-patterns` → `ios-coding-best-practices` |

### Building features

| Task | Skills |
| --- | --- |
| Design system, theming, tokens, typography | `expo-design-system`, `expo-native-ui`, `ios-typography`, `frontend-design` |
| Screen layout, responsive and adaptive layout | `flutter-build-responsive-layout`, `expo-native-ui`, `vercel-react-native-skills`, `frontend-ui-engineering` |
| Platform conventions and native controls | `expo-native-ui`, `expo-ui`, `swiftui-pro`, `ios-sf-symbols`, `ios-coding-best-practices` |
| Accessibility | `android-accessibility`, `ios-typography` (Dynamic Type), `swiftui-pro`, `ios-coding-best-practices` |
| Navigation and routing | `expo-router`, `compose-navigation3`, `ios-navigation-patterns`, `flutter-setup-declarative-routing` |
| State ownership and effects | `compose-state-and-effects`, `android-viewmodel`, `vercel-composition-patterns`, `typescript-react`, `flutter-apply-architecture-best-practices` |
| Reusable components and API design | `compose-component-design`, `vercel-composition-patterns`, `kotlin-api-design`, `typescript-react` |
| Animation, gestures, transitions | `expo-animation`, `compose-animations`, `ios-animation-patterns` |
| API calls and data fetching | `expo-data-fetching`, `android-retrofit`, `flutter-use-http-package`, `ios-http-cache` |
| Local database and persistence | `android-data-layer`, `ios-persistence-setup`, `expo-native-ui` (storage reference) |
| Authentication and secure storage | `ios-auth-flow`, `security-and-hardening`, `expo-native-ui` (SecureStore reference) |
| Offline support, caching, sync, retries | `ios-offline-queue`, `ios-http-cache`, `expo-data-fetching`, `flutter-apply-architecture-best-practices` |
| Permissions, camera, notifications, background work | `ios-permission-priming`, `ios-push-notifications`, `ios-background-processing`, `expo-module`, `expo-dev-client` |
| Error handling and recovery | `debugging-and-error-recovery`, `observability-and-instrumentation` |
| Images and media | `coil-compose`, `vercel-react-native-skills` (`ui-expo-image`), `expo-native-ui` (media reference) |

### Verifying and shipping

| Task | Skills |
| --- | --- |
| Test strategy | `test-driven-development` → platform skill |
| Kotlin / Compose tests | `kotlin-testing`, `compose-ui-testing-patterns`, `android-testing`, `android-emulator-skill` |
| Swift / SwiftUI tests | `swift-testing`, `ios-snapshot-test-setup` |
| Dart / Flutter tests | `dart-add-unit-test`, `dart-generate-test-mocks`, `flutter-add-widget-test`, `flutter-add-integration-test` |
| TypeScript tests | `typescript-tests` |
| Performance work | `performance-optimization` → `compose-performance` / `ios-performance-profiling` / `gradle-build-performance` / `vercel-react-native-skills` |
| Benchmarking on device | `android-benchmark-comparison` |
| Code review | `code-review-and-quality`, `swiftui-pro`, `ios-coding-best-practices`, `kotlin-api-design`, `code-simplification` |
| Security review | `security-and-hardening`, `ios-privacy-manifests` |
| Building Android (Gradle, variants, AGP) | `gradle-run`, `kotlin-gradle-build`, `android-gradle-logic` |
| Swift package and dependency layout | `swift-package-manager` |
| EAS builds, updates, store submission | `eas-app-stores`, `eas-workflows`, `eas-update`, `eas-simulator`, `eas-observe` |
| iOS beta testing and App Review | `ios-beta-testing`, `ios-app-store-rejection-handler`, `ios-run-simulator` |
| CI/CD, git, release process | `ci-cd-and-automation`, `git-workflow-and-versioning`, `shipping-and-launch` |
| Planning and scoping work | `planning-and-task-breakdown`, `incremental-implementation`, `api-and-interface-design`, `documentation-and-adrs` |

## Standing rules

- **Measure, then optimize.** Never change performance-sensitive code without a profile, a
  benchmark, or a recomposition trace (`performance-optimization`, `compose-performance`).
- **Read the project before you write.** Existing architecture, theme, lint config, and CI
  override any default in a skill.
- **Verify on a real target.** A Compose/SwiftUI/Flutter change is not done until it compiles and
  the relevant test or simulator run passes — see the toolchain document for what this sandbox
  can and cannot execute.
- **Secrets never enter the repo.** Keystores, `.p8`/`.p12` files, service-account JSON, and API
  keys belong in CI secret stores (`security-and-hardening`, `ci-cd-and-automation`).
- **Keep skills current.** A skill that contradicts the SDK version in use is a bug: check the
  project's toolchain first, then update the skill with `tools/install-skills.sh`.
