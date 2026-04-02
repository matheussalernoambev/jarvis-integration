# Jarvis Automation

Sistema de automacao corporativa para gerenciamento de maquinas virtuais Azure com integracao BeyondTrust Password Safe, analise inteligente de falhas via Anthropic Claude e criacao automatica de cards Azure DevOps.

---

## Stack Tecnologica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui + Recharts |
| Backend | FastAPI (Python 3.12) + SQLAlchemy 2.0 async + Alembic |
| Banco de Dados | Azure PostgreSQL Flexible Server (asyncpg) |
| Autenticacao | Keycloak OIDC (PKCE flow) |
| Secrets | Azure Key Vault (via Workload Identity) |
| API Gateway | Azure API Management (APIM) — opcional |
| Infraestrutura | AKS (Kubernetes) + ACR (Container Registry) + Helm |
| AI/ML | Anthropic Claude API (analise de falhas + few-shot learning) |
| CI/CD | GitHub Actions + ACR Build Tasks |

---

## Pre-requisitos para Implementacao

### Recursos Azure Obrigatorios

| Recurso | Finalidade | SKU Recomendado |
|---------|-----------|-----------------|
| **AKS** (Azure Kubernetes Service) | Cluster Kubernetes para deploy | Standard_D2s_v3 (2 nodes) |
| **ACR** (Azure Container Registry) | Registro de imagens Docker | Basic |
| **Azure PostgreSQL Flexible Server** | Banco de dados relacional | Burstable B1ms |
| **Azure Key Vault** | Armazenamento de segredos (API keys, PATs) | Standard |
| **Managed Identity** | Identidade para Workload Identity no AKS | User-assigned |
| **Public IP + DNS** | Acesso externo ao Ingress | Static IP |

### Recursos Azure Opcionais

| Recurso | Finalidade |
|---------|-----------|
| **Azure API Management** | Gateway de API com rate limiting e analytics |
| **Azure Monitor / Log Analytics** | Observabilidade e metricas |

### Servicos Externos Obrigatorios

| Servico | Finalidade | Configuracao |
|---------|-----------|-------------|
| **Keycloak** | Autenticacao OIDC | Realm `jarvis`, Client `jarvis-automation` (PKCE) |
| **BeyondTrust Password Safe** | Gerenciamento de credenciais | API v3, Functional Account com permissoes |
| **Azure DevOps** | Criacao de work items | Organization URL + PAT token + Project |
| **Anthropic API** | Analise inteligente de falhas | API Key com acesso a Claude (claude-sonnet-4-20250514 recomendado) |

### Ferramentas de Desenvolvimento

| Ferramenta | Versao Minima |
|-----------|--------------|
| Python | 3.12+ |
| Node.js | 20+ |
| Azure CLI (`az`) | 2.60+ |
| Helm | 3.14+ |
| kubectl | 1.28+ |
| Git | 2.40+ |

---

## Arquitetura

```
                         Internet
                            │
                            ▼
                    ┌───────────────┐
                    │   Ingress     │
                    │   (nginx)     │
                    └──────┬────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
     ┌────────────────┐       ┌────────────────┐
     │   Frontend      │       │   Backend       │
     │   React SPA     │──────▶│   FastAPI       │
     │   (Nginx)       │ /api/ │   (4 workers)   │
     └────────────────┘       └───┬──┬──┬──┬────┘
                                  │  │  │  │
              ┌───────────────────┘  │  │  └──────────────────┐
              ▼                      ▼  ▼                     ▼
     ┌────────────────┐   ┌──────────┐ ┌──────────────┐  ┌──────────┐
     │  PostgreSQL     │   │Key Vault │ │  BeyondTrust │  │ Keycloak │
     │  Flex Server    │   │ (secrets)│ │  Password    │  │  (OIDC)  │
     └────────────────┘   └──────────┘ │  Safe API    │  └──────────┘
                                       └──────────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                   ▼                   ▼
                 ┌────────────────┐  ┌────────────────┐  ┌───────────────┐
                 │  Anthropic     │  │  Azure DevOps  │  │  Azure ARM    │
                 │  Claude API    │  │  REST API      │  │  (VM mgmt)    │
                 └────────────────┘  └────────────────┘  └───────────────┘

    ┌────────────────────────────────────────────────────────────────┐
    │                    K8s CronJobs (4)                            │
    │  sync-cron (15min) │ onboarding (15min) │ analyze (daily 6AM) │
    │  reminders (15min)                                             │
    └────────────────────────────────────────────────────────────────┘
```

