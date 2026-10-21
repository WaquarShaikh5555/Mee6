# Setting up Azure for Shaikh's

> **Not the current architecture.** The app now uses Supabase, which needs no deployment
> step at all — see [`docs/SUPABASE.md`](SUPABASE.md). This guide describes hosting the
> Fastify API on Azure and is kept for reference only.


A plain-language guide to the Azure side: what an account is, what gets created, which
region to pick, what it costs, and how to undo it. No prior Azure knowledge assumed, and
nothing here requires a computer.

**Short version:** you need an Azure account, one region choice, and about fifteen minutes.
Everything else — seven resources, their settings, and the links between them — is created
from a template in this repository. You do not have to click through the portal.

---

## 1. The mental model

Azure has three levels. That is the whole thing.

| Level | What it is | In this project |
| --- | --- | --- |
| **Subscription** | Who pays and who has access. Most people have one. | Your existing Azure subscription |
| **Resource group** | A folder that holds everything belonging to one app | `shaikhs-prod` |
| **Resources** | The individual services inside that folder | Database, server, email, etc. |

The resource group matters for two practical reasons: every cost report can be filtered to
it, and deleting it deletes the app completely — no orphaned services quietly billing you.

**A region** is which Microsoft datacenter runs a resource. It is chosen per resource, and it
is the only real decision you have to make (section 4).

---

## 2. What you need before starting

- A **Microsoft account** (an `@outlook.com` or `@hotmail.com` address, or any email you
  register with Microsoft). A GitHub account also works for sign-in.
- A **phone number** for verification.
- A **debit or credit card** (not prepaid) — **not needed on Azure for Students**. Azure uses
  it to verify identity on a normal account; it is not charged unless you upgrade and exceed
  the free amounts.
- Optionally the **Azure mobile app** (iOS / Android) — it has Cloud Shell built in, which
  is the terminal used in section 5.

