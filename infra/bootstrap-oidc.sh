#!/usr/bin/env bash
#
# One-time setup that lets GitHub Actions deploy the API to Azure — no password,
# no client secret, nothing long-lived stored in GitHub.
#
# How it works: Azure trusts GitHub's OIDC token for this repository, so the
# workflow can sign in for the duration of a single job. This is the mechanism
# Microsoft and GitHub both recommend; there is no credential to leak or rotate.
#
# Run this once, from Azure Cloud Shell (or any machine with Azure CLI signed in):
#
#   cd ~/shaikhs && bash infra/bootstrap-oidc.sh
#
# It is idempotent: running it again repairs anything that was deleted.
#
# Environment overrides:
#   GITHUB_REPO      default: WaquarShaikh5555/Mee6
#   RESOURCE_GROUP   default: shaikhs-prod
#   LOCATION         default: centralindia
#   PREFIX           default: shaikhs
#   BRANCHES         default: "main arena/b0b002ad-mee6"
#
# If the GitHub CLI is signed in (`gh auth login`), the script also stores the
# values as repository variables and secrets, so there is nothing left to copy.

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-WaquarShaikh5555/Mee6}"
RESOURCE_GROUP="${RESOURCE_GROUP:-shaikhs-prod}"
LOCATION="${LOCATION:-centralindia}"
PREFIX="${PREFIX:-shaikhs}"
BRANCHES="${BRANCHES:-main arena/b0b002ad-mee6}"
APP_NAME="shaikhs-github-deploy"

say() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v az >/dev/null 2>&1 || fail "Azure CLI not found."
az account show >/dev/null 2>&1 || fail "Not signed in. Run: az login"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"

say "Subscription: $(az account show --query name -o tsv) ($SUBSCRIPTION_ID)"
say "Repository:   $GITHUB_REPO"
say "Resource group: $RESOURCE_GROUP"
say

# ---------------------------------------------------------------- application ---

APP_ID="$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)"

if [ -z "$APP_ID" ]; then
  say "Creating the Entra application '$APP_NAME'…"
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
else
  say "Entra application already exists ($APP_ID)."
fi

# The service principal is what actually receives role assignments.
az ad sp create --id "$APP_ID" >/dev/null 2>&1 || true

# --------------------------------------------------------------------- scope ---

if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  say "Creating resource group $RESOURCE_GROUP in $LOCATION…"
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null
fi

# OIDC: one federated credential per branch that may run the workflow.
for branch in $BRANCHES; do
  credential_name="github-$(printf '%s' "$branch" | tr '/' '-')"
  subject="repo:$GITHUB_REPO:ref:refs/heads/$branch"

  if az ad app federated-credential list --id "$APP_ID" \
       --query "[?name=='$credential_name'].name" -o tsv | grep -q .; then
    say "Federated credential '$credential_name' already exists."
  else
    say "Trusting GitHub Actions on branch '$branch'…"
    az ad app federated-credential create --id "$APP_ID" --parameters "{
      \"name\": \"$credential_name\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"$subject\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }" >/dev/null
  fi
done

# Contributor: create and update the resources.
# User Access Administrator: grant the container app's identity AcrPull, which is
# a role assignment inside the Bicep template.
for role in "Contributor" "User Access Administrator"; do
  if az role assignment create \
       --assignee "$APP_ID" --role "$role" --scope "$SCOPE" >/dev/null 2>&1; then
    say "Granted $role on the resource group."
  else
    say "Could not grant $role (it may already exist, or your account cannot assign it)."
  fi
done

# ----------------------------------------------------------- database password ---

DB_PASSWORD=""
IP_HASH_PEPPER=""

# If the API is already deployed, reuse the secrets it is using. They live in the
# container app's secret store, so nothing has to be recalled or retyped.
APP_NAME_FOUND="$(az containerapp list --resource-group "$RESOURCE_GROUP" \
  --query "[?starts_with(name, '${PREFIX}-api-')].name | [0]" -o tsv 2>/dev/null || true)"

if [ -n "$APP_NAME_FOUND" ]; then
  DATABASE_URL="$(az containerapp secret show --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME_FOUND" --secret-name database-url \
    --query value -o tsv 2>/dev/null || true)"

  if [ -n "$DATABASE_URL" ]; then
    DB_PASSWORD="$(python3 -c '
import sys, urllib.parse
print(urllib.parse.unquote(urllib.parse.urlparse(sys.argv[1]).password or ""))
' "$DATABASE_URL")"
    say "Recovered the existing database password from '$APP_NAME_FOUND'."
  fi

  IP_HASH_PEPPER="$(az containerapp secret show --resource-group "$RESOURCE_GROUP" \
    --name "$APP_NAME_FOUND" --secret-name ip-hash-pepper \
    --query value -o tsv 2>/dev/null || true)"
fi

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD="$(openssl rand -base64 24)"
  say "Generated a new database password (it will be used on first deployment)."
fi

if [ -z "$IP_HASH_PEPPER" ]; then
  IP_HASH_PEPPER="$(openssl rand -hex 32)"
fi

# ------------------------------------------------------------ store in GitHub ---

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  say "GitHub CLI is signed in — storing values in $GITHUB_REPO…"

  gh variable set AZURE_CLIENT_ID --repo "$GITHUB_REPO" --body "$APP_ID"
  gh variable set AZURE_TENANT_ID --repo "$GITHUB_REPO" --body "$TENANT_ID"
  gh variable set AZURE_SUBSCRIPTION_ID --repo "$GITHUB_REPO" --body "$SUBSCRIPTION_ID"
  gh variable set AZURE_RESOURCE_GROUP --repo "$GITHUB_REPO" --body "$RESOURCE_GROUP"
  gh variable set AZURE_LOCATION --repo "$GITHUB_REPO" --body "$LOCATION"

  printf '%s' "$DB_PASSWORD" | gh secret set DB_ADMIN_PASSWORD --repo "$GITHUB_REPO"
  printf '%s' "$IP_HASH_PEPPER" | gh secret set IP_HASH_PEPPER --repo "$GITHUB_REPO"

  say "Stored. Nothing left to copy — run the workflow from GitHub."
else
  cat <<EOF

GitHub CLI is not signed in here, so add these by hand.

GitHub mobile app → the repository → Settings → Secrets and variables → Actions

  Variables (tab "Variables")
    AZURE_CLIENT_ID        $APP_ID
    AZURE_TENANT_ID        $TENANT_ID
    AZURE_SUBSCRIPTION_ID  $SUBSCRIPTION_ID
    AZURE_RESOURCE_GROUP   $RESOURCE_GROUP
    AZURE_LOCATION         $LOCATION

  Secrets (tab "Secrets")
    DB_ADMIN_PASSWORD      $DB_PASSWORD
    IP_HASH_PEPPER         $IP_HASH_PEPPER

Keep this screen open while you copy the two secrets, then clear the terminal.
Treat those two values as passwords: database access and rate-limit hashing.

EOF
fi