---

## Estrutura do Projeto

```
jarvis-automation/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app + router mounting
│   │   ├── config.py                # Pydantic Settings (.env)
│   │   ├── database.py              # SQLAlchemy async engine + session
│   │   ├── models/                  # ORM models (17 arquivos)
│   │   ├── routers/                 # API endpoints (13 routers)
│   │   ├── services/                # Business logic (14 services)
│   │   ├── schemas/                 # Pydantic schemas
│   │   └── utils/                   # Helpers
│   ├── alembic/
│   │   ├── env.py                   # Alembic async config
│   │   └── versions/               # 4 migration files
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # Rotas + providers
│   │   ├── main.tsx                 # Entry point
│   │   ├── pages/                   # 10 paginas + 6 sub-paginas settings
│   │   ├── components/              # 40+ componentes organizados
│   │   ├── hooks/                   # Custom hooks (auth, responsive, etc.)
│   │   ├── contexts/                # React contexts (auth, password-safe)
│   │   ├── lib/                     # Utils, API client, permissions
│   │   └── i18n/                    # pt-BR + en-US
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── deploy/
│   ├── containerfiles/
│   │   ├── backend.containerfile    # Python 3.12-slim + uvicorn
│   │   └── frontend.containerfile   # Node 20 build + Nginx 1.27
│   └── nginx/
│       └── default.conf             # Reverse proxy /api/ + SPA fallback
├── helm/
│   └── jarvis-automation/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/               # 8 templates K8s
├── apim/                            # APIM policies (opcional)
├── docs/
│   └── aks-setup-guide.md
├── .github/workflows/               # CI/CD pipelines
├── .env.example
└── README.md
```

---

## Modulos e Funcionalidades

### 1. Gerenciamento de Zonas

Zonas sao unidades administrativas que segregam VMs, credenciais, configuracoes e permissoes. Cada zona possui:
- Configuracao Azure (subscriptions, resource groups)
- Configuracao BeyondTrust (API URL, Functional Account)
- Configuracao AI (Anthropic model, DevOps project, platform owners)
- Agendamentos de sync e onboarding
- Permissoes por usuario (admin/operator/viewer por zona)

### 2. Sincronizacao de VMs Azure

- Busca VMs de todas as subscriptions configuradas via Azure ARM API
- Detecta power state (running/stopped/deallocated)
- Resolve domain status (via tags, Graph API ou Run Command)
- Armazena IP, NIC, OS type, resource group
- CronJob: a cada 15 minutos

### 3. Onboarding BeyondTrust

- Onboarding automatico de VMs no BeyondTrust Password Safe
- Cria Managed System + Managed Account
- Aplica Quick Rules (regras de troca de senha)
- Processamento em batch com controle de concorrencia
- Templates configuráveis para descricao de sistemas
- CronJob: a cada 15 minutos

### 4. Password Safe — Monitoramento de Falhas

- Importacao de falhas de rotacao de senha (CSV ou API)
- Enriquecimento com dados da API BeyondTrust (host, IP, DN, change state)
- Dashboards: KPIs globais, breakdown por zona, plataforma, workgroup
- Drilldown interativo por zona com graficos
- Snapshots para calcular delta (resolved/new)
- Export CSV

### 5. Analise Inteligente de Falhas (AI Pipeline)

Fluxo completo automatizado:

