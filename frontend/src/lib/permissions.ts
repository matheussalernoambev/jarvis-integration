import { AppRole } from "@/hooks/useAuth";

export const PERMISSIONS = {
  // Páginas
  dashboard: ["admin", "operator", "viewer"] as AppRole[],
  virtualMachines: ["admin", "operator"] as AppRole[],
  passwordFailures: ["admin", "operator", "viewer"] as AppRole[],
  
  // Settings - Integrações (Global Admin only)
  settingsBeyondTrustApi: ["admin"] as AppRole[],
  settingsBeyondTrustOnboarding: ["admin", "operator"] as AppRole[],
  settingsMicrosoft: ["admin"] as AppRole[],
  settingsZoneSso: ["admin"] as AppRole[],
  
  // Settings - Outras
  settingsBeyondTrustExplorer: ["admin"] as AppRole[],
  settingsSchedules: ["admin"] as AppRole[],
  settingsImportPasswordFailures: ["admin"] as AppRole[],
  settingsAiConfiguration: ["admin"] as AppRole[],

  // Páginas operacionais
  devopsCards: ["admin", "operator"] as AppRole[],

  // Ações
  startOnboarding: ["admin", "operator"] as AppRole[],
  syncPasswordFailures: ["admin", "operator"] as AppRole[],
};

// Helper para verificar permissão global
export function hasPermission(role: AppRole, permission: keyof typeof PERMISSIONS): boolean {
  if (!role) return false;
  return PERMISSIONS[permission].includes(role);
}

// Helper para verificar se pode ver Settings menu
export function canViewSettingsMenu(role: AppRole): boolean {
  return hasPermission(role, "settingsBeyondTrustApi") || 
         hasPermission(role, "settingsBeyondTrustOnboarding");
}

// Helper para verificar se pode ver Integrations submenu
export function canViewIntegrationsMenu(role: AppRole): boolean {
  return hasPermission(role, "settingsBeyondTrustApi") || 
         hasPermission(role, "settingsBeyondTrustOnboarding");
}

// Helper para verificar se pode ver Password Failures
export function canViewPasswordFailures(role: AppRole): boolean {
  return hasPermission(role, "passwordFailures");
}

// Zone-level permission check
export function hasZonePermission(
  globalRole: AppRole, 
  zoneRole: AppRole, 
  requiredRoles: AppRole[]
): boolean {
  // Global admin sempre tem acesso
  if (globalRole === "admin") return true;
  
  // Verificar role da zona
  if (!zoneRole) return false;
  return requiredRoles.includes(zoneRole);
}
