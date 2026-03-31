import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BeyondTrustApiCard } from "@/components/settings/BeyondTrustApiCard";
import { ZoneSelector } from "@/components/settings/ZoneSelector";
import { ZoneOnboardingTab } from "@/components/settings/ZoneOnboardingTab";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";

interface Zone {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const IntegrationsBeyondTrust = () => {
  const { t } = useTranslation();
  const { role } = useAuth();
  const [selectedZone, setSelectedZone] = useState<string>("global");
  const [zones, setZones] = useState<Zone[]>([]);
  const [currentZone, setCurrentZone] = useState<Zone | null>(null);

  // Permission checks for tabs
  const canViewApiTab = hasPermission(role, "settingsBeyondTrustApi");
  const canViewOnboardingTab = hasPermission(role, "settingsBeyondTrustOnboarding");
  
  // Default tab based on permissions
  const defaultTab = canViewApiTab ? "api" : "onboarding";

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    if (selectedZone !== "global") {
      const zone = zones.find(z => z.id === selectedZone);
      setCurrentZone(zone || null);
    } else {
      setCurrentZone(null);
    }
  }, [selectedZone, zones]);

  const fetchZones = async () => {
    try {
      const data = await api.get<Zone[]>('/zones');
      const activeZones = (data || []).filter(z => z.is_active);
      setZones(activeZones);

      // Auto-select first zone for onboarding
      if (activeZones.length > 0) {
        setSelectedZone(activeZones[0].id);
      }
    } catch (error) {
      console.error("Error fetching zones:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('settingsNav.integrationsBeyondTrust')}</h2>
          <p className="text-muted-foreground">
            {t('settingsNav.integrationsBeyondTrustDesc')}
          </p>
        </div>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-6">
          {canViewApiTab && (
            <TabsTrigger value="api" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t('settingsNav.apiConfiguration')}
            </TabsTrigger>
          )}
          {canViewOnboardingTab && (
            <TabsTrigger value="onboarding" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {t('settingsNav.onboardingRules')}
            </TabsTrigger>
          )}
        </TabsList>

        {canViewApiTab && (
          <TabsContent value="api" className="mt-0">
            <BeyondTrustApiCard />
          </TabsContent>
        )}

        {canViewOnboardingTab && (
          <TabsContent value="onboarding" className="mt-0 space-y-4">
            <div className="mb-4">
              <ZoneSelector 
                selectedZone={selectedZone} 
                onZoneChange={setSelectedZone}
                hideGlobal={true}
              />
            </div>
            {currentZone && (
              <ZoneOnboardingTab zoneId={selectedZone} zone={currentZone} />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default IntegrationsBeyondTrust;