```
Falhas agrupadas por managed_system_id
    │
    ▼
Teste de credencial via BeyondTrust API
(POST ManagedAccounts/{id}/Credentials/Change)
    │
    ├── Sucesso (204) → Pula sistema (sem card necessario)
    │
    └── Falha → Envia erro para Anthropic Claude
                    │
                    ▼
              Analise estruturada JSON:
              - category (12 categorias possiveis)
              - diagnosis (explicacao tecnica)
              - suggested_action (acao recomendada)
              - platform_type (Windows/Linux/AD/etc.)
              - confidence (0.0 - 1.0)
              - card_title + card_description (HTML)
                    │
                    ▼
              Busca platform owner por zona
                    │
                    ▼
              Cria Work Item no Azure DevOps
              (atribuido ao owner, linked a Feature/Epic)
                    │
                    ▼
              Salva card + analysis no banco
              + audit log
```

**Categorias de Falha:**
| Categoria | Descricao |
|-----------|-----------|
| `account_not_found` | Conta nao existe no sistema alvo |
| `access_denied` | Permissao negada |
| `network_unreachable` | Sistema inacessivel (rede/DNS/firewall) |
| `authentication_failed` | Functional Account nao autentica |
| `password_policy` | Senha nao atende politica |
| `account_locked` | Conta travada/bloqueada |
| `service_dependency` | Servico dependente impede troca |
| `timeout` | Timeout na operacao |
| `certificate_error` | Erro SSL/TLS |
| `configuration_error` | Configuracao incorreta no BT |
| `unknown` | Nao classificavel |

**Deduplicacao:**
- Cards com status aberto (created/synced/pending_retry/error) nao geram novo card
- Cards criados nos ultimos 7 dias nao geram novo card para o mesmo sistema

### 6. Feedback Loop (Few-Shot Learning)

Pipeline de aprendizado continuo:

```
Operador revisa analise AI
    │
    ├── Thumbs Up (correto) → Converte em few-shot example
    │                           → Salva em few_shot_examples
    │                           → Futuras analises da zona usam como exemplo
    │
    └── Thumbs Down (incorreto) → Registra nota de correcao
                                  → Audit log
```

- Exemplos few-shot sao zone-specific (cada zona aprende independente)
- Ate 20 exemplos carregados por zona (ordenados por confidence)
- Melhora progressivamente a precisao da AI para cada zona

### 7. Lembretes Recorrentes

- CRUD de lembretes com recorrencia (once/daily/weekly/monthly)
- Cria Work Items no Azure DevOps automaticamente quando vence
- Avanca next_run_at conforme recorrencia
- CronJob: a cada 15 minutos

### 8. Audit Trail

Registro automatico de acoes criticas:
- `card_created` / `card_creation_failed`
- `feedback_submitted`
- `analysis_completed`
- `reminder_triggered`

---

## API Endpoints

### Auth (`/api/auth`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/login` | Login via Keycloak OIDC |
| POST | `/callback` | Callback OAuth/PKCE |
| GET | `/me` | Dados do usuario autenticado |

### Health (`/api/health`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Health check |
| GET | `/outbound-ip` | IP de saida do pod (debug) |

### Zones (`/api/zones`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Listar zonas |
| POST | `/` | Criar zona |
| PUT | `/{id}` | Atualizar zona |
| DELETE | `/{id}` | Remover zona |

### Azure VMs (`/api/azure`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/vms` | Listar VMs com filtros |
| POST | `/sync` | Sincronizar VMs de uma zona |
| POST | `/sync-cron` | Sync de todas as zonas (CronJob) |
| GET | `/vms/{id}/domain-status` | Verificar domain join |

### BeyondTrust (`/api/beyondtrust`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/workgroups` | Listar workgroups |
| GET | `/platforms` | Listar plataformas |
| GET | `/quick-rules` | Listar quick rules |
| GET | `/smart-rules` | Listar smart rules |
| GET | `/password-policies` | Listar politicas de senha |
| GET | `/functional-accounts` | Listar functional accounts |
| POST | `/sync-cache` | Atualizar cache local |

