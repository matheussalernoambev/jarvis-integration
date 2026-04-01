# Guia de Setup AKS — Jarvis Automation

Passo-a-passo completo para provisionar toda a infraestrutura Azure necessaria para o deploy do Jarvis Automation.

## Pre-requisitos

- Azure CLI (`az`) instalado e autenticado
- `kubectl` instalado
- `helm` v3 instalado
- Subscription Azure com permissoes de Owner ou Contributor
- Um dominio DNS (ex: `jarvis.company.com`)

```bash
# Login na Azure
az login

# Selecionar subscription
az account set --subscription "<SUBSCRIPTION_ID>"
```

---

## Passo 1: Definir Variaveis

```bash
# ─── Configuracao geral ─────────────────────────────────────────────
export RESOURCE_GROUP="rg-jarvis-automation"
export LOCATION="eastus"                          # ou brazilsouth
export AKS_CLUSTER="aks-jarvis"
export ACR_NAME="acrjarvis"                       # deve ser globalmente unico
export KEYVAULT_NAME="kv-jarvis"                  # deve ser globalmente unico
export PG_SERVER="pg-jarvis"                      # deve ser globalmente unico
export PG_ADMIN_USER="jarvisadmin"
export PG_ADMIN_PASSWORD="$(openssl rand -base64 24)"
export PG_DB_NAME="jarvis"
export APIM_NAME="apim-jarvis"
export APP_HOST="jarvis.company.com"
export MANAGED_IDENTITY="id-jarvis-workload"
```

---

## Passo 2: Criar Resource Group

```bash
az group create \
  --name $RESOURCE_GROUP \
  --location $LOCATION
```

---

## Passo 3: Criar Azure Container Registry (ACR)

```bash
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Standard \
  --admin-enabled false
```

---

## Passo 4: Criar AKS Cluster

```bash
# Criar cluster com Workload Identity + OIDC Issuer habilitados
az aks create \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_CLUSTER \
  --location $LOCATION \
  --node-count 2 \
  --node-vm-size Standard_B2s \
  --enable-managed-identity \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --attach-acr $ACR_NAME \
  --network-plugin azure \
  --network-policy calico \
  --generate-ssh-keys \
  --tier free

# Obter credenciais do cluster
az aks get-credentials \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_CLUSTER

# Verificar conexao
kubectl get nodes
```

### Habilitar auto-scaling (opcional)

```bash
az aks nodepool update \
  --resource-group $RESOURCE_GROUP \
  --cluster-name $AKS_CLUSTER \
  --name nodepool1 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 5
```

---

## Passo 5: Criar Azure Key Vault

```bash
az keyvault create \
  --resource-group $RESOURCE_GROUP \
  --name $KEYVAULT_NAME \
  --location $LOCATION \
  --enable-rbac-authorization true

# Guardar o URI
export KEYVAULT_URL="https://${KEYVAULT_NAME}.vault.azure.net/"
echo "Key Vault URL: $KEYVAULT_URL"
```

---

## Passo 6: Criar Azure Database for PostgreSQL Flexible Server

```bash
# Criar servidor PostgreSQL
az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $PG_SERVER \
  --location $LOCATION \
  --admin-user $PG_ADMIN_USER \
  --admin-password "$PG_ADMIN_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0

# Criar database
az postgres flexible-server db create \
  --resource-group $RESOURCE_GROUP \
  --server-name $PG_SERVER \
  --database-name $PG_DB_NAME

# Configurar firewall para permitir acesso do AKS
# (Em producao, usar Private Endpoint ou VNet Integration)
AKS_OUTBOUND_IP=$(az aks show \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_CLUSTER \
  --query "networkProfile.loadBalancerProfile.effectiveOutboundIPs[0].id" -o tsv \
  | xargs az network public-ip show --ids --query ipAddress -o tsv)

az postgres flexible-server firewall-rule create \
  --resource-group $RESOURCE_GROUP \
  --name $PG_SERVER \
  --rule-name AllowAKS \
  --start-ip-address $AKS_OUTBOUND_IP \
  --end-ip-address $AKS_OUTBOUND_IP

# Montar connection string
export DATABASE_URL="postgresql+asyncpg://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB_NAME}?ssl=require"

echo "Database URL: $DATABASE_URL"
echo "IMPORTANTE: Guarde a senha - $PG_ADMIN_PASSWORD"
```

---

## Passo 7: Configurar Workload Identity (AKS <-> Key Vault)

