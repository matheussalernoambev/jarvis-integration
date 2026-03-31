import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import VirtualMachines from "./pages/VirtualMachines";
import PasswordFailures from "./pages/PasswordFailures";
import PasswordSafe from "./pages/PasswordSafe";
import Settings from "./pages/Settings";
import IntegrationsBeyondTrust from "./pages/settings/IntegrationsBeyondTrust";
import IntegrationsMicrosoft from "./pages/settings/IntegrationsMicrosoft";
import BeyondTrustExplorer from "./pages/settings/BeyondTrustExplorer";
import Schedules from "./pages/settings/Schedules";
import Maintenance from "./pages/settings/Maintenance";
import ImportPasswordFailures from "./pages/settings/ImportPasswordFailures";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import AccessDenied from "./pages/AccessDenied";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vms"
              element={
                <ProtectedRoute>
                  <RoleGuard allowedRoles={PERMISSIONS.virtualMachines}>
                    <Layout>
                      <VirtualMachines />
                    </Layout>
                  </RoleGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/password-safe"
              element={
                <ProtectedRoute>
                  <RoleGuard allowedRoles={PERMISSIONS.passwordFailures}>
                    <Layout>
                      <PasswordSafe />
                    </Layout>
                  </RoleGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/password-failures"
              element={
                <ProtectedRoute>
                  <RoleGuard allowedRoles={PERMISSIONS.passwordFailures}>
                    <Layout>
                      <PasswordFailures />
                    </Layout>
                  </RoleGuard>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              }
            >
              {/* BeyondTrust - Admin vê API + Onboarding, Operator só Onboarding */}
              <Route 
                path="integrations/beyondtrust" 
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsBeyondTrustOnboarding} fallback={<AccessDenied />}>
                    <IntegrationsBeyondTrust />
                  </RoleGuard>
                } 
              />
              
              {/* Microsoft - Apenas Admin */}
              <Route
                path="integrations/microsoft"
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsMicrosoft} fallback={<AccessDenied />}>
                    <IntegrationsMicrosoft />
                  </RoleGuard>
                }
              />
              
              {/* BT Explorer - Apenas Admin */}
              <Route
                path="beyondtrust"
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsBeyondTrustExplorer} fallback={<AccessDenied />}>
                    <BeyondTrustExplorer />
                  </RoleGuard>
                }
              />
              
              {/* Schedules - Apenas Admin */}
              <Route
                path="schedules"
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsSchedules} fallback={<AccessDenied />}>
                    <Schedules />
                  </RoleGuard>
                }
              />
              
              {/* Maintenance - Apenas Admin */}
              <Route
                path="maintenance"
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsMaintenance} fallback={<AccessDenied />}>
                    <Maintenance />
                  </RoleGuard>
                }
              />
              
              {/* Import Password Failures - Apenas Admin */}
              <Route
                path="import-password-failures"
                element={
                  <RoleGuard allowedRoles={PERMISSIONS.settingsImportPasswordFailures} fallback={<AccessDenied />}>
                    <ImportPasswordFailures />
                  </RoleGuard>
                }
              />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
