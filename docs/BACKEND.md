# Shaikh's backend

The app's accounts, sessions, and password resets live here. This document is the
operator's manual: what exists, how to run it on a laptop, how to deploy it to Azure,
and what to do when something breaks.

**Status:** implemented, exercised locally, and ready to deploy. The code is in
[`apps/api`](../apps/api); infrastructure is in [`infra`](../infra).
It has not yet been deployed to a real Azure subscription, because this development
environment has no Azure credentials — see [What is needed from you](#what-is-needed-from-you).

---

## 1. What it is

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 22, TypeScript (ESM, strict) | Same language as the app; no build surprises |
| HTTP | Fastify 5 | Fast, schema-driven, good plugin isolation |
| Database | PostgreSQL 16 — Azure Flexible Server in production, embedded PGlite in development | One dialect everywhere; the same migrations run in both |
| Passwords | argon2id (`m=19456, t=2, p=1`) | OWASP-recommended default; memory-hard |
| Sessions | Opaque 256-bit bearer tokens, SHA-256 hashed at rest | Revocable, no JWT footguns, a database leak exposes no usable token |
| Email | Azure Communication Services (REST) | Same cloud as the rest of the deployment; no extra vendor |
| Hosting | Azure Container Apps | Scale to zero, HTTPS and a managed domain for free |
| Images | Azure Container Registry, built in Azure | No Docker required on your machine |

### API surface

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Liveness/readiness. `200` ok, `503` when the database is unreachable |
| `POST` | `/v1/auth/signup` | — | Create an account, returns a session |
| `POST` | `/v1/auth/signin` | — | Email + password → session |
| `GET` | `/v1/auth/session` | Bearer | Validate the token, refresh the expiry |
| `POST` | `/v1/auth/signout` | Bearer | Revoke this session (`204`) |
| `POST` | `/v1/auth/password/forgot` | — | Send a reset link. Always `202`, even for unknown addresses |
| `POST` | `/v1/auth/password/reset` | — | Consume a reset token, set a password, revoke every session |
| `GET` | `/v1/me` | Bearer | Current profile |
| `PATCH` | `/v1/me` | Bearer | Change the display name |
| `DELETE` | `/v1/me` | Bearer | Soft-delete the account (password required), free the email address |

Errors always use the same shape:

```json
{ "error": { "code": "invalid_credentials", "message": "Email or password is incorrect." } }
```

Codes: `invalid_request`, `invalid_credentials`, `email_in_use`, `weak_password`,
`invalid_email`, `unauthorized`, `session_expired`, `not_found`, `rate_limited`, `internal`.

### Data model

Three tables, created by [`0001_init.sql`](../apps/api/src/db/migrations/0001_init.sql):

- **`users`** — id (uuid), email, password_hash, display_name, timestamps, `deleted_at`.
  A partial unique index (`users_email_live_idx`) enforces case-insensitive uniqueness
  **only among live accounts**, so deleting an account frees its address for re-signup.
- **`sessions`** — token_hash (unique), user_id, expires_at, revoked_at, user_agent, ip_hash.
  Cascades on user delete.
- **`password_reset_tokens`** — token_hash, user_id, expires_at, used_at.

Migrations are forward-only, numbered, and applied in one transaction each
(`schema_migrations` records what ran). They run automatically at startup, and can be run
on their own with `npm run migrate`.

### Security properties (verified by tests)

- Unknown email and wrong password produce byte-identical `401` responses and take the
  same time (a dummy argon2 verification runs for unknown accounts).
- Only SHA-256 hashes of tokens are stored; a database dump cannot be replayed.
- Sign-out and password reset revoke sessions immediately, not at expiry.
- Sign-up, sign-in, and reset endpoints are rate limited per IP and per route.
- Helmet security headers, a 64 KB body limit, and CORS limited to an explicit allowlist
  in production.
- Account deletion is a soft delete, which is what the App Store requires for
  account-deletion requests (guideline 5.1.1(v)).

---

## 2. Run it locally

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

That starts the API on **http://localhost:8082** with an embedded PostgreSQL 16 (PGlite)
stored in `apps/api/.data/pg`, and prints password-reset emails to the log instead of
sending them. Migrations run automatically on first boot.

```bash
curl localhost:8082/health
# {"status":"ok","version":"0.1.0","database":"up","store":"pglite","time":"…"}

curl -X POST localhost:8082/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"shaikhs2026","displayName":"Waquar"}'
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Watch mode with pretty logs |
| `npm run build` | Compile to `dist/`, including the SQL migrations |
| `npm start` | Run the compiled server |
| `npm run migrate` | Apply migrations and exit |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 48 tests against an in-memory PostgreSQL |
| `npm run verify` | Typecheck + tests |

To try the reset flow locally: call `POST /v1/auth/password/forgot`, read the
`shaikhs://reset-password?token=…` line from the server log, and POST the token to
`/v1/auth/password/reset`.

**Production guard rails in `src/config.ts`:** `NODE_ENV=production` refuses to start
without `DATABASE_URL`, and refuses the development `IP_HASH_PEPPER`.

---

## 3. Deploy to Azure

> New to Azure, or no computer? [`docs/AZURE_SETUP.md`](AZURE_SETUP.md) explains the
> account, the resources, how to pick a region, and what it costs — in plain language.
> This section is the operator's reference.

### What gets created

All in one resource group, with names suffixed by a hash of the group id so they are
unique in the subscription:

| Resource | Name pattern | SKU | Cost (approx.) |
| --- | --- | --- | --- |
| PostgreSQL Flexible Server + database `shaikhs` | `shaikhs-pg-xxxx` | Burstable B1ms, 32 GB, 7-day backups | US$13/mo — **free for 12 months on a new free account** |
| Container Registry | `acrshaikhsxxxx` | Basic | US$5/mo |
| Container Apps environment + app | `shaikhs-env-xxxx` / `shaikhs-api-xxxx` | Consumption, 0–3 replicas | US$0–3/mo (monthly free grant covers low traffic) |
| Log Analytics | `shaikhs-logs-xxxx` | PerGB2018, 30 days | < US$1/mo |
| Communication Services + managed email domain | `shaikhs-acs-xxxx` | Pay per email | pennies |
| User-assigned managed identity | `shaikhs-api-id` | — | free |

**Total: about US$5–9/month in the first year on a new free account, and US$18–22/month
after that**, dominated by the database. On Azure for Students the US$100 credit covers the
whole first year, and the subscription cannot overspend — see
[`docs/AZURE_SETUP.md`](AZURE_SETUP.md#2-what-you-need-before-starting). Prices vary by region — check the Azure pricing
calculator, and set a budget alert ([`docs/AZURE_SETUP.md`](AZURE_SETUP.md#6-what-it-costs)).

### Prerequisites

1. An Azure subscription where you can create resources.
2. [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) 2.60+ on your
   machine (Windows, macOS, or Linux).
3. Sign in: `az login` (a browser window opens).
4. The right permissions: **Contributor** on the resource group, plus **User Access
   Administrator** so the script can grant the app's identity permission to pull its
   image. The Owner role includes both.

No computer? Skip to [Deploying from a phone](#deploying-from-a-phone-no-pc-required) —
the prerequisites above are handled for you inside Azure Cloud Shell.

Docker is *not* required — the image is built by Azure Container Registry.

### One command

From the repository root:

```bash
./infra/deploy.sh
```

That is genuinely all of it. The database password is generated and stored in Azure; you
never see or need it. Optional overrides (environment variables):

| Variable | Default | Notes |
| --- | --- | --- |
| `RESOURCE_GROUP` | `shaikhs-prod` | Created if missing |
| `LOCATION` | `centralindia` | Any region with Container Apps and PostgreSQL |
| `PREFIX` | `shaikhs` | Used in every resource name |
| `ACS_DATA_LOCATION` | `Asia Pacific` | Where email data is stored |
| `CORS_ORIGINS` | empty | Only needed for the web build, e.g. `https://app.example.com` |
| `IP_HASH_PEPPER` | generated | Keep it stable across deploys |
| `DB_ADMIN_PASSWORD` | generated | Only set it if you want to choose the password |

The script takes 10–15 minutes on the first run. It:

1. Creates the resource group.
2. Deploys [`infra/main.bicep`](../infra/main.bicep) — database, registry, logs, container
   environment, email service, identity, and the container app itself.
3. Builds `apps/api/Dockerfile` in Azure Container Registry (`az acr build`).
4. Rolls the new image into the container app.
5. Waits for `/health` and prints the API URL.

At the end it prints:

```
API URL: https://shaikhs-api-xxxxxxxx.<region>.azurecontainerapps.io
```

### Deploying from a phone (no PC required)

You do not need a computer, and you do not need to send anyone a password.
**Azure Cloud Shell** is a terminal that runs inside Azure, already signed in to your
subscription, with `az`, `git` and `openssl` installed. It works in a mobile browser.

**Open it:** the Azure mobile app (iOS/Android) → **Cloud Shell** (the `>_` icon), or
[portal.azure.com](https://portal.azure.com) in Chrome/Safari → the `>_` icon in the top bar.

The **first** time, Cloud Shell asks for a storage account. Tap **Create** — that is
Cloud Shell's own small disk for your home directory (a few MB, costing pennies), not part
of the app. It happens once, ever.

Then paste this single line:

```bash
git clone -q -b arena/b0b002ad-mee6 --depth 1 https://github.com/WaquarShaikh5555/Mee6.git ~/shaikhs && cd ~/shaikhs && bash infra/deploy.sh 2>&1 | tee deploy.log
```

That is the whole task. The script generates the database password itself, deploys, builds
the image, starts it, and waits for `/health`. **Nothing is ever typed, saved, or sent.**

- It takes **10–15 minutes**. You can lock the phone; the work continues in Azure.
- If the browser or the session drops, open Cloud Shell again and run
  `cd ~/shaikhs && bash infra/deploy.sh` — it reuses what exists, including the database
  password, and carries on.
- When it finishes, the last lines include:

  ```
  API URL: https://shaikhs-api-xxxxxxxx.<region>.azurecontainerapps.io
  ```

  Copy that line and send it to me. It is a public address, not a secret.

> **Worried about cost?** Everything is created in one resource group. To undo the whole
> deployment: `az group delete --name shaikhs-prod --yes --no-wait`. Pricing for this
> stack is about US$22–27/month at idle, dominated by the database.

### One-tap redeploys from GitHub (optional)

Once the infrastructure exists, you may prefer not to touch Cloud Shell again. The
workflow in [`.github/workflows/deploy-api.yml`](../.github/workflows/deploy-api.yml)
deploys on demand from GitHub's own runners — one tap in the GitHub mobile app, or I can
trigger it from here.

It authenticates with **OIDC federation**, so no Azure password or client secret is ever
stored in GitHub. Set it up once, in Cloud Shell:

```bash
cd ~/shaikhs && bash infra/bootstrap-oidc.sh
```

The script prints four values. Put them in the repository on GitHub (mobile app → the repo
→ **Settings → Secrets and variables → Actions**):

| Type | Name | Value |
| --- | --- | --- |
| Variable | `AZURE_CLIENT_ID` | printed as Application (client) ID |
| Variable | `AZURE_TENANT_ID` | printed as Directory (tenant) ID |
| Variable | `AZURE_SUBSCRIPTION_ID` | printed as Subscription ID |
| Secret | `DB_ADMIN_PASSWORD` | the same database password the script used |

Then **Actions → Deploy API → Run workflow**. This is optional; the Cloud Shell path above
is always enough.

> GitHub only offers a manual workflow on the **default branch**, so this becomes
> available once the backend is merged into `main`. Say the word and I will open and
> merge the pull request.

### Why you never need to send me credentials

This development environment can reach GitHub, npm and PyPI — and nothing else. It cannot
call Azure's management API even if it had a credential, so an Azure password here would
be risk with no benefit. What I need from you is not access; it is the **API URL** at the
end, plus answers to design questions.

### Manual equivalent

If you would rather run each step yourself:

```bash
az login
az group create --name shaikhs-prod --location centralindia

DB_ADMIN_PASSWORD='choose-a-long-password'
IP_HASH_PEPPER="$(openssl rand -hex 32)"

az deployment group create \
  --resource-group shaikhs-prod \
  --template-file infra/main.bicep \
  --parameters dbAdminPassword="$DB_ADMIN_PASSWORD" \
               ipHashPepper="$IP_HASH_PEPPER" \
               location=centralindia \
               acsDataLocation='Asia Pacific'

az acr build --registry <registryName from outputs> \
  --image shaikhs-api:1 --file apps/api/Dockerfile apps/api

az containerapp update --resource-group shaikhs-prod \
  --name <containerAppName from outputs> \
  --image <registryLoginServer>/shaikhs-api:1
```

All outputs (`apiUrl`, `registryName`, `containerAppName`, `postgresHost`,
`acsSenderAddress`, …) are listed with:

```bash
az deployment group show -g shaikhs-prod -n <deployment-name> --query properties.outputs
```

### Verify the deployment

```bash
curl https://<apiUrl>/health
# {"status":"ok","database":"up","store":"postgres",…}

curl -X POST https://<apiUrl>/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"shaikhs2026","displayName":"Waquar"}'
```

Then request a password reset for that address and check that the email arrives from
`DoNotReply@<random>.azurecomm.net`.

### Point the app at it

In `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://<apiUrl>
```

Restart with `npx expo start -c`. The "Preview build" badge disappears, the demo button
is hidden, and every screen now talks to PostgreSQL through the API.

---

## 4. Configuration

Every variable is validated at boot; a bad value stops the process with a readable message
instead of failing on the first request.

| Variable | Default | Production |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` (set by Bicep) |
| `PORT` / `HOST` | `8082` / `0.0.0.0` | `8080` in the container |
| `DATABASE_URL` | — (PGlite) | Required; set as a Container App secret |
| `PGLITE_PATH` | `memory://` | unused |
| `DB_POOL_MAX` | `10` | fine for a single instance |
| `CORS_ORIGINS` | empty | comma-separated origins, or empty |
| `SESSION_TTL_DAYS` | `30` | `30` |
| `RESET_TTL_MINUTES` | `60` | `60` |
| `IP_HASH_PEPPER` | dev value | Required; a random 64-hex string |
| `EMAIL_TRANSPORT` | `console` | `acs` |
| `ACS_CONNECTION_STRING` | — | Required with `acs` |
| `ACS_SENDER_ADDRESS` | — | Required with `acs` |
| `APP_PUBLIC_URL` | `shaikhs://reset-password` | deep link used in emails |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `10` | `10` |
| `TRUST_PROXY` | off | `true` behind Container Apps |
| `LOG_LEVEL` | `info` | `info` |

---

## 5. Secrets

Nothing secret is committed. In Azure:

- The database password and connection string live in the Container App's **secret**
  store, referenced by environment variables (`secretRef`).
- The ACS connection string is likewise a Container App secret.
- `IP_HASH_PEPPER` is a secret; changing it only resets IP-hash continuity (it does not
  invalidate sessions).

Rotation:

```bash
# Database password
az postgres flexible-server update -g shaikhs-prod -n <postgresServerName> \
  --admin-password 'new-long-password'
az containerapp secret set -g shaikhs-prod -n <containerAppName> \
  --secrets database-url="postgres://shaikhsadmin:NEW_PASSWORD@<host>:5432/shaikhs?sslmode=require"
# then restart the revision
az containerapp revision restart -g shaikhs-prod -n <containerAppName> --revision <name>

# ACS key: regenerate, then update the acs-connection-string secret the same way
az communication regenerate-key --name <acsResourceName> -g shaikhs-prod --key-type primary
```

The PostgreSQL firewall allows `0.0.0.0`, which means **Azure services**, not the public
internet. Connections still require the generated admin password over TLS.

---

## 6. Operations

| Task | Command |
| --- | --- |
| Tail logs | `az containerapp logs show -g shaikhs-prod -n <app> --follow` |
| List revisions | `az containerapp revision list -g shaikhs-prod -n <app> -o table` |
| Restart | `az containerapp revision restart -g shaikhs-prod -n <app> --revision <name>` |
| Scale | `az containerapp update -g shaikhs-prod -n <app> --min-replicas 1 --max-replicas 5` |
| Apply migrations only | `az containerapp exec -g shaikhs-prod -n <app> --command "node dist/db/migrate-cli.js"` |
| Database state | `az postgres flexible-server show -g shaikhs-prod -n <server> --query state` |

**Migrations** run at every container start and are idempotent. A failed migration rolls
back that file and the process exits, so a bad deploy never serves traffic against a
half-migrated schema.

**Backups** are automatic (7 days, point-in-time). Restore to a new server:

```bash
az postgres flexible-server restore -g shaikhs-prod \
  --name shaikhs-pg-restored \
  --source-server <server> --restore-time "2026-10-20T12:00:00Z"
```

**Rollback** is redeploying the previous image tag (the deploy script tags by timestamp):

```bash
az containerapp update -g shaikhs-prod -n <app> \
  --image <registryLoginServer>/shaikhs-api-<previous-tag>
```

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Container restarts in a loop, logs say `DATABASE_URL is required` | Secret not set | `az containerapp secret list -g … -n …` |
| `/health` returns 503 | Database unreachable: firewall or password | Check the firewall rule `AllowAzureServices`; check the password in the connection string |
| `401` from the app but credentials are right | The app is talking to the demo service, or the token was revoked by a password reset | Confirm `EXPO_PUBLIC_API_URL` is set and rebuild with `-c` |
| App cannot reach the API from a phone | `localhost` is the phone, not your laptop | Use your laptop's LAN IP (`http://192.168.x.x:8082`) |
| Reset email never arrives | ACS transport in `console`, or the sender is not verified | `az containerapp logs show …` and look for `ACS email rejected` |
| `429 rate_limited` while testing | 10 auth requests/minute per IP | Wait a minute, or raise `RATE_LIMIT_AUTH_PER_MINUTE` |
| Deploy fails with `AuthorizationFailed` on role assignment | Account lacks User Access Administrator | Ask an owner, or re-run after being granted the role |

---

## 8. What is needed from you

Nothing secret, and nothing you have to type into a chat.

1. **Confirm you can create resources.** Contributor + User Access Administrator on a
   resource group, or Owner. A personal subscription normally allows this.
2. **A region.** `centralindia` is the default if your users are in India; `uksouth` or
   `westeurope` also work.
3. **A sender decision.** The default uses a Microsoft-managed domain
   (`DoNotReply@<random>.azurecomm.net`) and needs no DNS work. If you own a domain, say
   which, and I will add the custom-domain steps.
4. **Run the block in [Deploying from a phone](#deploying-from-a-phone-no-pc-required)**
   and send me the `API URL` it prints.

That is the full list. The database password is generated on your device and stays in
Azure; I never see it and never need it.

Once I have the URL I will point the app at it and run a full sign-up → sign-in →
reset → sign-out check against the live deployment, then report back.
