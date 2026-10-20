# Toolchain requirements: what the skills do not provide

The 115 skills in `skills/` are **knowledge**. None of them ships a compiler, SDK, simulator,
signing identity, or cloud build runner, and installing them changed nothing outside this
repository. Building and testing a real Android or iOS app additionally requires the components
below.

This document also records what this particular sandbox can and cannot do, measured, so nobody
plans work around a capability that is not there.

---

## 1. What this environment actually has

Probed on 2026-10-20:

| Item | Status |
| --- | --- |
| OS | Debian GNU/Linux 12 (bookworm), x86_64 |
| CPU / RAM / disk | shared vCPU, 3.8 GiB RAM, 20 GiB free |
| Node.js / npm | 22.22.3 / 10.9.8 — available |
| Yarn | 1.22 — available |
| Python | 3.11 — available |
| `git`, `gh` | available, authenticated |
| JDK (`java`, `javac`) | **missing** |
| Gradle | **missing** (no wrapper project exists yet) |
| Android SDK / `adb` / `sdkmanager` / emulator | **missing** |
| Flutter SDK / Dart SDK | **missing** |
| Swift / `xcodebuild` / Xcode / iOS Simulator | **missing, and impossible on Linux** |
| Outbound network | allowlisted only: `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `github.com`, `codeload.github.com`, `api.github.com` |
| `dl.google.com`, `storage.googleapis.com`, `services.gradle.org`, `maven.google.com`, `repo.maven.apache.org`, `deb.debian.org`, `developer.apple.com` | **blocked** |

Consequences, stated plainly:

- **Android native builds cannot run here.** The SDK is distributed through `dl.google.com`,
  Google Maven is blocked, and there is no JDK to run the Gradle wrapper even if it were
  cached.
- **Flutter cannot run here.** The SDK download host (`storage.googleapis.com`) is blocked and
  no Dart VM is present.
- **iOS cannot be built here at all.** Xcode, the iOS SDK, and the Simulator are macOS-only and
  are licence-restricted to Apple hardware. This is an architectural limit, not a missing
  package.
- **React Native / Expo JavaScript work can run here.** `npm`/`npx` reach the npm registry, so
  TypeScript, Jest, ESLint, `expo` CLI config validation, and component-level logic can be
  developed. Any *native* build still needs the Android SDK or Xcode, or a cloud build.

Use [EAS Build](#5-cloud-build-and-ci-when-the-local-toolchain-is-missing) or a macOS/Android CI
runner for real binaries.

---

## 2. Common baseline

| Requirement | Version to target | Needed by |
| --- | --- | --- |
| Git | 2.40+ | everything |
| Node.js | 20 LTS or 22 LTS | Expo, React Native, TypeScript skills |
| npm / pnpm / yarn | npm 10+ | Expo, React Native |
| JDK | 17 (AGP 8.x) or 21 (AGP 9.x); must match the Gradle and AGP versions in the project | Android, Flutter, React Native |
| Watchman | current | React Native Metro file watching (recommended) |
| Ruby + CocoaPods | Ruby 3.x, CocoaPods 1.15+ | iOS native modules in React Native/Flutter on macOS |

Referenced by skills: `expo-overview`, `expo-project-structure`, `vercel-react-native-skills`,
`kotlin-gradle-build`, `gradle-run`.

---

## 3. Android

### 3.1 Build toolchain

| Component | Notes |
| --- | --- |
| Android Studio (latest stable) **or** command-line tools | `cmdline-tools;latest` |
| Android SDK Platform | compile SDK required by AGP (35/36 for current projects) |
| Build-Tools | version matching AGP |
| Platform-Tools (`adb`) | required by `android-emulator-skill`, `android-testing` |
| Emulator + a system image (`system-images;android-35;google_apis;x86_64`) | required for instrumented and UI tests |
| Gradle | use the project's checked-in wrapper (`./gradlew`), not a system Gradle |
| JDK | pinned via toolchain; see `kotlin-gradle-build` |

Standard install (on a machine with unrestricted network):

```bash
sdkmanager --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
                       "emulator" "system-images;android-36;google_apis;x86_64"
