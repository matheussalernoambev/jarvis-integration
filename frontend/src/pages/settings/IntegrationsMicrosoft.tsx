import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Cloud, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MicrosoftSsoCard } from "@/components/settings/MicrosoftSsoCard";
import { ZoneSsoMappingCard } from "@/components/settings/ZoneSsoMappingCard";
import { ZoneSelector } from "@/components/settings/ZoneSelector";
import { ZoneAzureTab } from "@/components/settings/ZoneAzureTab";
import { api } from "@/lib/api";

interface Zone {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const IntegrationsMicrosoft = () => {
  const { t } = useTranslation();
  const [selectedZone, setSelectedZone] = useState<string>("global");
  const [zones, setZones] = useState<Zone[]>([]);
  const [currentZone, setCurrentZone] = useState<Zone | null>(null);

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

      // Auto-select first zone for Azure config
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
          <h2 className="text-2xl font-bold tracking-tight">{t('settingsNav.integrationsMicrosoft')}</h2>
          <p className="text-muted-foreground">
            {t('settingsNav.integrationsMicrosoftDesc')}
          </p>
        </div>
      </div>

      <Tabs defaultValue="sso" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="sso" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t('settingsNav.ssoConfiguration')}
          </TabsTrigger>
          <TabsTrigger value="zoneSso" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('settingsNav.zoneSsoConfiguration')}
          </TabsTrigger>
          <TabsTrigger value="azure" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            {t('settingsNav.azureCredentials')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sso" className="mt-0">
          <MicrosoftSsoCard />
        </TabsContent>

        <TabsContent value="zoneSso" className="mt-0">
          <ZoneSsoMappingCard />
        </TabsContent>

        <TabsContent value="azure" className="mt-0 space-y-4">
          <div className="mb-4">
            <ZoneSelector 
              selectedZone={selectedZone} 
              onZoneChange={setSelectedZone}
              hideGlobal={true}
            />
          </div>
          {currentZone && (
            <ZoneAzureTab zoneId={selectedZone} zone={currentZone} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IntegrationsMicrosoft;
