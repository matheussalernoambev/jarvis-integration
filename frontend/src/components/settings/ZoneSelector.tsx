import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Zone {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface ZoneSelectorProps {
  selectedZone: string; // "global" or zone id
  onZoneChange: (zoneId: string) => void;
  hideGlobal?: boolean;
}

export function ZoneSelector({ selectedZone, onZoneChange, hideGlobal = false }: ZoneSelectorProps) {
  const { t } = useTranslation();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    try {
      const data = await api.get<Zone[]>('/zones');
      setZones((data || []).filter(z => z.is_active));
    } catch (error) {
      console.error("Error fetching zones:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedZoneData = zones.find(z => z.id === selectedZone);

  return (
    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center gap-2 text-muted-foreground">
        {selectedZone === "global" ? (
          <Globe className="h-5 w-5" />
        ) : (
          <MapPin className="h-5 w-5" />
        )}
        <span className="font-medium">{t('zoneSelector.scope')}:</span>
      </div>
      
      <Select
        value={selectedZone}
        onValueChange={onZoneChange}
        disabled={loading}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder={t('zoneSelector.selectScope')} />
        </SelectTrigger>
        <SelectContent>
          {!hideGlobal && (
            <SelectItem value="global">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>{t('zoneSelector.global')}</span>
              </div>
            </SelectItem>
          )}
          {zones.map((zone) => (
            <SelectItem key={zone.id} value={zone.id}>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="font-mono">{zone.code}</span>
                <span className="text-muted-foreground">- {zone.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedZone !== "global" && selectedZoneData && (
        <div className="text-sm text-muted-foreground">
          {t('zoneSelector.configuring')}: <span className="font-semibold text-foreground">{selectedZoneData.name}</span>
        </div>
      )}
    </div>
  );
}