### Onboarding (`/api/onboarding`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/start` | Iniciar onboarding de VMs |
| POST | `/cron` | Onboarding automatico (CronJob) |
| GET | `/logs` | Historico de onboarding |
| GET | `/rules` | Regras de onboarding por zona |
| POST | `/rules` | Criar regra |
| PUT | `/rules/{id}` | Atualizar regra |
| DELETE | `/rules/{id}` | Remover regra |

### Password Failures (`/api/password-failures`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Listar falhas (com filtros) |
| POST | `/import` | Importar falhas via CSV |
| GET | `/snapshots` | Snapshots para calculo de delta |
| GET | `/stats` | Estatisticas agregadas |

### DevOps Cards (`/api/devops-cards`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Listar cards |
| GET | `/stats` | Estatisticas por status |
| POST | `/{card_id}/retry` | Reprocessar card com erro |
| POST | `/analyze/{zone_id}` | Trigger analise AI (dry_run opcional) |
| POST | `/analyze-cron` | Analise automatica de todas as zonas (CronJob) |
| GET | `/analyses` | Listar analises AI |
| GET | `/analyses/stats` | Estatisticas de analises + feedback accuracy |
| POST | `/analyses/{id}/feedback` | Submeter feedback (thumbs up/down) |
| GET | `/few-shot-stats` | Estatisticas de few-shot examples |
| GET | `/audit-log` | Historico de auditoria |

### Zone AI Config (`/api/zone-ai-config`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/{zone_id}` | Configuracao AI da zona |
| PUT | `/{zone_id}` | Salvar configuracao AI |
| POST | `/{zone_id}/test-anthropic` | Testar conexao Anthropic |
| POST | `/{zone_id}/test-devops` | Testar conexao DevOps |

### Platform Owners (`/api/platform-owners`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Listar owners por zona |
| POST | `/` | Criar owner |
| PUT | `/{id}` | Atualizar owner |
| DELETE | `/{id}` | Remover owner |

### Scheduled Reminders (`/api/scheduled-reminders`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/` | Listar lembretes |
| POST | `/` | Criar lembrete |
| PUT | `/{id}` | Atualizar |
| DELETE | `/{id}` | Remover |
| POST | `/process-cron` | Processar lembretes vencidos (CronJob) |

### Credentials (`/api/credentials`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/{key}` | Buscar segredo |
| PUT | `/{key}` | Salvar segredo |

