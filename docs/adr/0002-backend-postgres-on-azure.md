# ADR 0002 — Backend: PostgreSQL, an owned API, and Azure Container Apps

- **Status:** accepted
- **Date:** 2026-10-20
- **Deciders:** product owner, engineering
- **Supersedes:** nothing. Extends [ADR 0001](0001-stack-and-design-direction.md), which left
  the identity provider open behind an `AuthService` interface.
- **Context:** the app has a complete design system and a working authentication flow against a
  device-local demo service. That service does not verify passwords and cannot be used by more
  than one device. The owner has an Azure subscription, no prior backend experience, and will not
  write code. The backend has to be real enough to ship, cheap enough to leave running, and
  reproducible by one command.

## Decision 1 — Own the API; use PostgreSQL for everything

**Chosen:** a small TypeScript service in `apps/api` (Fastify 5, Node 22) with PostgreSQL 16 as
the only data store. Azure Database for PostgreSQL Flexible Server in production; PGlite — the
same PostgreSQL compiled to WebAssembly — in development and tests.

**Because:**

- One dialect means the migrations, queries, constraints, and indexes that pass locally are the
  ones that run in production. There is no "works on SQLite, breaks on Postgres" gap and no
  second schema to drift.
- The schema needs real database features: a partial unique index for case-insensitive email
  uniqueness among live accounts, cascading deletes, and transaction-wrapped migrations. These
  are one or two lines in PostgreSQL and awkward elsewhere.
- Auth is the part of a personal app most likely to be attacked and least tolerant of surprise
  vendor behaviour. Owning ~1,000 lines means the token format, revocation, and enumeration
  semantics are inspectable and testable.
- PGlite removes the usual local-Postgres tax: `npm install && npm run dev` works on any machine,
  including this sandbox, with no database server.

**Rejected:**

- *Supabase* — excellent developer experience, but it duplicates the API, pushes authorization
  into row-level-security policies the owner cannot review, and the free tier pauses idle
  projects. It also moves data outside the Azure subscription the owner already has.
- *Firebase* — vendor lock-in, a second data model, and the same "cannot run the production
  stack locally" problem.
- *Azure Cosmos DB* — the data is relational (users → sessions → reset tokens) and the access
  patterns are lookups, not scale-out writes. Cosmos would cost more and constrain the schema.
- *SQLite / a file* — no concurrent writers, no managed backups, and unacceptable for anything
  holding credentials.

**Consequence:** the owner has one more moving part to understand (a database), which is
mitigated by the deploy script and by migrations being automatic.

## Decision 2 — Opaque server-side sessions, not JWTs

**Chosen:** a 256-bit random token returned to the client; only its SHA-256 hash is stored.
Sessions expire after 30 days and can be revoked immediately.

**Because:**

- Sign-out and password reset must invalidate access *now*. A JWT stays valid until it expires
  unless a revocation list is built — at which point the database is back in the loop anyway.
- A database leak exposes hashes, not usable tokens.
- The app already had a `Session` type with a token, so the client contract did not change.

**Rejected:** JWT (revocation complexity, algorithm-confusion footguns), cookies (the client is a
native app, not a browser), OAuth/OIDC providers (correct for social sign-in; unnecessary weight
for email + password).

## Decision 3 — Azure Container Apps behind Azure Container Registry

**Chosen:** the API is a container image built in Azure, running on Container Apps consumption
plan with 0–3 replicas, in front of Flexible Server and ACS Email.

**Because:**

- `az acr build` builds remotely, so deployment works from a Windows laptop without Docker
  Desktop — a real constraint for a first-time operator.
- Scale-to-zero keeps a personal app near US$0/month in compute; when nobody is using it, nothing
  is billed.
- Container Apps terminates TLS and gives a managed HTTPS hostname without a custom domain.
- App Service was the alternative, but its Node build pipeline assumes Oryx and is harder to
  reproduce exactly; a container is the same artefact locally and in production.

**Rejected:** App Service (reproducibility), AKS (a cluster to operate for one app), Functions
(cold starts and no long-lived connection pool), virtual machines (patching, TLS, and backups
become the owner's job).

## Decision 4 — Identity stays behind the existing interface

**Chosen:** `httpAuthService` implements the existing `AuthService`; the app picks it when
`EXPO_PUBLIC_API_URL` is set, and otherwise falls back to the demo service.

**Because:** the screens never knew about a provider, so replacing one was a one-line change plus
a new file. The demo service stays useful for design work without a running backend.

**Consequence:** there is exactly one switch to change when the API URL moves, and the CI gate
(`npm run verify` in both apps) covers both paths.

## Decision 5 — What is deliberately not built yet

- MFA, social sign-in, email verification, and password-breach checks. Each is additive to the
  current schema and endpoints.
- Refresh-token rotation: a 30-day opaque session with server-side revocation is simpler and
  sufficient; it can be added without changing the client contract.
- Multi-region, read replicas, and high availability. A single Burstable instance with 7-day
  point-in-time restore is the right cost/benefit for one app.
- Kubernetes, queues, and microservices. There is no load to justify them.

**Review trigger:** revisit HA and read replicas when the app has sustained traffic, or when a
restore drill takes longer than the acceptable downtime.
