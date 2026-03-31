from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, health, zones, azure_vms, beyondtrust, onboarding, password_failures, credentials, maintenance, dashboard

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
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