### Dashboard (`/api/dashboard`)
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/stats` | Estatisticas agregadas para dashboard |

---

## Banco de Dados

### Tabelas Principais

| Tabela | Descricao | Chaves |
|--------|-----------|--------|
| `zones` | Zonas administrativas | PK: id (UUID) |
| `virtual_machines` | VMs Azure sincronizadas | PK: id, FK: zone_id |
| `password_failures` | Falhas de rotacao de senha | PK: id, FK: zone_id |
| `user_roles` | Roles globais (admin/operator/viewer) | PK: id |
| `user_zone_roles` | Permissoes por zona | PK: id, FK: zone_id |
| `devops_cards` | Cards Azure DevOps criados | PK: id, FK: zone_id |
| `credential_failure_analyses` | Resultados de analise AI | PK: id, FK: zone_id, password_failure_id |
| `zone_ai_configs` | Config AI por zona | PK: zone_id |
| `platform_owners` | Donos de plataforma por zona | PK: id, FK: zone_id |
| `scheduled_reminders` | Lembretes recorrentes | PK: id, FK: zone_id |
| `few_shot_examples` | Exemplos few-shot por zona | PK: id, FK: zone_id, analysis_id (unique) |
| `audit_logs` | Trilha de auditoria | PK: id, FK: zone_id |
| `app_secrets` | Segredos locais (fallback) | PK: id |
| `onboarding_logs` | Log de onboarding | PK: id |
| `onboarding_rules` | Regras de onboarding | PK: id, FK: zone_id |
| `onboarding_settings` | Config de onboarding | PK: id, FK: zone_id |
| `automation_configs` | Configuracoes globais | PK: id |
| `zone_azure_config` | Config Azure por zona | PK: id, FK: zone_id |
| `zone_schedule` | Agendamentos por zona | PK: id, FK: zone_id |
| `zone_sso_config` | Config SSO por zona | PK: id, FK: zone_id |
| `sync_history` | Historico de sincronizacao | PK: id |
| `sync_progress` | Progresso de sync ativo | PK: id |

### Cache BeyondTrust

| Tabela | Conteudo |
|--------|---------|
| `bt_workgroups` | Workgroups |
| `bt_platforms` | Plataformas |
| `bt_quick_rules` | Quick Rules |
| `bt_smart_rules` | Smart Rules |
| `bt_password_policies` | Politicas de senha |
| `bt_functional_accounts` | Functional Accounts |

### Migrations

```bash
# Dentro do pod backend ou localmente
cd backend
python -m alembic upgrade head
```

| Migration | Descricao |
|-----------|-----------|
| `001_initial_schema` | Schema inicial (zonas, VMs, failures, users, onboarding, settings) |
| `002_managed_accounts_enrichment` | Colunas de enriquecimento em password_failures + indexes |
| `003_ai_devops_integration` | zone_ai_configs, platform_owners, devops_cards, analyses, maintenance |
| `004_feedback_pipeline` | few_shot_examples, audit_logs + indexes |

---

## Frontend — Paginas

| Pagina | Rota | Permissao | Descricao |
|--------|------|-----------|-----------|
| Dashboard | `/` | Todos | KPIs globais, status de VMs, falhas, onboarding |
| Virtual Machines | `/vms` | admin, operator | Lista de VMs Azure, trigger de onboarding |
| Password Safe | `/password-safe` | Todos | Dashboard gerencial com KPIs, zone cards, drilldown, graficos |
| Password Failures | `/password-failures` | Todos | Tabela detalhada de falhas com filtros e export |
| DevOps Cards | `/devops-cards` | admin, operator | Cards criados, analises AI, feedback, lembretes |
| Settings | `/settings/...` | Varia | Configuracoes do sistema |
| - BeyondTrust Integrations | `/settings/integrations/beyondtrust` | admin, operator | API keys BeyondTrust |
| - Microsoft Integrations | `/settings/integrations/microsoft` | admin | SSO Microsoft/Azure AD |
| - BeyondTrust Explorer | `/settings/beyondtrust` | admin | Explorer da API BeyondTrust |
| - Schedules | `/settings/schedules` | admin | Agendamentos e lembretes |
| - Import Password Failures | `/settings/import-password-failures` | admin | Importacao CSV |
| - AI Configuration | `/settings/ai-configuration` | admin | Config Anthropic + DevOps por zona |

### Internacionalizacao (i18n)

Suporte completo para:
- **pt-BR** (Portugues Brasil) — idioma padrao
- **en-US** (Ingles)

Seletor de idioma disponivel no header. Todas as labels, mensagens e tooltips sao traduzidos.

---

## CronJobs Kubernetes

| CronJob | Schedule | Timeout | Endpoint | Descricao |
|---------|----------|---------|----------|-----------|
| `jarvis-sync-cron` | `*/15 * * * *` | 10 min | `POST /api/azure/sync-cron` | Sincroniza VMs Azure de todas as zonas |
| `jarvis-onboarding-cron` | `*/15 * * * *` | 15 min | `POST /api/onboarding/cron` | Processa onboarding pendente |
| `jarvis-analyze-cron` | `0 6 * * *` | 30 min | `POST /api/devops-cards/analyze-cron` | Analisa falhas AI + cria cards DevOps |
| `jarvis-reminders-cron` | `*/15 * * * *` | 5 min | `POST /api/scheduled-reminders/process-cron` | Processa lembretes vencidos |

Todos usam `curlimages/curl` como sidecar container que faz HTTP POST no backend service interno. Pattern escolhido para ser safe com multiplas replicas (sem APScheduler in-process).

---

## Desenvolvimento Local

### Backend

```bash
cd backend

# Criar virtualenv
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variaveis de ambiente
cp ../.env.example ../.env
# Editar .env com seus valores

# Rodar migrations
python -m alembic upgrade head

