import { ReactNode, useState } from "react";
import { Cpu, Database, Settings, Activity, LogOut, User, Shield, Layers, ChevronDown, ChevronRight, Clock, AlertTriangle, FileUp, Cloud, Brain, LayoutList } from "lucide-react";
import { NavLink } from "./NavLink";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission, canViewSettingsMenu, canViewIntegrationsMenu, canViewPasswordFailures, PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AzureStatusIndicator } from "./AzureStatusIndicator";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface LayoutProps {
  children: ReactNode;
}

const languages = [
  { code: 'pt-BR', name: 'Português', flag: '🇧🇷' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
];

export const Layout = ({ children }: LayoutProps) => {
  const { user, signOut, role } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  const isSettingsRoute = pathname.startsWith("/settings");
  const isIntegrationsRoute = pathname.includes("/settings/integrations");
  
  const [settingsOpen, setSettingsOpen] = useState(isSettingsRoute);
  const [integrationsOpen, setIntegrationsOpen] = useState(isIntegrationsRoute);

  // Permission checks
  const canViewVMs = hasPermission(role, "virtualMachines");
  const canViewSettings = canViewSettingsMenu(role);
  const canViewIntegrations = canViewIntegrationsMenu(role);
  const canViewMicrosoft = hasPermission(role, "settingsMicrosoft");
  const canViewBTExplorer = hasPermission(role, "settingsBeyondTrustExplorer");
  const canViewSchedules = hasPermission(role, "settingsSchedules");
  const canViewPwdFailures = canViewPasswordFailures(role);
  const canViewImportPwdFailures = hasPermission(role, "settingsImportPasswordFailures");
  const canViewDevopsCards = hasPermission(role, "devopsCards");
  const canViewAiConfig = hasPermission(role, "settingsAiConfiguration");

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar Fixo */}
      <aside className="fixed left-0 top-0 w-64 h-screen bg-sidebar border-r border-sidebar-border overflow-y-auto z-40">
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                <Cpu className="h-5 w-5 text-primary relative z-10" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-sidebar-foreground tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  J.A.R.V.I.S.
                </h1>
                <p className="text-[10px] text-sidebar-foreground/50 tracking-widest uppercase">
                  Automation System
                </p>
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="px-4 pt-4">
            <AzureStatusIndicator />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            <NavLink
              to="/"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              activeClassName="bg-sidebar-accent"
            >
              <Activity className="h-5 w-5" />
              <span className="font-medium">{t('nav.dashboard')}</span>
            </NavLink>

            {canViewVMs && (
              <NavLink
                to="/vms"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                activeClassName="bg-sidebar-accent"
              >
                <Database className="h-5 w-5" />
                <span className="font-medium">{t('nav.virtualMachines')}</span>
              </NavLink>
            )}

            {canViewPwdFailures && (
              <NavLink
                to="/password-safe"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                activeClassName="bg-sidebar-accent"
              >
                <Shield className="h-5 w-5" />
                <span className="font-medium">{t('nav.passwordSafe')}</span>
              </NavLink>
            )}

            {canViewDevopsCards && (
              <NavLink
                to="/devops-cards"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                activeClassName="bg-sidebar-accent"
              >
                <LayoutList className="h-5 w-5" />
                <span className="font-medium">{t('nav.devopsCards')}</span>
              </NavLink>
            )}

            {/* Settings with Submenu - Only if user can see any settings */}
            {canViewSettings && (
              <div>
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5" />
                    <span className="font-medium">{t('nav.settings')}</span>
                  </div>
                  <motion.div
                    animate={{ rotate: settingsOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.div>
                </button>
                
                <AnimatePresence initial={false}>
                  {settingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="pl-4 space-y-1 mt-1">
                        {/* Integrations Submenu */}
                        {canViewIntegrations && (
                          <div>
                            <button
                              onClick={() => setIntegrationsOpen(!integrationsOpen)}
                              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent text-sm transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <Layers className="h-4 w-4" />
                                <span>{t('settingsNav.integrations')}</span>
                              </div>
                              <motion.div
                                animate={{ rotate: integrationsOpen ? 90 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronRight className="h-3 w-3" />
                              </motion.div>
                            </button>
                            
                            <AnimatePresence initial={false}>
                              {integrationsOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.15, ease: "easeInOut" }}
                                  className="overflow-hidden"
                                >
                                  <div className="pl-4 space-y-1 mt-1">
                                    {/* BeyondTrust - visible for admin and operator */}
                                    <button
                                      onClick={() => navigate("/settings/integrations/beyondtrust")}
                                      className={cn(
                                        "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                                        pathname === "/settings/integrations/beyondtrust"
                                          ? "bg-sidebar-accent text-sidebar-foreground"
                                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                      )}
                                    >
                                      <Shield className="h-4 w-4" />
                                      <span>BeyondTrust</span>
                                    </button>
                                    
                                    {/* Microsoft - only admin */}
                                    {canViewMicrosoft && (
                                      <button
                                        onClick={() => navigate("/settings/integrations/microsoft")}
                                        className={cn(
                                          "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                                          pathname === "/settings/integrations/microsoft"
                                            ? "bg-sidebar-accent text-sidebar-foreground"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                        )}
                                      >
                                        <Cloud className="h-4 w-4" />
                                        <span>Microsoft</span>
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* BeyondTrust Explorer - only admin */}
                        {canViewBTExplorer && (
                          <button
                            onClick={() => navigate("/settings/beyondtrust")}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                              pathname === "/settings/beyondtrust"
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <Shield className="h-4 w-4" />
                            <span>{t('settingsNav.beyondTrustExplorer')}</span>
                          </button>
                        )}

                        {/* Schedules - only admin */}
                        {canViewSchedules && (
                          <button
                            onClick={() => navigate("/settings/schedules")}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                              pathname === "/settings/schedules"
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <Clock className="h-4 w-4" />
                            <span>{t('settingsNav.schedules')}</span>
                          </button>
                        )}

                        {/* Import Password Failures - only admin */}
                        {canViewImportPwdFailures && (
                          <button
                            onClick={() => navigate("/settings/import-password-failures")}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                              pathname === "/settings/import-password-failures"
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <FileUp className="h-4 w-4" />
                            <span>{t('settingsNav.importPasswordFailures')}</span>
                          </button>
                        )}

                        {/* AI Configuration - only admin */}
                        {canViewAiConfig && (
                          <button
                            onClick={() => navigate("/settings/ai-configuration")}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors",
                              pathname === "/settings/ai-configuration"
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                            )}
                          >
                            <Brain className="h-4 w-4" />
                            <span>{t('settingsNav.aiConfiguration')}</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </nav>

          {/* User Info & Footer */}
          <div className="p-4 border-t border-sidebar-border space-y-3 mt-auto">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="w-full justify-start gap-2 px-2 hover:bg-sidebar-accent">
                    <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-sidebar-primary" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate text-sidebar-foreground">
                        {user.user_metadata?.full_name || user.email?.split('@')[0]}
                      </p>
                      <p className="text-xs text-sidebar-foreground/70 truncate">
                        {user.email}
                      </p>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{t('common.myAccount')}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  {/* Language Selection */}
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    {t('common.language')}
                  </DropdownMenuLabel>
                  {languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className="gap-2 cursor-pointer"
                    >
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.name}</span>
                      {lang.code === i18n.language && (
                        <span className="ml-auto text-primary">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('common.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <p className="text-[10px] text-sidebar-foreground/40 tracking-wider" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
              JARVIS v1.0 // AB InBev
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content - com margem para compensar sidebar */}
      <main className="ml-64 min-h-screen">
        {children}
      </main>
    </div>
  );
};
