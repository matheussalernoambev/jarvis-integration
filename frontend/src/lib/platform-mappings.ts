// Platform mappings for BeyondTrust integration
// Maps OS groups to compatible Managed System and Functional Account platforms

export interface PlatformGroup {
  label: string;
  managedSystemPlatforms: number[];
  functionalAccountPlatforms: number[];
}

export const PLATFORM_GROUPS: Record<string, PlatformGroup> = {
  windows: {
    label: "Windows",
    managedSystemPlatforms: [1, 3], // Windows Server, Windows Workstation
    functionalAccountPlatforms: [1, 3, 25], // Windows local + Active Directory
  },
  linux: {
    label: "Linux/Unix",
    managedSystemPlatforms: [2],
    functionalAccountPlatforms: [2],
  },
  sqlServer: {
    label: "SQL Server",
    managedSystemPlatforms: [8],
    functionalAccountPlatforms: [8, 25], // SQL Server + AD
  },
  oracle: {
    label: "Oracle",
    managedSystemPlatforms: [9],
    functionalAccountPlatforms: [9],
  },
  mysql: {
    label: "MySQL",
    managedSystemPlatforms: [10],
    functionalAccountPlatforms: [10],
  },
};

// Platform ID to name mapping (common ones)
export const PLATFORM_NAMES: Record<number, string> = {
  1: "Windows Server",
  2: "Linux/Unix SSH",
  3: "Windows Workstation",
  8: "SQL Server",
  9: "Oracle",
  10: "MySQL",
  25: "Active Directory",
};

// Helper to get compatible Functional Accounts for an OS group
export function getCompatibleFunctionalAccountPlatforms(
  osGroup: string
): number[] {
  const group = PLATFORM_GROUPS[osGroup];
  return group ? group.functionalAccountPlatforms : [];
}

// Helper to get the label for an OS group
export function getOsGroupLabel(osGroup: string): string {
  const group = PLATFORM_GROUPS[osGroup];
  return group ? group.label : osGroup;
}

// Helper to get platform name by ID
export function getPlatformName(platformId: number): string {
  return PLATFORM_NAMES[platformId] || `Platform ${platformId}`;
}

// Helper to determine OS group from VM os_type string
export function getOsGroupFromVmType(osType: string): string {
  const normalized = osType.toLowerCase();
  if (normalized.includes("windows")) return "windows";
  if (normalized.includes("linux") || normalized.includes("ubuntu") || normalized.includes("centos") || normalized.includes("rhel") || normalized.includes("debian")) return "linux";
  if (normalized.includes("sql")) return "sqlServer";
  if (normalized.includes("oracle")) return "oracle";
  if (normalized.includes("mysql")) return "mysql";
  return "windows"; // default fallback
}

// Helper to get default managed system platform for an OS group
export function getDefaultManagedSystemPlatform(osGroup: string): number {
  const group = PLATFORM_GROUPS[osGroup];
  return group?.managedSystemPlatforms[0] || 1;
}
