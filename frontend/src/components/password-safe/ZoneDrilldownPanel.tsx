import { useTranslation } from "react-i18next";
import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { ZONE_COLORS } from "@/lib/password-safe-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from "recharts";
import { X, KeyRound, ToggleLeft, Server, Layers } from "lucide-react";
import { PLATFORM_COLORS } from "@/lib/password-safe-constants";

const chartConfig = {
  count: { label: "Total", color: "hsl(var(--primary))" },
  failures: { label: "Failures", color: "hsl(var(--destructive))" },
  automanage: { label: "Automanage", color: "hsl(var(--warning))" },
  value: { label: "Total", color: "hsl(var(--primary))" },
};

export default function ZoneDrilldownPanel() {
  const { t } = useTranslation();
  const {
    selectedZoneId,
    setSelectedZoneId,
    byZone,
    getZonePlatformBreakdown,
    getZoneWorkgroupBreakdown,
    getZoneTopSystems,
  } = usePasswordSafe();

  if (!selectedZoneId) return null;

  const zone = byZone.find((z) => z.zoneId === selectedZoneId);
  if (!zone) return null;

  const color = ZONE_COLORS[zone.zoneCode] || "hsl(var(--primary))";
  const platforms = getZonePlatformBreakdown(selectedZoneId);
  const workgroups = getZoneWorkgroupBreakdown(selectedZoneId);
  const topSystems = getZoneTopSystems(selectedZoneId);

  return (
    <Card className="border-l-4 animate-in slide-in-from-top-2 duration-300" style={{ borderLeftColor: color }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-base">
            <Badge style={{ backgroundColor: color, color: "#fff" }} className="text-sm px-3 py-1">
              {zone.zoneCode}
            </Badge>
            <span>{zone.zoneName}</span>
            <span className="text-muted-foreground font-normal">-</span>
            <span className="text-sm font-normal text-muted-foreground">{t("psDashboard.zoneDetails")}</span>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setSelectedZoneId(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Zone KPIs */}
        <div className="flex items-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-destructive" />
            <span className="text-sm text-muted-foreground">{t("psDashboard.totalFailures")}:</span>
            <span className="font-bold text-destructive">{zone.failures.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4 text-warning" />
            <span className="text-sm text-muted-foreground">{t("psDashboard.totalAutomanage")}:</span>
            <span className="font-bold text-warning">{zone.automanageDisabled.toLocaleString()}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* By Platform */}
          {platforms.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                {t("psDashboard.byPlatform")}
              </h4>
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={platforms} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {platforms.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {/* By Workgroup */}
          {workgroups.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                {t("psDashboard.byWorkgroup")}
              </h4>
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={workgroups} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="failures" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} stackId="stack" name={t("psDashboard.totalFailures")} />
                  <Bar dataKey="automanage" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} stackId="stack" name={t("psDashboard.totalAutomanage")} />
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {/* Top Systems */}
          {topSystems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                {t("psDashboard.topSystems")}
              </h4>
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <BarChart data={topSystems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
