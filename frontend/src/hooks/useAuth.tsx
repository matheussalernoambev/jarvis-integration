import { useState, createContext, useContext, ReactNode, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export type AppRole = "admin" | "operator" | "viewer" | null;

export interface ZoneRole {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  role: AppRole;
}

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
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER: MockUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "admin@jarvis.local",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState<boolean>(
    () => localStorage.getItem("jarvis_authenticated") === "true"
  );

  const user = authenticated ? MOCK_USER : null;
  const session = authenticated ? { access_token: "mock" } : null;

  const role: AppRole = authenticated ? "admin" : null;
  const zoneRoles: ZoneRole[] = [];
  const isGlobalAdmin = authenticated;
  const accessibleZones: string[] = [];

  const hasZoneAccess = useCallback((_zoneId: string): boolean => {
    return true;
  }, []);

  const getZoneRole = useCallback((_zoneId: string): AppRole => {
    return "admin";
  }, []);

  const signIn = useCallback(() => {
    localStorage.setItem("jarvis_authenticated", "true");
    setAuthenticated(true);
    navigate("/", { replace: true });
  }, [navigate]);

  const signOut = useCallback(async () => {
    localStorage.removeItem("jarvis_authenticated");
    setAuthenticated(false);
    navigate("/auth", { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading: false,
      role,
      zoneRoles,
      accessibleZones,
      hasZoneAccess,
      getZoneRole,
      isGlobalAdmin,
      signIn,
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
