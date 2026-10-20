// Shaikh's backend infrastructure.
//
// Creates, in one resource group:
//   • Azure Database for PostgreSQL Flexible Server (v16, Burstable B1ms) + database
//   • Azure Container Registry (Basic) for the API image
//   • Log Analytics + a Container Apps environment
//   • A Container App running the API with a system/user-assigned identity
//   • Azure Communication Services + an Azure-managed email domain for password resets
//
// Deploy (from the repository root):
//   az deployment group create \
//     --resource-group shaikhs-prod \
//     --template-file infra/main.bicep \
//     --parameters dbAdminPassword="$DB_ADMIN_PASSWORD" \
//                  ipHashPepper="$(openssl rand -hex 32)"
//
// The API image is built after the infrastructure exists (see docs/BACKEND.md);
// until then the Container App runs a placeholder image.

targetScope = 'resourceGroup'

@description('Azure region for regional resources. Pick one near your users, e.g. uksouth, westeurope, centralindia.')
param location string = resourceGroup().location

@minLength(3)
@maxLength(20)
@description('Short prefix for every resource name. Lowercase letters and digits.')
param namePrefix string = 'shaikhs'

@minLength(1)
@maxLength(32)
@description('PostgreSQL administrator login. Must not be a reserved name such as admin, administrator, or root.')
param dbAdminLogin string = 'shaikhsadmin'

@secure()
@minLength(12)
@description('PostgreSQL administrator password. At least 12 characters with three of: lowercase, uppercase, digits, symbols.')
param dbAdminPassword string

@secure()
@description('Secret mixed into stored IP hashes. Keep it stable across deployments; changing it only resets IP-hash continuity.')
param ipHashPepper string = newGuid()

@allowed([
  'United States'
  'Europe'
  'Asia Pacific'
  'Australia'
  'Brazil'
  'Canada'
  'France'
  'Germany'
  'India'
  'Japan'
  'Korea'
  'Norway'
  'Switzerland'
  'UK'
  'UAE'
  'South Africa'
])
@description('Where ACS stores email data at rest.')
param acsDataLocation string = 'Europe'

@description('Comma-separated browser origins for CORS. Empty means no browser origin is allowed (native apps are unaffected).')
param corsOrigins string = ''

@description('Container image for the API. The runbook replaces this after the first ACR build.')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Desired minimum replicas. 0 keeps idle cost near zero; 1 avoids a cold start on the first request.')
@minValue(0)
@maxValue(5)
param minReplicas int = 0

var suffix = uniqueString(resourceGroup().id)
var acrName = toLower('acr${namePrefix}${suffix}')
var logWorkspaceName = take('${namePrefix}-logs-${suffix}', 63)
var environmentName = take('${namePrefix}-env-${suffix}', 60)
var appName = take('${namePrefix}-api-${suffix}', 60)
var identityName = take('${namePrefix}-api-id', 128)
var postgresName = take('${namePrefix}-pg-${suffix}', 63)
var emailServiceName = take('${namePrefix}-email-${suffix}', 60)
var communicationName = take('${namePrefix}-acs-${suffix}', 60)
var databaseName = 'shaikhs'

var databaseUrl = 'postgres://${dbAdminLogin}:${uriComponent(dbAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

// ----------------------------------------------------------------- resources ---

resource logWorkspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: logWorkspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    policies: {
      retentionPolicy: {
        status: 'enabled'
        days: 7
      }
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2026-01-01-preview' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      // Private networking needs a delegated subnet and private DNS zone; the
      // firewall rule below plus TLS is the pragmatic single-app setup.
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2026-01-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// 0.0.0.0 within an Azure firewall rule means "allow services in Azure",
// including this Container App. It does not open the server to the internet.
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2026-01-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource acsEmail 'Microsoft.Communication/emailServices@2025-09-01' = {
  name: emailServiceName
  location: 'global'
  properties: {
    dataLocation: acsDataLocation
  }
}

// A Microsoft-managed domain: no DNS records to add, sends from
// DoNotReply@<random>.azurecomm.net. Swap for a custom domain once you own one.
resource acsDomain 'Microsoft.Communication/emailServices/domains@2025-09-01' = {
  parent: acsEmail
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
  }
}

resource communication 'Microsoft.Communication/communicationServices@2025-09-01' = {
  name: communicationName
  location: 'global'
  properties: {
    dataLocation: acsDataLocation
    linkedDomains: [
      acsDomain.id
    ]
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
}

resource environment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logWorkspace.properties.customerId
        sharedKey: logWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

// The Container App pulls the image from ACR with its user-assigned identity.
// This role assignment must exist before the app first pulls.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'AcrPull')
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource containerApp 'Microsoft.App/containerApps@2026-01-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: '${registry.name}.azurecr.io'
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'ip-hash-pepper'
          value: ipHashPepper
        }
        {
          name: 'acs-connection-string'
          value: communication.listKeys().primaryConnectionString
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'LOG_LEVEL'
              value: 'info'
            }
            {
              name: 'TRUST_PROXY'
              value: 'true'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'IP_HASH_PEPPER'
              secretRef: 'ip-hash-pepper'
            }
            {
              name: 'EMAIL_TRANSPORT'
              value: 'acs'
            }
            {
              name: 'ACS_CONNECTION_STRING'
              secretRef: 'acs-connection-string'
            }
            {
              name: 'ACS_SENDER_ADDRESS'
              value: 'DoNotReply@${acsDomain.properties.fromSenderDomain}'
            }
            {
              name: 'APP_PUBLIC_URL'
              value: 'shaikhs://reset-password'
            }
            {
              name: 'CORS_ORIGINS'
              value: corsOrigins
            }
            {
              name: 'RATE_LIMIT_AUTH_PER_MINUTE'
              value: '10'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            type: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: [
    acrPull
    database
    allowAzureServices
  ]
}

// ------------------------------------------------------------------- outputs ---

output apiUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output apiHost string = containerApp.properties.configuration.ingress.fqdn
output resourceGroupName string = resourceGroup().name
output containerAppName string = containerApp.name
output registryName string = registry.name
output registryLoginServer string = '${registry.name}.azurecr.io'
output postgresServerName string = postgres.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresDatabase string = databaseName
output acsSenderAddress string = 'DoNotReply@${acsDomain.properties.fromSenderDomain}'
output acsResourceName string = communication.name
