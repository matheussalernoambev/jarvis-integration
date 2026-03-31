import { api } from "@/lib/api";

/**
 * Call the BeyondTrust API gateway via FastAPI backend
 */
export async function btCall<T = unknown>(action: string, args?: Record<string, unknown>): Promise<T> {
  const data = await api.post("/beyondtrust/proxy", { action, args });
  return data as T;
}

/**
 * BeyondTrust API client with typed methods
 */
export const BeyondTrustApi = {
  // ========== Authentication ==========
  login: () => btCall("login"),

  // ========== Read Operations (viewer+) ==========

  // User Groups
  getGroups: () => btCall<Array<{ UserGroupID: number; Name: string }>>("get_group"),

  // Functional Accounts (all)
  getFunctionalAccounts: () => btCall<Array<{
    FunctionalAccountID: number;
    DisplayName: string;
    Description: string;
    PlatformID: number;
    DomainName: string;
    AccountName: string;
  }>>("get_functional_accounts"),

  // Workgroups (all)
  getWorkgroups: () => btCall<Array<{
    WorkgroupID: number;
    Name: string;
    ID: number;
  }>>("get_workgroups"),
  getGroupUsers: (group_id: number) => btCall("get_group_user", { group_id }),

  // Databases
  getDatabases: () => btCall("get_databases"),

  // Functional Accounts
  getFunctionalAccountId: (functional_account_name: string) =>
    btCall<{ functionalAccountID: string; platformID: string }>("get_functional_account_id", {
      functional_account_name,
    }),
  getFunctionalAccountManagedSystems: (functionalaccount_id: string) =>
    btCall("get_functional_account_managed_system", { functionalaccount_id }),

  // Managed Systems
  getManagedSystems: (params?: Record<string, unknown>) =>
    btCall("get_managed_system", { params }),
  searchManagedSystem: (params?: Record<string, unknown>) =>
    btCall("search_managed_system", { params }),

  // Managed Accounts
  getManagedAccount: (ManagedAccountID: string) =>
    btCall("get_managed_account", { ManagedAccountID }),
  getManagedAccountsOfSystem: (ManagedSystemID: string, params?: Record<string, unknown>) =>
    btCall("get_managed_account_of_managed_system", { ManagedSystemID, params }),
  searchManagedAccounts: (params?: Record<string, unknown>) =>
    btCall("search_managed_account", { params }),

  // Assets
  searchAsset: (asset_name: string) => btCall("search_asset", { asset_name }),

  // Platforms & Workgroups
  getPlatforms: (params?: Record<string, unknown>) => btCall("get_platforms", { params }),
  getWorkgroupByName: (params?: Record<string, unknown>) =>
    btCall("get_workgroup_by_name", { params }),

  // Quick Rules & Smart Rules
  searchQuickRules: (params?: Record<string, unknown>) =>
    btCall("search_quickrule", params),
  getQuickRuleManagedAccounts: (quickRuleID: string) =>
    btCall("get_quickrules_managed_accounts", { quickRuleID }),
  getSmartRules: () => btCall("get_smart_rules"),
  getSmartRuleManagedAccounts: (SmartRuleID: string) =>
    btCall("get_smartrules_managed_accounts", { SmartRuleID }),
  getUserGroupSmartRules: (usergroup_id: string) =>
    btCall("get_usergroup_smartrule", { usergroup_id }),

  // Audits
  getUserAudit: (start: string) => btCall("user_audit", { start }),

  // ========== Write Operations (operator+) ==========

  // Assets
  createAsset: (args: {
    WorkgroupID: string;
    ip: string;
    asset_name: string;
    os_type: string;
    asset_type?: string;
    domain?: string;
    DNS?: string;
    mac?: string;
  }) => btCall("create_asset", args),

  // Managed Systems
  createManagedSystem: (args: {
    asset_id: string;
    hostname: string;
    platform_id: string;
    description?: string;
    password_rule?: string;
    autoflag?: boolean;
    func_id?: string;
    port?: number;
  }) => btCall("create_managed_system", args),

  createDatabaseManagedSystem: (args: {
    database_id: string;
    contact_email?: string;
    description?: string;
    password_rule?: string;
    autoflag?: boolean;
    func_id?: string;
  }) => btCall("create_database_managed_system", args),

  updateManagedSystem: (ManagedSystemID: string, data: Record<string, unknown>) =>
    btCall("update_managed_system", { ManagedSystemID, data }),

  // Managed Accounts
  createManagedAccount: (args: {
    managed_system_id: string;
    account_name: string;
    description?: string;
    domain?: string;
    autoflag?: boolean;
    password_rule?: string;
    password?: string;
  }) => btCall("create_managed_account", args),

  updateManagedAccount: (ManagedAccountID: string, data: Record<string, unknown>) =>
    btCall("update_managed_account", { ManagedAccountID, data }),

  linkAccount: (args: {
    ManagedAccountID: string;
    ManagedSystemID: string;
    domain?: string;
    AccountName: string;
    description?: string;
    PasswordRuleID?: string;
    AutoManagementFlag?: boolean;
  }) => btCall("link_account", args),

  // Credentials
  testCredentials: (managed_account_id: string) =>
    btCall("test_credentials", { managed_account_id }),
  changeCredentials: (managed_account_id: string) =>
    btCall("change_credentials", { managed_account_id }),

  // Directories
  createDirectory: (args: {
    WorkgroupID: string;
    DomainName: string;
    ForestName?: string;
    NetBiosName?: string;
    Description?: string;
    PasswordRuleID?: string;
    AutoManagementFlag?: boolean;
    FunctionalAccountID?: string;
  }) => btCall("create_directory", args),

  // Quick Rules
  createQuickRule: (args: {
    AccountIDs: string[];
    Title: string;
    Category?: string;
    Description?: string;
  }) => btCall("create_quickrule", args),

  updateQuickRule: (QuickRuleID: string, args: {
    AccountIDs?: string[];
    Title?: string;
    Category?: string;
    Description?: string;
  }) => btCall("update_quickrule", { QuickRuleID, ...args }),

  // ========== Delete Operations (admin only) ==========
  deleteManagedAccount: (id: string) => btCall("delete_managed_account", { id }),
  deleteManagedSystemAccounts: (ManagedSystemID: string) =>
    btCall("delete_managed_systems_account", { ManagedSystemID }),
  deleteManagedSystem: (ManagedSystemID: string) =>
    btCall("delete_managed_systems", { ManagedSystemID }),
  deleteAsset: (AssetsID: string) => btCall("delete_assets", { AssetsID }),
  deleteDatabase: (database_id: string) => btCall("delete_database", { database_id }),
};