```bash
# Obter OIDC Issuer URL do AKS
export AKS_OIDC_ISSUER=$(az aks show \
  --resource-group $RESOURCE_GROUP \
  --name $AKS_CLUSTER \
  --query "oidcIssuerProfile.issuerUrl" -o tsv)

# Criar User-Assigned Managed Identity
az identity create \
  --resource-group $RESOURCE_GROUP \
  --name $MANAGED_IDENTITY \
  --location $LOCATION

export IDENTITY_CLIENT_ID=$(az identity show \
  --resource-group $RESOURCE_GROUP \
  --name $MANAGED_IDENTITY \
  --query clientId -o tsv)

export IDENTITY_PRINCIPAL_ID=$(az identity show \
  --resource-group $RESOURCE_GROUP \
  --name $MANAGED_IDENTITY \
  --query principalId -o tsv)

# Dar acesso ao Key Vault (RBAC)
export KEYVAULT_ID=$(az keyvault show \
  --resource-group $RESOURCE_GROUP \
  --name $KEYVAULT_NAME \
  --query id -o tsv)

az role assignment create \
  --assignee-object-id $IDENTITY_PRINCIPAL_ID \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets Officer" \
  --scope $KEYVAULT_ID

# Criar Federated Credential (conecta a Managed Identity ao Service Account do K8s)
az identity federated-credential create \
  --name jarvis-federated-cred \
  --identity-name $MANAGED_IDENTITY \
  --resource-group $RESOURCE_GROUP \
  --issuer $AKS_OIDC_ISSUER \
  --subject system:serviceaccount:jarvis:jarvis-sa \
  --audience api://AzureADTokenExchange
```

---

## Passo 8: Instalar Nginx Ingress Controller no AKS

```bash
# Adicionar repo do ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Instalar
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2 \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz

# Obter IP externo do Load Balancer (pode levar 1-2 min)
echo "Aguardando IP externo..."
kubectl get svc ingress-nginx-controller -n ingress-nginx -w
```

### Configurar DNS

Apontar o dominio (`jarvis.company.com`) para o IP externo do Load Balancer:

```
A Record: jarvis.company.com -> <EXTERNAL-IP>
```

---

## Passo 9: Instalar cert-manager (TLS automatico)

```bash
# Instalar cert-manager
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true

# Criar ClusterIssuer para Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@company.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

---

## Passo 10: Criar Kubernetes Secrets

```bash
# Secret do banco de dados
kubectl create namespace jarvis

kubectl create secret generic jarvis-db-secret \
  --namespace jarvis \
  --from-literal=DATABASE_URL="$DATABASE_URL"

# Secret do Keycloak (se usar client_secret)
kubectl create secret generic jarvis-keycloak-secret \
  --namespace jarvis \
  --from-literal=KEYCLOAK_CLIENT_SECRET="<SEU_CLIENT_SECRET>"
```

---

## Passo 11: Configurar APIM (Opcional)

```bash
# Criar Azure API Management (Developer tier para dev/test)
az apim create \
  --resource-group $RESOURCE_GROUP \
  --name $APIM_NAME \
  --publisher-name "$PUBLISHER_NAME" \
  --publisher-email "$PUBLISHER_EMAIL" \
  --sku-name Developer \
  --location $LOCATION

# NOTA: APIM pode levar 30-45 min para provisionar no tier Developer.
# Para producao, usar tier Standard ou Premium.

# Configurar VNet integration (opcional, para APIM acessar AKS via rede interna)
# az apim update --name $APIM_NAME --resource-group $RESOURCE_GROUP --virtual-network External
```

### Importar API no APIM

Apos o APIM estar pronto:

1. No portal Azure, abra o recurso APIM
2. Va em **APIs** > **Add API** > **OpenAPI**
3. Importe a URL: `https://jarvis.company.com/docs/openapi.json`
4. Aplique a policy do arquivo `apim/api-policy.xml`

---

## Passo 12: Configurar GitHub Actions (CI/CD)

### Criar App Registration para OIDC

