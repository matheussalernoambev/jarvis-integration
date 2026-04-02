from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth, health, zones, azure_vms, beyondtrust, onboarding,
    password_failures, credentials, dashboard,
    zone_ai_config, platform_owners, devops_cards, scheduled_reminders,
)

app = FastAPI(
    title="Jarvis Automation API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(zones.router, prefix="/api/zones", tags=["Zones"])
app.include_router(azure_vms.router, prefix="/api/azure", tags=["Azure VMs"])
app.include_router(beyondtrust.router, prefix="/api/beyondtrust", tags=["BeyondTrust"])
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["Onboarding"])
app.include_router(password_failures.router, prefix="/api/password-failures", tags=["Password Failures"])
app.include_router(credentials.router, prefix="/api/credentials", tags=["Credentials"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(zone_ai_config.router, prefix="/api/zone-ai-config", tags=["Zone AI Config"])
app.include_router(platform_owners.router, prefix="/api/platform-owners", tags=["Platform Owners"])
app.include_router(devops_cards.router, prefix="/api/devops-cards", tags=["DevOps Cards"])
app.include_router(scheduled_reminders.router, prefix="/api/scheduled-reminders", tags=["Scheduled Reminders"])
