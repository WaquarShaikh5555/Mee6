#!/usr/bin/env bash
#
# Deploys the Shaikh's backend from nothing to a running API.
#
# Prerequisites
#   • Azure CLI 2.60 or newer, signed in:  az login
#   • Permission to create resources in the subscription (Contributor + User Access Administrator,
#     because the script grants the app's identity permission to pull its image)
#   • openssl (ships with macOS and most Linux distributions; Git Bash on Windows has it too)
#
# Usage
#   DB_ADMIN_PASSWORD='a-long-password' ./infra/deploy.sh
#
# Optional overrides
#   RESOURCE_GROUP    default: shaikhs-prod
#   LOCATION          default: centralindia
#   PREFIX            default: shaikhs
#   ACS_DATA_LOCATION default: "Asia Pacific"
#   CORS_ORIGINS      default: empty (native apps are unaffected by CORS)
#   IP_HASH_PEPPER    default: generated once per run
#
# The image is built by Azure Container Registry, so Docker is not required.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RESOURCE_GROUP="${RESOURCE_GROUP:-shaikhs-prod}"
LOCATION="${LOCATION:-centralindia}"
PREFIX="${PREFIX:-shaikhs}"
ACS_DATA_LOCATION="${ACS_DATA_LOCATION:-Asia Pacific}"
CORS_ORIGINS="${CORS_ORIGINS:-}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v az >/dev/null 2>&1 || fail "Azure CLI (az) is not installed. See https://aka.ms/install-azure-cli"
az account show >/dev/null 2>&1 || fail "Not signed in. Run: az login"

[[ -n "${DB_ADMIN_PASSWORD:-}" ]] || fail "Set DB_ADMIN_PASSWORD, e.g. DB_ADMIN_PASSWORD='...' ./infra/deploy.sh"
[[ ${#DB_ADMIN_PASSWORD} -ge 12 ]] || fail "DB_ADMIN_PASSWORD must be at least 12 characters."

if [[ -z "${IP_HASH_PEPPER:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    IP_HASH_PEPPER="$(openssl rand -hex 32)"
  else
    IP_HASH_PEPPER="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  fi
fi

echo "Subscription: $(az account show --query name --output tsv)"
echo "Resource group: $RESOURCE_GROUP ($LOCATION)"
echo "Prefix: $PREFIX"
echo

az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

DEPLOYMENT_NAME="shaikhs-$(date -u +%Y%m%d%H%M%S)"

echo "Creating infrastructure (PostgreSQL, ACR, Container Apps, ACS Email)..."
echo "This takes 5-10 minutes; PostgreSQL provisioning dominates."

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --template-file "$REPO_ROOT/infra/main.bicep" \
  --parameters \
    location="$LOCATION" \
    namePrefix="$PREFIX" \
    dbAdminPassword="$DB_ADMIN_PASSWORD" \
    ipHashPepper="$IP_HASH_PEPPER" \
    acsDataLocation="$ACS_DATA_LOCATION" \
    corsOrigins="$CORS_ORIGINS" \
  --output none

read_output() {
  az deployment group show \
    --resource-group "$RESOURCE_GROUP" \
    --name "$DEPLOYMENT_NAME" \
    --query "properties.outputs.$1.value" \
    --output tsv
}

API_URL="$(read_output apiUrl)"
APP_NAME="$(read_output containerAppName)"
REGISTRY_NAME="$(read_output registryName)"
REGISTRY_LOGIN_SERVER="$(read_output registryLoginServer)"
POSTGRES_HOST="$(read_output postgresHost)"
POSTGRES_NAME="$(read_output postgresServerName)"
ACS_SENDER="$(read_output acsSenderAddress)"

echo
echo "Infrastructure ready."
echo "  API:        $API_URL"
echo "  PostgreSQL: $POSTGRES_HOST"
echo "  Sender:     $ACS_SENDER"
echo

TAG="shaikhs-api-$(date -u +%Y%m%d%H%M%S)"

echo "Building $TAG in Azure Container Registry (no local Docker needed)..."
az acr build \
  --registry "$REGISTRY_NAME" \
  --image "$TAG" \
  --file "$REPO_ROOT/apps/api/Dockerfile" \
  "$REPO_ROOT/apps/api" \
  --output none

echo "Rolling out the new image..."
az containerapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --image "$REGISTRY_LOGIN_SERVER/$TAG" \
  --output none

echo "Waiting for the API to answer /health (migrations run at startup)..."
HEALTH=""
for _ in $(seq 1 40); do
  if HEALTH="$(curl -fsS --max-time 5 "$API_URL/health" 2>/dev/null)"; then
    break
  fi
  sleep 6
done

if [[ -n "$HEALTH" ]]; then
  echo "$HEALTH"
  # GitHub Actions renders this block on the run's summary page, so the URL is
  # visible after a one-tap deploy without digging through the log.
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    {
      echo "## Shaikh's API deployed"
      echo
      echo "| | |"
      echo "| --- | --- |"
      echo "| **API URL** | \`$API_URL\` |"
      echo "| Resource group | \`$RESOURCE_GROUP\` |"
      echo "| Image | \`$TAG\` |"
      echo
      echo "Point the app at it: \`EXPO_PUBLIC_API_URL=$API_URL\`"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
else
  echo "The API did not answer within four minutes. Inspect the logs with:"
  echo "  az containerapp logs show -g $RESOURCE_GROUP -n $APP_NAME --tail 100"
fi

cat <<EOF

------------------------------------------------------------
Next steps
------------------------------------------------------------
1. Point the app at this API. In apps/mobile/.env:

     EXPO_PUBLIC_API_URL=$API_URL

   then restart with:  npx expo start -c

2. Set this in your notes — it is the value printed once:

     API URL:  $API_URL

3. Useful commands:

     az containerapp logs show -g $RESOURCE_GROUP -n $APP_NAME --follow
     az containerapp revision list -g $RESOURCE_GROUP -n $APP_NAME -o table
     az postgres flexible-server show -g $RESOURCE_GROUP -n $POSTGRES_NAME --query state

EOF
