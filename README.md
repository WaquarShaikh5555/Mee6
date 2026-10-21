# Mee6

Two things live here:

1. **A mobile engineering skill library** — 115 Agent Skills that teach a coding agent how to build
   production Android and iOS apps. See [SKILLS.md](SKILLS.md) and
   [docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md](docs/MOBILE_TOOLCHAIN_REQUIREMENTS.md).
2. **Shaikh's** — the app those skills were installed to build.
   - Mobile app: `apps/mobile` — [README](apps/mobile/README.md)
   - Backend API: `apps/api` — [README](apps/api/README.md)
   - Infrastructure as code: `infra` — [deployment guide](docs/BACKEND.md)

## Shaikh's

Expo + React Native + TypeScript on the client; Fastify + PostgreSQL on the server. The design
foundation, navigation, and real authentication are complete and tested (92 mobile tests, 48 API
tests).

```bash
cd apps/api && npm install && npm run dev     # http://localhost:8082
cd apps/mobile && npm install && npx expo start
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to talk to the API (see
[apps/mobile/.env.example](apps/mobile/.env.example)); without it the app uses its on-device
demo service.

Deploying the backend to Azure takes one command — `DB_ADMIN_PASSWORD='…' ./infra/deploy.sh` —
and is documented end to end in [docs/BACKEND.md](docs/BACKEND.md). New to Azure, or working
from a phone? Start with [docs/AZURE_SETUP.md](docs/AZURE_SETUP.md).

Design direction, token values, and architecture decisions are in the app README and in
[docs/adr](docs/adr).
