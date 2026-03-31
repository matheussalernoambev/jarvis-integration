import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ToggleLeft, Server } from "lucide-react";
import AutomanageKpiCards from "./AutomanageKpiCards";
import AutomanageResolvedChart from "./AutomanageResolvedChart";

interface ZoneData {
  zone_code: string;
  count: number;
}

interface PlatformData {
  name: string;
  value: number;
  fill: string;
}

const ZONE_COLORS: Record<string, string> = {
  MAZ: "hsl(45, 100%, 58%)",
  APAC: "hsl(34, 7%, 35%)",
  GHQ: "hsl(142, 76%, 36%)",
  SAZ: "hsl(206, 100%, 42%)",
  AFR: "hsl(0, 84%, 60%)",
  NAZ: "hsl(38, 92%, 50%)",
  EU: "hsl(179, 100%, 32%)",
};

const PLATFORM_COLORS = [
  "hsl(45, 100%, 58%)",
  "hsl(34, 7%, 35%)",
  "hsl(142, 76%, 36%)",
  "hsl(206, 100%, 42%)",
  "hsl(0, 84%, 60%)",
  "hsl(38, 92%, 50%)",
  "hsl(179, 100%, 32%)",
  "hsl(280, 60%, 50%)",
];

const chartConfig = {
  count: { label: "Total", color: "hsl(var(--primary))" },
  value: { label: "Total", color: "hsl(var(--primary))" },
};

export default function AutomanageDashboard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [zoneData, setZoneData] = useState<ZoneData[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [topSystems, setTopSystems] = useState<{ name: string; count: number }[]>([]);
  const [resolved, setResolved] = useState(0);
  const [newCases, setNewCases] = useState(0);
  const [hasSnapshots, setHasSnapshots] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [recordsResponse, zonesList, snapshotData] = await Promise.all([
        api.get('/password-failures?record_type=automanage_disabled&limit=10000'),
        api.get('/zones'),
        api.get('/password-failures/snapshots?record_type=automanage_disabled'),
      ]);

      const allRecords = recordsResponse.data || recordsResponse || [];
      const totalCount = recordsResponse.total || allRecords.length;
      setTotal(totalCount);

      // Calculate resolved/new from snapshots
      const snapshots = snapshotData || [];
      if (snapshots.length > 0) {
        const uniqueDates = [...new Set(snapshots.map((s: any) => s.snapshot_date))].sort().reverse();

        if (uniqueDates.length >= 2) {
          setHasSnapshots(true);
          const latestDate = uniqueDates[0];
          const previousDate = uniqueDates[1];

          const latestTotal = snapshots
            .filter((s: any) => s.snapshot_date === latestDate)
            .reduce((sum: number, s: any) => sum + s.total_failures, 0);
          const previousTotal = snapshots
            .filter((s: any) => s.snapshot_date === previousDate)
            .reduce((sum: number, s: any) => sum + s.total_failures, 0);

          setResolved(Math.max(0, previousTotal - latestTotal));
          setNewCases(Math.max(0, latestTotal - previousTotal));
        }
      }

      // Zone lookup
      const zoneCodeMap: Record<string, string> = {};
      (zonesList || []).forEach((z: any) => {
        zoneCodeMap[z.id] = z.code;
      });

      // Zone aggregation
      const zoneRows = allRecords.filter((r: any) => r.zone_id != null);
      if (zoneRows.length > 0) {
        const counts: Record<string, number> = {};
        zoneRows.forEach((r: any) => {
          const code = zoneCodeMap[r.zone_id] || "N/A";
          counts[code] = (counts[code] || 0) + 1;
        });
        setZoneData(
          Object.entries(counts)
            .map(([zone_code, count]) => ({ zone_code, count }))
            .sort((a, b) => b.count - a.count)
        );
      }

      // Platform aggregation
      if (allRecords.length > 0) {
        const counts: Record<string, number> = {};
        allRecords.forEach((r: any) => {
          const name = r.platform_name || "Unknown";
          counts[name] = (counts[name] || 0) + 1;
        });
        setPlatformData(
          Object.entries(counts)
            .map(([name, value], i) => ({
              name: name.length > 25 ? name.substring(0, 25) + "…" : name,
              value,
              fill: PLATFORM_COLORS[i % PLATFORM_COLORS.length],
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8)
        );
      }

      // Top systems
      if (allRecords.length > 0) {
        const counts: Record<string, number> = {};
        allRecords.forEach((r: any) => {
          const name = r.system_name || "Unknown";
          counts[name] = (counts[name] || 0) + 1;
        });
        setTopSystems(
          Object.entries(counts)
            .map(([name, count]) => ({
              name: name.length > 20 ? name.substring(0, 20) + "…" : name,
              count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        );
      }
    } catch (error) {
      console.error("Error fetching automanage dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (total === 0) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AutomanageKpiCards
        total={total}
        resolved={resolved}
        newCases={newCases}
        hasSnapshots={hasSnapshots}
      />

      <Card className="border-l-4 border-l-warning">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleLeft className="h-5 w-5 text-warning" />
            {t("automanageDisabled.dashboardTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resolved vs New Chart */}
          <AutomanageResolvedChart
            resolved={resolved}
            newCases={newCases}
            hasSnapshots={hasSnapshots}
          />

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Zone */}
            {zoneData.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">{t("automanageDisabled.byZone")}</h4>
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <BarChart data={zoneData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis type="number" className="text-xs" />
                    <YAxis type="category" dataKey="zone_code" className="text-xs" width={50} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {zoneData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={ZONE_COLORS[entry.zone_code] || "hsl(var(--primary))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            )}

            {/* By Platform */}
            {platformData.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">{t("automanageDisabled.byPlatform")}</h4>
                <ChartContainer config={chartConfig} className="h-[250px] w-full">
                  <PieChart>
                    <Pie
                      data={platformData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {platformData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} className="stroke-background stroke-2" />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </div>
            )}
          </div>

          {/* Top Systems */}
          {topSystems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                {t("automanageDisabled.topSystems")}
              </h4>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={topSystems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