avdmanager create avd -n pixel -k "system-images;android-36;google_apis;x86_64"
```

Verification:

```bash
./gradlew :app:assembleDebug          # APK
./gradlew :app:bundleRelease          # AAB
./gradlew lint testDebugUnitTest      # static analysis + unit tests
./gradlew connectedDebugAndroidTest   # instrumented tests (needs emulator/device)
```

### 3.2 Signing and release

| Item | Where it lives | Notes |
| --- | --- | --- |
| Upload keystore (`.jks`) | CI secret store / password manager — **never the repo** | `keytool -genkeypair`; 25+ year validity |
| `keystore.properties` | local, git-ignored | referenced from `build.gradle.kts` |
| Play App Signing | Google Play Console | Google holds the app-signing key; you hold the upload key |
| Google Play service account JSON | CI secret store | for automated publishing |
| Target API level | Play Console policy | Play requires a recent target SDK each year; check current policy before release |

Release path: `./gradlew :app:bundleRelease` → upload `.aab` to Play Console (internal testing →
closed → production), or `eas submit -p android` if the project is Expo-managed.

Skills: `android-gradle-logic`, `kotlin-gradle-build`, `gradle-run`, `shipping-and-launch`,
`eas-app-stores`.

### 3.3 Coverage gap to be aware of

No installed skill is dedicated to Android runtime permissions, `WorkManager`, notifications, or
Play Store listing mechanics. Use `android-architecture` + `android-data-layer` for structure and
the official Android documentation for those APIs. Everything else on the Android side
(Compose UI/state/animation/navigation/performance/testing, Kotlin, Gradle, architecture) is
covered.

---

## 4. iOS

### 4.1 Build toolchain (macOS only)

| Component | Notes |
| --- | --- |
| macOS | current major version supported by the Xcode you need |
| Xcode | current stable; Command Line Tools selected via `xcode-select` |
| iOS Simulator runtimes | installed through Xcode |
| Swift | ships with Xcode; match the project's `swift-tools-version` |
| CocoaPods | only if the project still uses it; `swift-package-manager` covers the SPM path |
| Apple Developer Program membership | required for device builds, TestFlight, App Store |

```bash
xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 17' build
xcrun simctl boot "iPhone 17"
swift test          # SwiftPM packages
```

### 4.2 Signing and release

| Item | Notes |
| --- | --- |
| Distribution certificate (`.p12` + password) | CI secret store |
| Provisioning profile (`.mobileprovision`) | or Xcode-managed automatic signing for local work |
| App Store Connect API key (`.p8`, Key ID, Issuer ID) | preferred over app-specific passwords for CI |
| Bundle identifier + capabilities | must match App ID configuration |
| `PrivacyInfo.xcprivacy` | required by App Review; see `ios-privacy-manifests` |
| Export compliance answers | required on every submission |
| TestFlight | beta distribution before release; see `ios-beta-testing` |

Release path: archive (`xcodebuild archive`) → export (`-exportArchive` with `ExportOptions.plist`)
→ upload to App Store Connect → TestFlight → App Review. With Expo: `eas build -p ios` →
`eas submit -p ios`.

### 4.3 Coverage gap

No installed skill covers certificate/profile automation or `xcodebuild` archive/export flags in
depth. `ios-run-simulator` covers simulator builds; `ios-beta-testing` covers TestFlight strategy;
`ios-app-store-rejection-handler` covers review rejections. Certificate automation belongs to
Fastlane match, `xcodebuild -allowProvisioningUpdates`, or EAS credentials.

---

## 5. Cloud build and CI when the local toolchain is missing

| Service | Covers | Notes |
| --- | --- | --- |
| **EAS Build** (Expo) | Android + iOS, signing handled by EAS | Best fit for Expo/React Native; free tier limited, paid plans for volume |
| **GitHub Actions** | `ubuntu-latest` for Android; `macos-14`/`macos-15` runners for iOS | iOS minutes cost ~10× Linux; store signing material as encrypted secrets |
| **Xcode Cloud** | iOS/macOS | Apple-native, requires an Apple Developer account |
| **Codemagic / Bitrise** | Flutter-first, both platforms | Useful if Flutter is the stack |
| **Firebase App Distribution** | Android/iOS beta delivery | Pairs with GitHub Actions |

A workable split when the coding agent runs in a Linux sandbox like this one:

1. Agent authors code, tests, and configuration; runs JS/TS tests and static analysis locally.
2. CI (or EAS Build) produces the APK/AAB/IPA.
3. Device and UI tests run on emulators/simulators in CI (or via `android-emulator-skill` on a
   machine that has `adb`).

Skills: `ci-cd-and-automation`, `eas-workflows`, `eas-app-stores`, `shipping-and-launch`.

---

## 6. Credentials inventory

Never commit any of these. Store them in the CI secret store or a password manager, and scope
them to the smallest role that works.

| Secret | Used by |
| --- | --- |
| Android upload keystore (`.jks`) + `storePassword`, `keyAlias`, `keyPassword` | `bundleRelease` |
| Google Play service-account JSON | automated Play publishing |
| Apple distribution certificate (`.p12`) + password | `xcodebuild -exportArchive` |
| App Store Connect API key (`.p8` + Key ID + Issuer ID) | upload, TestFlight, `eas submit` |
| Provisioning profiles | device and App Store builds |
| EAS access token | non-interactive EAS builds in CI |
| Backend API keys, push credentials (APNs `.p8`, FCM service account) | runtime configuration — inject at build time, never hard-code |

Skills: `security-and-hardening`, `ios-privacy-manifests`, `ci-cd-and-automation`.

---

## 7. Tooling some skills expect but do not install

| Expectation | Provided by | Affected skills |
| --- | --- | --- |
| Dart/Flutter MCP server (`launch_app`, widget tree inspection) | `dart mcp` / the Flutter agent plugin's MCP configuration, which was **not** installed here | `flutter-fix-layout-issues`, `flutter-add-integration-test` |
| `adb` and `emulator` on `PATH`, or `ANDROID_HOME` set | Android SDK | `android-emulator-skill` |
| Gradle wrapper in the target project | the project itself (`gradle wrapper`) | `gradle-run`, `kotlin-gradle-build` |
| `node` for `expo-ui/scripts/list-components.js` | Node 20+ | `expo-ui` |
| `swift-snapshot-testing` package | added to the Xcode project | `ios-snapshot-test-setup` |

The Flutter plugin also normally ships rules and MCP configuration alongside its skills. Only the
skills were installed; add the MCP server separately if you want the interactive workflows those
two skills describe.

---

## 8. Readiness checklist

- [ ] Stack chosen (Expo / bare React Native / Flutter / native Android / native iOS)
- [ ] JDK + Android SDK installed, `sdkmanager --list` succeeds
- [ ] Emulator image created, `adb devices` lists it
- [ ] macOS + Xcode present for iOS, `xcodebuild -version` succeeds
- [ ] Simulator runtime installed, `xcrun simctl list devices` shows a device
- [ ] Signing identities and provisioning profiles in place (or EAS credentials configured)
- [ ] CI runner chosen; secrets stored outside the repository
- [ ] `flutter doctor -v` clean, if Flutter is in scope
- [ ] `npx expo-doctor` clean, if Expo is in scope