If you have no Azure account yet: [azure.microsoft.com/free](https://azure.microsoft.com/free).
If you have a college email address, check
[Azure for Students](https://azure.microsoft.com/free/students) first — it usually avoids the
card requirement.

### If you have Azure for Students

Your subscription is different from a normal one in three ways worth knowing before you
deploy.

**1. Your regions are restricted — check this first.** Student subscriptions carry a
Microsoft-managed Azure Policy called *"Allowed resource deployment regions"*. Deploying
outside that list fails with `RequestDisallowedByAzure`, and the list **varies per
student** — it is not just "all of India". See which ones you have:

```bash
az policy assignment list \
  --query "[?contains(policyDefinitionId, 'e56962a6')].parameters.listOfAllowedLocations.value[]" \
  --output tsv
```

`centralindia` is on most student lists, but trust the output, not this page. The deploy
script runs this check itself and stops with the list if the region is wrong.

**2. You have US$100 for 12 months, and no card on file.** Once the credit is gone the
subscription is disabled — services stop, but **you cannot be billed**, because there is no
payment method. That makes the risk here zero rather than small.

**3. The 12-month free amounts apply too**, including PostgreSQL Flexible Server B1ms
(750 hours/month, 32 GB storage). So in practice the only charge is the container registry:
about **US$5/month ≈ US$60 for the year**, leaving roughly US$40 of credit.

### Which kind of account you have matters for cost

| | **Azure free account** (new customers) | **Pay-as-you-go** |
| --- | --- | --- |
| Credit | US$200, valid 30 days | none |
| Free for 12 months | Includes **PostgreSQL Flexible Server B1ms: 750 hours/month + 32 GB storage** — exactly the size used here | not applicable |
| After 30 days | Must upgrade to pay-as-you-go to keep resources running | — |
| Always free | Container Apps: first 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests each month | same |

So on a free account, the database is free for the first year, and a low-traffic API stays
inside the Container Apps monthly grant. The main unavoidable cost is the container registry
(section 6).

---

## 3. What gets created

Seven resources, all in one resource group. The template
([`infra/main.bicep`](../infra/main.bicep)) is the source of truth; this is what it means.

| Resource | Plain description | Size / tier | Why it exists |
| --- | --- | --- | --- |
| **Resource group** `shaikhs-prod` | The folder | — | Groups everything for billing and deletion |
| **PostgreSQL Flexible Server** `shaikhs-pg-xxxx` + database `shaikhs` | The database | Burstable B1ms, 32 GB, 7-day backups | Stores accounts, sessions, reset tokens |
| **Container Registry** `acrshaikhsxxxx` | A private warehouse for the server's container image | Basic | Azure builds the image there, so no Docker on your machine |
| **Log Analytics workspace** `shaikhs-logs-xxxx` | Where server logs are collected | Pay per GB | Lets you read logs after deployment without a terminal |
| **Container Apps environment** `shaikhs-env-xxxx` | The shared runtime underneath the app | Consumption | Provides networking and scaling |
| **Container App** `shaikhs-api-xxxx` | The API server itself, with HTTPS and a public URL | 0.5 vCPU / 1 GiB, 0–3 replicas | Answers the app's requests |
| **Communication Services** `shaikhs-acs-xxxx` + managed email domain | Sends password-reset emails | Pay per email | No email server to run |
| **Managed identity** `shaikhs-api-id` | An Azure identity for the app | — | Lets it pull its image without storing a password |

Names end in a short hash (`xxxx`) because resource names must be unique inside Azure. The
script prints the real names at the end.

Two settings are easy to get wrong by hand and are handled for you:

- **Secrets.** The database connection string, the email key, and the hashing pepper are
  stored in the Container App's secret store, referenced by environment variables. They are
  never in the repository and never in a command you have to type.
- **Permissions.** The app's identity is granted permission to pull from the registry. If
  you build this by hand, forgetting this is the single most common failure: the app starts
  and immediately cannot download its own image.

---

## 4. Choosing a region

Everything regional should be in **one** region — the app and the database talk constantly,
and cross-region chatter adds latency to every request. Email is the exception: Azure
Communication Services stores data in a *data location* you choose separately.

| Region | Where | Pick it when |
| --- | --- | --- |
| **`centralindia`** | Pune | **Recommended.** Closest to you; on most student lists |
| `southindia` | Chennai | Alternative India region |
| `jioindiawest` | Mumbai | Another India option; check service availability |
| `uksouth` / `westeurope` | London / Netherlands | Most of your users are in Europe |
| `eastus2` / `centralus` | United States | Most of your users are in America |

Both Container Apps and PostgreSQL Flexible Server are available in `centralindia`, as are
all the other resources in the list above — but on a student subscription the allowed list
wins over all of this. Run the check in section 2 first.

For the email **data location**, `Asia Pacific` is the sensible match for India. It only
decides where Azure stores message metadata; it does not affect delivery speed.

> If a region is out of capacity for Container Apps (rare, but it happens in busy regions),
> the deployment fails with a clear "capacity" message. Change `LOCATION` to `southindia`
> and run it again — nothing is lost.

---

## 5. Creating it

There are two ways. The first is what I recommend; the second is there so nothing feels
like a black box.

### A. Let the template do it (recommended, ~15 minutes)

You need a terminal that lives in Azure, because your phone cannot run the Azure tools.
**Azure Cloud Shell** is exactly that: a Linux terminal inside Azure, already signed in to
your account, with everything installed. It is free, apart from pennies of storage.

1. Open **portal.azure.com** in your phone browser, or the **Azure mobile app → Home →
   Cloud Shell** card.
2. **The one prompt you will see:** Cloud Shell asks for a storage account. Tap **Create**.
   This is Cloud Shell's own scratch disk for your home folder — a few MB, pennies a
   month — and it is *not* part of the app. It appears once, ever, and you never touch it
   again.
3. Paste this single line:

   ```bash
   git clone -q -b arena/b0b002ad-mee6 --depth 1 https://github.com/WaquarShaikh5555/Mee6.git ~/shaikhs && cd ~/shaikhs && bash infra/deploy.sh 2>&1 | tee deploy.log
   ```

4. Wait. It creates the resource group, deploys the template, builds the server image in
   Azure, starts it, and waits for `/health`. The database password is generated inside the
   script and stored in Azure, so there is nothing to invent, type, or remember.

Things worth knowing:

- **Cloud Shell ends after 20 minutes without input.** The deployment takes 10–15 minutes,
  but if the session does drop, nothing is broken. Open Cloud Shell again and re-run
  `cd ~/shaikhs && bash infra/deploy.sh` — it skips what already exists and continues.
- **The password is generated inside the script** and is never printed or sent anywhere. It
  ends up only in the database and in the Container App's secret store.
- **Re-running is always safe.** The template is incremental, the image tag is unique per
  run, and an existing database password is reused rather than replaced.
- The mobile app's Cloud Shell cannot show command history or accept file uploads. Pasting a
  block works fine.

At the end it prints:

```
API URL: https://shaikhs-api-xxxxxxxx.<region>.azurecontainerapps.io
```

That is the address the app will talk to. It is public, not a secret.

### B. Clicking it yourself in the portal

Possible, and a reasonable way to learn — but expect roughly an hour on a phone, and expect
to get one of the following wrong at least once:

1. **Resource group** — Portal → Resource groups → Create. Name `shaikhs-prod`, region
   `centralindia`.
2. **PostgreSQL** — Create → "Azure Database for PostgreSQL Flexible Server". Burstable
   B1ms, 32 GB, version 16. Save the admin login and password. Under Networking choose
   "Public access", and add a firewall rule `0.0.0.0`–`0.0.0.0` (this means "Azure
   services", not the internet). Then create a database called `shaikhs`.
3. **Container Registry** — Basic tier. Note the login server
   (`<name>.azurecr.io`).
4. **Log Analytics** — a workspace in `centralindia`.
5. **Container Apps environment** — Create, referencing the workspace for logs.
6. **Container App** — inside that environment. Ingress: external, target port `8080`.
   Image: the one built from `apps/api/Dockerfile`. Environment variables: at minimum
   `NODE_ENV=production`, `DATABASE_URL`, `IP_HASH_PEPPER`, `EMAIL_TRANSPORT=acs`,
   `ACS_CONNECTION_STRING`, `ACS_SENDER_ADDRESS`. All three secrets must be marked as
   secrets, not plain values. Give the app's managed identity the **AcrPull** role on the
   registry, or it cannot download the image.
7. **Communication Services** — create it, add an "Azure Managed Domain" under Email, then
   link that domain to the communication service. Copy the connection string from Keys.

Every one of those settings exists in the template, which is why running the template is
less error-prone than reproducing it by hand. If you want to learn what each value does,
the template is short and commented.

---

## 6. What it costs

Approximate, monthly, in US dollars. Check the
[pricing calculator](https://azure.microsoft.com/pricing/calculator/) for your region —
prices vary and change.

| Resource | Cost | Notes |
| --- | --- | --- |
| PostgreSQL B1ms + 32 GB | **~$13/month** | **Free for 12 months** on a new free account |
| Container Registry Basic | **~$5/month** | The main fixed cost; there is no free tier |
| Container App | **$0–3/month** | Free grant covers a low-traffic API; scales to zero |
| Log Analytics | **< $1/month** | Pay per GB ingested; this app logs very little |
| Communication Services email | **pennies** | Charged per email |
| Cloud Shell storage | **< $0.10/month** | A few MB of files |
| **Total, first 12 months** | **≈ $5–9/month** | dominated by the registry |
| **Total, after 12 months** | **≈ $18–22/month** | database is no longer free |

**Set a budget alert before you deploy.** It takes two minutes and removes all anxiety:

Portal → **Cost Management + Billing** → **Budgets** → **Add**. Scope it to the resource
group `shaikhs-prod`, amount ₹500 (or $10), and add your email at 50% and 100%. Alerts are
free and do not stop anything — they just tell you.

To stop all charges between work sessions, stop the database
(Portal → the PostgreSQL server → **Stop**). Its storage still costs a little, but compute
stops. Delete the whole resource group to stop everything.

---

## 7. After deployment

| I want to… | Do this |
| --- | --- |
| See the app's URL | It is printed at the end; also Portal → the Container App → Overview |
| Read server logs | Portal → the Container App → **Log stream**, or `az containerapp logs show -g shaikhs-prod -n <app> --follow` |
| Check it is alive | Open `<API URL>/health` in a browser — expect `"status":"ok"` |
| Restart it | Portal → the Container App → **Restart** |
| Change a setting | Edit `apps/api/src/config.ts` defaults or the template, then re-run `infra/deploy.sh` |
| Delete everything | Portal → resource groups → `shaikhs-prod` → **Delete resource group** |
| See the bill | Portal → **Cost Management** → **Cost analysis**, filtered to the resource group |

---

## 8. Questions people actually ask

**Do I need a domain name?** No. Azure gives the API an HTTPS address on
`*.azurecontainerapps.io`, and email is sent from a Microsoft-managed domain.

**Do I need a credit card?** For a normal account, yes — Azure verifies identity with it. A
prepaid card will not work. The free account is not charged unless you upgrade.

**Will it suddenly bill me a lot?** The sizes here are fixed and small; nothing scales
without limit. The only variable cost is traffic, and the free grant covers a personal app
several times over. The budget alert is your safety net.

**Can I use my existing subscription?** Yes. If you already pay for Azure, skip the free
account section — the deployment is the same; only the 12-month database discount may not
apply.

**What if I am in a country where the mobile app is unavailable?** Use
[portal.azure.com](https://portal.azure.com) in any browser; it works the same.

**Do I need to understand any of this to use the app?** No. This document exists so the
answers are available, not because you need them to ship.

---

## 9. Where to go next

- [`docs/BACKEND.md`](BACKEND.md) — the full backend manual: API surface, configuration,
  secrets, backups, rollback, troubleshooting.
- [`infra/main.bicep`](../infra/main.bicep) — the actual template, commented.
- [`infra/deploy.sh`](../infra/deploy.sh) — the script, ~150 lines, readable end to end.
- [`docs/adr/0002-backend-postgres-on-azure.md`](adr/0002-backend-postgres-on-azure.md) —
  why these services were chosen, and what was rejected.