```bash
# Criar App Registration
export APP_REG_NAME="github-jarvis-cicd"
az ad app create --display-name $APP_REG_NAME

export APP_ID=$(az ad app list --display-name $APP_REG_NAME --query "[0].appId" -o tsv)

# Criar Service Principal
az ad sp create --id $APP_ID

export SP_OBJECT_ID=$(az ad sp show --id $APP_ID --query id -o tsv)

# Dar acesso ao Resource Group
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/$RESOURCE_GROUP"

# Dar acesso ao ACR (push images)
export ACR_ID=$(az acr show --name $ACR_NAME --query id -o tsv)
az role assignment create \
  --assignee-object-id $SP_OBJECT_ID \
  --assignee-principal-type ServicePrincipal \
  --role AcrPush \
  --scope $ACR_ID

# Criar Federated Credential para GitHub Actions
az ad app federated-credential create --id $APP_ID --parameters '{
  "name": "github-main-branch",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<GITHUB_ORG>/jarvis-automation:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Anotar estes valores para configurar no GitHub:
echo "AZURE_CLIENT_ID: $APP_ID"
echo "AZURE_TENANT_ID: $(az account show --query tenantId -o tsv)"
echo "AZURE_SUBSCRIPTION_ID: $(az account show --query id -o tsv)"
```

### Configurar GitHub Repository

No repositorio GitHub, va em **Settings** > **Secrets and variables** > **Actions**:

**Secrets:**
| Nome | Valor |
|------|-------|
| `AZURE_CLIENT_ID` | App Registration Client ID |
| `AZURE_TENANT_ID` | Azure Tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |

**Variables:**
| Nome | Valor |
|------|-------|
| `ACR_NAME` | `acrjarvis` |
| `AKS_CLUSTER` | `aks-jarvis` |
| `AKS_RESOURCE_GROUP` | `rg-jarvis-automation` |
| `APP_HOST` | `jarvis.company.com` |
| `KEYVAULT_URL` | `https://kv-jarvis.vault.azure.net/` |
| `KEYCLOAK_URL` | URL do seu Keycloak |
| `KEYCLOAK_REALM` | `jarvis` |
| `KEYCLOAK_CLIENT_ID` | `jarvis-automation` |
| `WORKLOAD_IDENTITY_CLIENT_ID` | Managed Identity Client ID |

---

## Passo 13: Primeiro Deploy

```bash
# Build das imagens (primeira vez, manualmente)
az acr build \
  --registry $ACR_NAME \
  --image jarvis-backend:initial \
  --file deploy/containerfiles/backend.containerfile \
  ./backend

az acr build \
  --registry $ACR_NAME \
  --image jarvis-frontend:initial \
  --file deploy/containerfiles/frontend.containerfile \
  --build-arg VITE_API_URL=/api \
  .

# Deploy via Helm
helm upgrade --install jarvis-automation ./helm/jarvis-automation \
  --namespace jarvis \
  --create-namespace \
  --set image.registry=${ACR_NAME}.azurecr.io \
  --set image.backend.tag=initial \
  --set image.frontend.tag=initial \
  --set host=$APP_HOST \
  --set keyvault.url=$KEYVAULT_URL \
  --set keycloak.url=<KEYCLOAK_URL> \
  --set keycloak.realm=jarvis \
  --set keycloak.clientId=jarvis-automation \
  --set workloadIdentity.clientId=$IDENTITY_CLIENT_ID \
  --wait --timeout 5m

# Verificar deploy
kubectl get pods -n jarvis
kubectl get ingress -n jarvis
```

---

## Passo 14: Configurar Keycloak

### Criar Realm e Client

No Keycloak:

1. **Criar Realm** chamado `jarvis`
2. **Criar Client**:
   - Client ID: `jarvis-automation`
   - Client Protocol: `openid-connect`
   - Root URL: `https://jarvis.company.com`
   - Valid Redirect URIs: `https://jarvis.company.com/*`
   - Web Origins: `https://jarvis.company.com`
3. **Criar Realm Roles**: `admin`, `operator`, `viewer`
4. **Criar Users** e atribuir roles

---

## Resumo dos Recursos Criados

| Recurso | Nome | Tipo |
|---------|------|------|
| Resource Group | `rg-jarvis-automation` | Container |
| AKS Cluster | `aks-jarvis` | Kubernetes |
| Container Registry | `acrjarvis` | ACR |
| Key Vault | `kv-jarvis` | Secrets |
| PostgreSQL | `pg-jarvis` | Database PaaS |
| APIM | `apim-jarvis` | API Gateway |
| Managed Identity | `id-jarvis-workload` | Workload Identity |
| App Registration | `github-jarvis-cicd` | CI/CD OIDC |

## Custos Estimados (por mes)

| Recurso | SKU | Estimativa |
|---------|-----|-----------|
| AKS (2x B2s) | Free tier | ~$60 |
| PostgreSQL | B1ms Burstable | ~$15 |
| ACR | Standard | ~$5 |
| Key Vault | Standard | ~$1 |
| APIM | Developer | ~$50 (prod: ~$300) |
| Ingress LB | Standard | ~$20 |
| **Total** | | **~$150/mes** |
