# ADR 0001 — Stack and design direction for Shaikh's

- **Status:** accepted
- **Date:** 2026-10-20
- **Deciders:** product owner, engineering
- **Context:** First build of a new app. No existing codebase, no prior stack, one developer plus
  an AI agent, and the owner has no prior app-shipping experience.

## Decision 1 — Expo (React Native) with TypeScript, not Flutter or native

**Chosen:** Expo SDK 58, React Native 0.88, TypeScript strict, Expo Router.

**Because:**

- One codebase reaches iOS, Android *and* web, which matters when the first milestone is showing
  the owner a working app rather than a binary.
- Expo Go means the app can be opened on a real phone without Xcode, an Apple Developer account,
  or an Android SDK — none of which are available in the development sandbox.
- EAS Build produces signed iOS and Android binaries from any machine, so shipping does not
  require owning a Mac.
- It runs in this sandbox today: Metro bundles, tests run, the web preview renders. Flutter's SDK
  host and the Android SDK host are both blocked here.

**Rejected:**

- *Flutter* — comparable cross-platform reach, but cannot be installed or run in this environment
  at all, and the toolchain would be unfamiliar to the owner.
- *Native Kotlin + Swift* — two codebases, two toolchains, and impossible to build here without
  both an Android SDK and a Mac. Right answer for a large team with deep platform needs; wrong
  first answer for one person shipping a first app.

**Consequence:** if the app later needs heavy platform-specific work, Expo supports native modules
and brownfield embedding, so this is not a dead end.

## Decision 2 — Design direction: "Ink & Peacock"

**Chosen:** a single deep-teal accent (`#0E6F6B` light / `#7FC7C1` dark) over warm parchment
neutrals, with brass (`#8A6227` / `#DFBC7C`) reserved for milestone moments. Georgia for the
wordmark, platform UI sans for text.

**Because:**

- A personal, long-lived app should feel calm and warm, not like an admin console. Warm neutral
  surfaces plus one confident accent achieve that; pure white plus corporate blue does not.
- Teal is distinctive without being loud, and it holds up in both light and dark because the ramp
  was built with separate values per scheme rather than inverted.
- Brass carries meaning: earned milestones and premium states. It is never body text, so it never
  competes for attention.
- System typefaces mean zero font payload, no layout shift on first paint, and complete support
  for Dynamic Type, accessibility sizes, and non-Latin scripts. A custom display face can be added
  later for the wordmark alone without touching the body scale.

**Rejected, and recorded so the choice does not drift back:**

| Direction | Why not |
| --- | --- |
| Cream + terracotta + high-contrast serif | The current default look of generated apps; reads as templated. |
| Near-black + acid green | Distinctive but signals a developer tool, not a personal space. |
| Blue SaaS + white cards | Correct and forgettable; nothing would be memorable. |
| One border-radius on everything | Flattens hierarchy — inputs, cards and sheets should not look identical. |

## Decision 3 — Semantic tokens, enforced by tests

**Chosen:** raw scales in `theme/tokens.ts`, role-based themes in `theme/semantic.ts`, consumed
only through `useTheme()`. Contrast is asserted in `__tests__/design-system.test.ts`.

**Because:** the common failure mode is a screen hardcoding `#888` or `padding: 13`, after which
the design system is fiction. Making tokens the only route to a value, and making contrast a test
rather than an opinion, keeps both properties true as the app grows. This already caught the
light-mode warning colour at 4.42:1 and forced a fix before any user saw it.

## Decision 4 — Authentication behind an interface

**Chosen:** every screen depends on `AuthService`; the demo implementation is one file behind it.

**Because:** choosing an identity provider is an infrastructure decision that should not block UI
work, and should be reversible. The provider decision is deferred to a later ADR once features are
known — whether the app needs social login, MFA, or organisational accounts changes the answer
between Microsoft Entra External ID, Supabase, and Firebase.