# Iniciar servidor
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Docs: http://localhost:8000/docs
# ReDoc: http://localhost:8000/redoc
```

### Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar dev server
npm run dev
# Acesse: http://localhost:8080

# Build de producao
npm run build
```

### Variaveis de Ambiente (.env)

```env
# Database (Azure PostgreSQL Flexible Server)
DATABASE_URL=postgresql+asyncpg://jarvisadmin:PASSWORD@host:5432/jarvis?ssl=require

# Server
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000

# Azure Key Vault (obrigatorio em producao)
AZURE_KEYVAULT_URL=https://jarvis-kv.vault.azure.net/

# Keycloak OIDC (obrigatorio)
KEYCLOAK_URL=https://keycloak.company.com
KEYCLOAK_REALM=jarvis
KEYCLOAK_CLIENT_ID=jarvis-automation
KEYCLOAK_CLIENT_SECRET=<secret>

# Proxy HTTP/1.1 para BeyondTrust Cloud (opcional)
HTTP11_PROXY_URL=
```

### Dependencias Python

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlalchemy[asyncio]>=2.0
asyncpg>=0.30.0
pydantic-settings>=2.0
alembic>=1.14
httpx>=0.28.0
python-multipart>=0.0.12
cryptography>=44.0
azure-identity>=1.19.0
azure-keyvault-secrets>=4.9.0
python-jose[cryptography]>=3.3.0
```

---

## Deploy em AKS

### 1. Preparacao de Infraestrutura Azure

```bash
# Variaveis
RG="rg-jarvis-prd"
LOCATION="brazilsouth"
AKS_NAME="aks-jarvis-prd"
ACR_NAME="acrjarvisprd"
PG_SERVER="pg-jarvis-prd"
KV_NAME="kv-jarvis-prd"

# Resource Group
az group create --name $RG --location $LOCATION

# ACR
az acr create --resource-group $RG --name $ACR_NAME --sku Basic

# AKS com Workload Identity
az aks create \
  --resource-group $RG \
  --name $AKS_NAME \
  --enable-oidc-issuer \
  --enable-workload-identity \
  --attach-acr $ACR_NAME \
  --node-count 2 \
  --node-vm-size Standard_D2s_v3

# PostgreSQL
az postgres flexible-server create \
  --resource-group $RG \
  --name $PG_SERVER \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --admin-user jarvisadmin \
  --admin-password 'CHANGE_ME' \
  --database-name jarvis \
  --public-access 0.0.0.0

# Key Vault
az keyvault create \
  --resource-group $RG \
  --name $KV_NAME \
  --location $LOCATION
```

### 2. Build de Imagens (ACR Build — sem Docker local)

```bash
# Backend
az acr build --registry $ACR_NAME \
  --image jarvis-backend:latest \
  --file deploy/containerfiles/backend.containerfile .

# Frontend
az acr build --registry $ACR_NAME \
  --image jarvis-frontend:latest \
  --file deploy/containerfiles/frontend.containerfile \
  --build-arg VITE_API_URL=/api .
```

### 3. Configurar Secrets no Kubernetes

```bash
# Database secret
kubectl create secret generic jarvis-db-secret \
  --namespace jarvis \
  --from-literal=DATABASE_URL="postgresql+asyncpg://jarvisadmin:PASSWORD@$PG_SERVER.postgres.database.azure.com:5432/jarvis?ssl=require"

# Keycloak secret
kubectl create secret generic jarvis-keycloak-secret \
  --namespace jarvis \
  --from-literal=KEYCLOAK_CLIENT_SECRET="<your-secret>"
```

### 4. Deploy via Helm

```bash
helm upgrade --install jarvis-automation ./helm/jarvis-automation \
  --namespace jarvis --create-namespace \
  --set image.registry=$ACR_NAME.azurecr.io \
  --set host=jarvis.yourdomain.com \
  --set database.host=$PG_SERVER.postgres.database.azure.com \
  --set keyvault.url=https://$KV_NAME.vault.azure.net/ \
  --set keycloak.url=https://keycloak.yourdomain.com \
  --set workloadIdentity.clientId=<MANAGED_IDENTITY_CLIENT_ID> \
  --wait --timeout 5m
