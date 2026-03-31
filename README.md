# Jarvis Automation

Sistema de gerenciamento e automacao de maquinas virtuais Azure com integracao BeyondTrust.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | FastAPI (Python 3.12) + SQLAlchemy 2.0 async |
| Banco | Azure PostgreSQL Flexible Server |
| Auth | Keycloak OIDC (obrigatorio) |
| Secrets | Azure Key Vault (via Workload Identity) |
| API Gateway | Azure API Management (APIM) |
| Infra | AKS (single cluster) + ACR + Helm |
| CI/CD | GitHub Actions + ACR Build |

## Estrutura do Projeto

```
jarvis-automation/
├── frontend/              # React SPA
│   ├── src/               # Componentes, paginas, hooks, lib
│   ├── package.json
│   └── vite.config.ts
├── backend/               # FastAPI API
│   ├── app/               # Models, routers, services, schemas
│   ├── alembic/           # Database migrations
│   └── requirements.txt
├── deploy/                # Artefatos de containerizacao (ACR Build)
│   ├── containerfiles/    # Backend + Frontend containerfiles
│   └── nginx/             # Nginx config para frontend
├── helm/                  # Helm chart para AKS
│   └── jarvis-automation/
├── apim/                  # Azure API Management policies
├── docs/                  # Documentacao
│   └── aks-setup-guide.md # Guia passo-a-passo de setup
└── .github/workflows/     # CI/CD pipeline
```

## Desenvolvimento Local

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:8080
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copiar e configurar variaveis de ambiente
cp ../.env.example ../.env

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Migrations

```bash
cd backend
python -m alembic upgrade head
```

## Deploy em AKS

Consulte o guia completo: [docs/aks-setup-guide.md](docs/aks-setup-guide.md)

### Resumo rapido

```bash
# 1. Build das imagens via ACR (sem Docker local)
az acr build --registry $ACR_NAME --image jarvis-backend:latest \
  --file deploy/containerfiles/backend.containerfile ./backend

az acr build --registry $ACR_NAME --image jarvis-frontend:latest \
  --file deploy/containerfiles/frontend.containerfile \
  --build-arg VITE_API_URL=/api .

# 2. Deploy via Helm
helm upgrade --install jarvis-automation ./helm/jarvis-automation \
  --namespace jarvis --create-namespace \
  --set image.registry=$ACR_NAME.azurecr.io \
  --set host=jarvis.company.com \
  --set keyvault.url=https://kv-jarvis.vault.azure.net/ \
  --set keycloak.url=https://keycloak.company.com \
  --wait --timeout 5m
```

## Arquitetura

```
                    ┌─────────────────────────────────────────────┐
                    │              AKS Cluster                     │
Internet ──HTTPS──▶ │  ┌─────────┐    ┌──────────┐               │
                    │  │ Ingress  │───▶│ Frontend │               │
                    │  │ (nginx)  │    │ (React)  │               │
                    │  │          │    └──────────┘               │
                    │  │          │    ┌──────────┐  ┌──────────┐ │
                    │  │          │───▶│ Backend  │─▶│ Key Vault│ │
                    │  └─────────┘    │ (FastAPI)│  └──────────┘ │
                    │                  └────┬─────┘               │
                    └───────────────────────┼─────────────────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                    ┌──────────┐    ┌──────────────┐   ┌──────────┐
                    │ Keycloak │    │  PostgreSQL   │   │   APIM   │
                    │  (OIDC)  │    │ Flex Server   │   │(Gateway) │
                    └──────────┘    └──────────────┘   └──────────┘
```
