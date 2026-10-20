# Mee6

Two things live here:

1. **A mobile engineering skill library** — 115 Agent Skills that teach a coding agent how to build
   production Android and iOS apps. See [SKILLS.md](SKILLS.md) and
   [docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md](docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md).
2. **Shaikh's** — the app those skills were installed to build, in `apps/mobile`.
   See [apps/mobile/README.md](apps/mobile/README.md).

## Shaikh's

Expo + React Native + TypeScript. Step 1 (design foundation, navigation, authentication) is
complete and tested.

```bash
cd apps/mobile
npm install
npx expo start
```

Design direction, token values, architecture decisions and the auth-provider swap are documented
in the app README and in [docs/adr/0001-stack-and-design-direction.md](docs/adr/0001-stack-and-design-direction.md).