```

### 5. Verificar Deploy

```bash
# Status dos pods
kubectl get pods -n jarvis

# Logs do backend
kubectl logs -n jarvis -l app=jarvis-backend --tail=50

# Port-forward para teste local
kubectl port-forward -n jarvis svc/jarvis-backend 8099:8000
kubectl port-forward -n jarvis svc/jarvis-frontend 8080:80

# CronJobs
kubectl get cronjobs -n jarvis
```

### 6. Rodar Migrations

```bash
# Via migration job (automatico no Helm install)
# Ou manualmente:
kubectl exec -n jarvis deploy/jarvis-backend -- python -m alembic upgrade head
```

---

## Configuracao Pos-Deploy

### 1. Keycloak

1. Criar realm `jarvis`
2. Criar client `jarvis-automation` (Public client, PKCE enabled)
3. Configurar Valid Redirect URIs: `https://jarvis.yourdomain.com/*`
4. Mapear roles nos tokens: `realm_access.roles` deve conter `admin`, `operator` ou `viewer`

### 2. Primeira Zona

1. Acessar `/settings/integrations/beyondtrust`
2. Configurar API URL e chaves do BeyondTrust
3. Configurar subscriptions Azure em Settings > Microsoft

### 3. Configuracao AI (por zona)

1. Acessar `/settings/ai-configuration`
2. Selecionar zona
3. Tab "Geral": modelo Anthropic (ex: `claude-sonnet-4-20250514`), max cards por run, DevOps project
4. Tab "Secrets": Anthropic API Key, DevOps PAT, DevOps Org URL (salvos no Key Vault)
5. Tab "Platform Owners": cadastrar owners por tipo de plataforma (Windows, Linux, AD, etc.)

### 4. Habilitar Analise AI

Na configuracao da zona, marcar `is_enabled = true`. O CronJob diario (6h UTC) processara automaticamente.

Para teste manual: `POST /api/devops-cards/analyze/{zone_id}?dry_run=true`

---

## Seguranca

| Aspecto | Implementacao |
|---------|-------------|
| Autenticacao | Keycloak OIDC com PKCE (sem client_secret no frontend) |
| Autorizacao | RBAC 3 niveis (admin/operator/viewer) + permissoes por zona |
| Secrets | Azure Key Vault via Workload Identity (nunca em .env de producao) |
| Database | SSL obrigatorio (`sslmode=require`) |
| CORS | Configuravel (produção: restrito ao dominio) |
| Headers | X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |
| Proxy | Suporte a proxy HTTP/1.1 para BeyondTrust Cloud (evita exposicao direta) |

---

## Monitoramento e Troubleshooting

### Logs

```bash
# Backend logs
kubectl logs -n jarvis -l app=jarvis-backend -f

# CronJob logs
kubectl logs -n jarvis -l job-type=analyze --tail=100

# Ultimo job de analise
kubectl get jobs -n jarvis -l job-type=analyze --sort-by='.metadata.creationTimestamp'
```

### Health Check

```bash
# Via port-forward
curl http://localhost:8099/api/health

# IP de saida do cluster (para whitelist no BeyondTrust/Azure)
curl http://localhost:8099/api/health/outbound-ip
```

### Problemas Comuns

| Problema | Causa Provavel | Solucao |
|----------|---------------|---------|
| Connection timeout no PostgreSQL | Firewall (IP do AKS nao liberado) | Adicionar IP do AKS nas regras de firewall do PG |
| BeyondTrust 401 | API key expirada ou IP nao whitelistado | Renovar key, verificar whitelist |
| Anthropic 401 | API key invalida | Verificar key no Key Vault |
| DevOps 203/401 | PAT expirado | Renovar PAT token no Key Vault |
| CronJob failed | Backend nao acessivel internamente | Verificar service `jarvis-backend` no namespace |
| Migration falha | Tabela ja existe ou conflito de versao | `alembic current` para verificar estado |

---

## Licenca

Proprietary
