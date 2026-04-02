import { useTranslation } from "react-i18next";
import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { ZONE_COLORS } from "@/lib/password-safe-constants";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Globe, KeyRound, ToggleLeft } from "lucide-react";

export default function ZoneCardsGrid() {
  const { t } = useTranslation();
  const { byZone, selectedZoneId, setSelectedZoneId, totalFailures, totalAutomanage } = usePasswordSafe();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{t("psDashboard.zones")}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* All Zones card */}
        <button
          onClick={() => setSelectedZoneId(null)}
          className={cn(
            "relative p-3 rounded-lg border text-left transition-all hover:shadow-md",
            "bg-card hover:border-primary/50",
            selectedZoneId === null && "ring-2 ring-primary shadow-md"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-lg bg-primary" />
          <div className="flex items-center gap-1.5 mb-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">{t("psDashboard.allZones")}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-destructive">
              <KeyRound className="h-3 w-3" />
              {totalFailures.toLocaleString()}
            </span>
            <span className="flex items-center gap-1 text-warning">
              <ToggleLeft className="h-3 w-3" />
              {totalAutomanage.toLocaleString()}
            </span>
          </div>
        </button>

        {/* Per-zone cards */}
        {byZone.map((zone) => {
          const isSelected = selectedZoneId === zone.zoneId;
          const color = ZONE_COLORS[zone.zoneCode] || "hsl(var(--primary))";

          return (
            <button
              key={zone.zoneId}
              onClick={() => setSelectedZoneId(isSelected ? null : zone.zoneId)}
              className={cn(
                "relative p-3 rounded-lg border text-left transition-all hover:shadow-md",
                "bg-card hover:border-primary/50",
                isSelected && "ring-2 ring-primary shadow-md"
              )}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                style={{ backgroundColor: color }}
              />
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm">{zone.zoneCode}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {zone.total.toLocaleString()}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate mb-2">{zone.zoneName}</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-destructive">
                  <KeyRound className="h-3 w-3" />
                  {zone.failures.toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-warning">
                  <ToggleLeft className="h-3 w-3" />
                  {zone.automanageDisabled.toLocaleString()}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
