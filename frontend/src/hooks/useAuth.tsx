import { useState, createContext, useContext, ReactNode, useCallback } from "react";

export type AppRole = "admin" | "operator" | "viewer" | null;

export interface ZoneRole {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  role: AppRole;
}

// Mock user type (replaces Supabase User)
export interface MockUser {
  id: string;
  email: string;
}

interface AuthContextType {
  user: MockUser | null;
  session: { access_token: string } | null;
  loading: boolean;
  role: AppRole;
  zoneRoles: ZoneRole[];
  accessibleZones: string[];
  hasZoneAccess: (zoneId: string) => boolean;
  getZoneRole: (zoneId: string) => AppRole;
  isGlobalAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock admin user - no auth in this migration phase (Keycloak comes later)
const MOCK_USER: MockUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "admin@local",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<MockUser | null>(MOCK_USER);

  const role: AppRole = "admin";
  const zoneRoles: ZoneRole[] = [];
  const isGlobalAdmin = true;
  const accessibleZones: string[] = [];

  const hasZoneAccess = useCallback((_zoneId: string): boolean => {
    return true; // Admin has access to all zones
  }, []);

  const getZoneRole = useCallback((_zoneId: string): AppRole => {
    return "admin";
  }, []);

  const signOut = async () => {
    // No-op in this phase
  };

  return (
    <AuthContext.Provider value={{
      user,
      session: { access_token: "mock" },
      loading: false,
      role,
      zoneRoles,
      accessibleZones,
      hasZoneAccess,
      getZoneRole,
      isGlobalAdmin,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
