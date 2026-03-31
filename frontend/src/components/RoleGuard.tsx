import { ReactNode } from "react";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import AccessDenied from "@/pages/AccessDenied";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: AppRole[];
  fallback?: ReactNode;
}

export function RoleGuard({ children, allowedRoles, fallback }: RoleGuardProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!role || !allowedRoles.includes(role)) {
    return <>{fallback || <AccessDenied />}</>;
  }

  return <>{children}</>;
}
