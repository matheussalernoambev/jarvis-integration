import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  PlusCircle,
  TrendingDown,
  TrendingUp,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface ZoneFailureData {
  zone_code: string;
  count: number;
}

interface PlatformData {
  name: string;
  value: number;
  fill: string;
}

interface SnapshotData {
  snapshot_date: string;
  zone_code: string;
  total_failures: number;
}

interface TrendPoint {
  date: string;
  total: number;
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
  total: { label: "Total", color: "hsl(var(--primary))" },
  resolved: { label: "Resolvidos", color: "hsl(142, 76%, 36%)" },
  newCases: { label: "Novos", color: "hsl(0, 84%, 60%)" },
  value: { label: "Falhas", color: "hsl(var(--primary))" },
  count: { label: "Falhas", color: "hsl(var(--primary))" },
};

export default function PasswordFailuresDashboard() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "pt-BR" ? ptBR : enUS;

  const [loading, setLoading] = useState(true);
  const [totalFailures, setTotalFailures] = useState(0);
  
  const [resolvedCount, setResolvedCount] = useState<number | null>(null);
  const [newCount, setNewCount] = useState<number | null>(null);
  const [lastImportDate, setLastImportDate] = useState<string | null>(null);
  const [zoneData, setZoneData] = useState<ZoneFailureData[]>([]);
  const [platformData, setPlatformData] = useState<PlatformData[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [topSystems, setTopSystems] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch dashboard stats from REST API
      const stats = await api.get<{
        total_failures: number;
        last_import_date: string | null;
        by_zone: { zone_code: string; count: number }[];
        by_platform: { name: string; count: number }[];
        top_systems: { name: string; count: number }[];
        snapshots: { snapshot_date: string; total_failures: number }[];
      }>('/password-failures?view=dashboard');

      // Total
      setTotalFailures(stats.total_failures || 0);

      // Last import date
      if (stats.last_import_date) {
        setLastImportDate(stats.last_import_date);
      }

      // Zone data
      if (stats.by_zone && stats.by_zone.length > 0) {
        setZoneData(stats.by_zone.sort((a, b) => b.count - a.count));
      }

      // Platform data
      if (stats.by_platform && stats.by_platform.length > 0) {
        const sorted = stats.by_platform
          .map((p, i) => ({
            name: p.name.length > 25 ? p.name.substring(0, 25) + "…" : p.name,
            value: p.count,
            fill: PLATFORM_COLORS[i % PLATFORM_COLORS.length],
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8);
        setPlatformData(sorted);
      }

      // Top systems
      if (stats.top_systems && stats.top_systems.length > 0) {
        const sorted = stats.top_systems
          .map((s) => ({
            name: s.name.length > 20 ? s.name.substring(0, 20) + "…" : s.name,
            count: s.count,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setTopSystems(sorted);
      }

      // Snapshots for trend
      const snapshots = stats.snapshots || [];
      if (snapshots.length > 0) {
        // Group by snapshot_date
        const dateGroups: Record<string, number> = {};
        snapshots.forEach((s: any) => {
          const dateKey = new Date(s.snapshot_date).toLocaleDateString(i18n.language, {
            day: "2-digit",
            month: "short",
          });
          dateGroups[dateKey] = (dateGroups[dateKey] || 0) + (s.total_failures || 0);
        });
        setTrendData(
          Object.entries(dateGroups).map(([date, total]) => ({ date, total }))
        );

        // If 2+ distinct dates, calculate resolved/new
        const distinctDates = [...new Set(snapshots.map((s: any) => s.snapshot_date))].sort();
        if (distinctDates.length >= 2) {
          const lastDate = distinctDates[distinctDates.length - 1];
          const prevDate = distinctDates[distinctDates.length - 2];
          const lastTotal = snapshots
            .filter((s: any) => s.snapshot_date === lastDate)
            .reduce((sum: number, s: any) => sum + (s.total_failures || 0), 0);
          const prevTotal = snapshots
            .filter((s: any) => s.snapshot_date === prevDate)
            .reduce((sum: number, s: any) => sum + (s.total_failures || 0), 0);

          const diff = lastTotal - prevTotal;
          if (diff <= 0) {
            setResolvedCount(Math.abs(diff));
            setNewCount(0);
          } else {
            setResolvedCount(0);
            setNewCount(diff);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching password failures dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalFailures === 0) return null;

  const netChange = resolvedCount !== null && newCount !== null
    ? newCount - resolvedCount
    : null;

  return (
    <Card className="animate-slide-up border-l-4 border-l-destructive">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("pfDashboard.title")}
            </CardTitle>
            <CardDescription>
              {lastImportDate && (
                <span>
                  {t("pfDashboard.lastImport")}:{" "}
                  {formatDistanceToNow(new Date(lastImportDate), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </span>
              )}
            </CardDescription>
          </div>
          <Link
            to="/password-safe"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t("pfDashboard.viewAll")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4 text-destructive" />
              {t("pfDashboard.totalFailures")}
            </div>
            <div className="text-3xl font-bold text-destructive">
              {totalFailures.toLocaleString()}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-success/10 border border-success/20 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {t("pfDashboard.resolved")}
            </div>
            <div className="text-3xl font-bold text-success">
              {resolvedCount !== null ? resolvedCount.toLocaleString() : "—"}
            </div>
            {resolvedCount === null && (
              <p className="text-xs text-muted-foreground">{t("pfDashboard.needsSecondImport")}</p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <PlusCircle className="h-4 w-4 text-warning" />
              {t("pfDashboard.newCases")}
            </div>
            <div className="text-3xl font-bold text-warning">
              {newCount !== null ? newCount.toLocaleString() : "—"}
            </div>
            {newCount === null && (
              <p className="text-xs text-muted-foreground">{t("pfDashboard.needsSecondImport")}</p>
            )}
          </div>

          <div className={cn(
            "p-4 rounded-xl space-y-1 border",
            netChange === null
              ? "bg-muted/50 border-border"
              : netChange <= 0
              ? "bg-success/10 border-success/20"
              : "bg-destructive/10 border-destructive/20"
          )}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {netChange !== null && netChange <= 0 ? (
                <TrendingDown className="h-4 w-4 text-success" />
              ) : (
                <TrendingUp className="h-4 w-4 text-destructive" />
              )}
              {t("pfDashboard.netChange")}
            </div>
            <div className={cn(
              "text-3xl font-bold",
              netChange === null
                ? "text-muted-foreground"
                : netChange <= 0
                ? "text-success"
                : "text-destructive"
            )}>
              {netChange !== null
                ? `${netChange > 0 ? "+" : ""}${netChange.toLocaleString()}`
                : "—"}
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Failures by Zone - Horizontal Bar */}
          <div>
            <h4 className="text-sm font-medium mb-3">{t("pfDashboard.byZone")}</h4>
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

          {/* Platform Distribution - Donut */}
          <div>
            <h4 className="text-sm font-medium mb-3">{t("pfDashboard.byPlatform")}</h4>
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
        </div>

        {/* Bottom Row: Top Systems + Trend */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top 10 Systems */}
          {topSystems.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">{t("pfDashboard.topSystems")}</h4>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={topSystems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="name" className="text-xs" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {/* Trend Chart */}
          {trendData.length > 1 ? (
            <div>
              <h4 className="text-sm font-medium mb-3">{t("pfDashboard.trend")}</h4>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="gradientPfTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(0, 84%, 60%)"
                    fill="url(#gradientPfTotal)"
                    strokeWidth={2}
                    name={t("pfDashboard.totalFailures")}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center p-8 rounded-xl bg-muted/30 border border-dashed">
              <div className="text-center space-y-2">
                <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  {t("pfDashboard.trendAvailableAfter")}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
