import { useEffect, useState } from "react";
import AutomanageDashboard from "@/components/password-safe/AutomanageDashboard";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import {
  Monitor,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  ArrowRight,
  RefreshCw,
  Globe,
  Shield,
  TrendingUp,
  Zap,
  Timer,
  Activity,
  Server,
  Layers,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import PasswordFailuresDashboard from "@/components/PasswordFailuresDashboard";
import { ptBR, enUS } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Stats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
}

interface ChartData {
  name: string;
  value: number;
  fill?: string;
}

interface TrendData {
  date: string;
  success: number;
  failed: number;
}

interface OnboardingTime {
  vmName: string;
  time: number;
}

interface TodayMetrics {
  processed: number;
  successRate: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
}

interface ErrorDistribution {
  error: string;
  count: number;
}

interface ZoneStats {
  id: string;
  code: string;
  name: string;
  vmCount: number;
  pending: number;
  completed: number;
  failed: number;
  inProgress: number;
  successRate: number;
  isConfigured: boolean;
}

interface DomainStats {
  domainJoined: number;
  standalone: number;
}

interface OnboardingTypeStats {
  created: number;
  alreadyExisted: number;
  partial: number;
}

// ABInBev Corporate Palette
const STATUS_COLORS = {
  completed: "hsl(142, 76%, 36%)",      // Verde sucesso
  pending: "hsl(45, 100%, 58%)",        // Amarelo dourado (primary)
  failed: "hsl(0, 84%, 60%)",           // Vermelho erro
  inProgress: "hsl(34, 7%, 35%)",       // Marrom médio (brand)
};

const chartConfig = {
  completed: { label: "Concluídas", color: STATUS_COLORS.completed },
  pending: { label: "Pendentes", color: STATUS_COLORS.pending },
  failed: { label: "Falhas", color: STATUS_COLORS.failed },
  inProgress: { label: "Em Progresso", color: STATUS_COLORS.inProgress },
  success: { label: "Sucesso", color: STATUS_COLORS.completed },
  value: { label: "VMs", color: "hsl(45, 100%, 58%)" },
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dateLocale = i18n.language === "pt-BR" ? ptBR : enUS;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
  });
  const [statusData, setStatusData] = useState<ChartData[]>([]);
  const [subscriptionData, setSubscriptionData] = useState<ChartData[]>([]);
  const [osData, setOsData] = useState<ChartData[]>([]);
  const [locationData, setLocationData] = useState<ChartData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [onboardingTimes, setOnboardingTimes] = useState<OnboardingTime[]>([]);
  const [todayMetrics, setTodayMetrics] = useState<TodayMetrics>({
    processed: 0,
    successRate: 0,
    avgTime: 0,
    minTime: 0,
    maxTime: 0,
  });
  const [errorDistribution, setErrorDistribution] = useState<ErrorDistribution[]>([]);
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([]);
  const [domainStats, setDomainStats] = useState<DomainStats>({ domainJoined: 0, standalone: 0 });
  const [onboardingTypes, setOnboardingTypes] = useState<OnboardingTypeStats>({
    created: 0,
    alreadyExisted: 0,
    partial: 0,
  });

  const calculateOnboardingTimes = async (vms: any[]): Promise<OnboardingTime[]> => {
    const completedVMs = vms
      .filter((vm) => vm.onboarding_status === "completed")
      .slice(-20);

    if (completedVMs.length === 0) return [];

    const vmIds = completedVMs.map((vm) => vm.id);

    // Fetch onboarding logs for each VM
    const logsPromises = vmIds.map((id) => api.get(`/onboarding/logs/${id}`));
    const logsResults = await Promise.all(logsPromises);
    const logs = logsResults.flat();

    if (!logs || logs.length === 0) return [];

    const times: OnboardingTime[] = [];
    completedVMs.forEach((vm) => {
      const vmLogs = logs.filter((log) => log.vm_id === vm.id);
      const startLog = vmLogs.find((log) => log.status === "started");
      const endLog = vmLogs.find((log) => log.status === "success" || log.status === "completed");

      if (startLog && endLog) {
        const startTime = new Date(startLog.created_at).getTime();
        const endTime = new Date(endLog.created_at).getTime();
        const durationMinutes = (endTime - startTime) / 60000;

        if (durationMinutes > 0 && durationMinutes < 120) {
          times.push({
            vmName: vm.name.length > 12 ? vm.name.substring(0, 12) + "..." : vm.name,
            time: parseFloat(durationMinutes.toFixed(1)),
          });
        }
      }
    });

    return times;
  };

  const calculateTodayMetrics = (
    vms: any[],
    logs: any[],
    times: OnboardingTime[]
  ): void => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayLogs = logs.filter((log) => {
      const logDate = new Date(log.created_at);
      return logDate >= today;
    });

    const successToday = todayLogs.filter(
      (log) => log.status === "success" || log.status === "completed"
    ).length;
    const failedToday = todayLogs.filter((log) => log.status === "failed").length;
    const totalToday = successToday + failedToday;

    const timeValues = times.map((t) => t.time);
    const avgTime = timeValues.length > 0
      ? timeValues.reduce((a, b) => a + b, 0) / timeValues.length
      : 0;
    const minTime = timeValues.length > 0 ? Math.min(...timeValues) : 0;
    const maxTime = timeValues.length > 0 ? Math.max(...timeValues) : 0;

    setTodayMetrics({
      processed: totalToday,
      successRate: totalToday > 0 ? (successToday / totalToday) * 100 : 0,
      avgTime: parseFloat(avgTime.toFixed(1)),
      minTime: parseFloat(minTime.toFixed(1)),
      maxTime: parseFloat(maxTime.toFixed(1)),
    });
  };

  const calculateErrorDistribution = (logs: any[]): void => {
    const failedLogs = logs.filter((log) => log.status === "failed");
    const errorCounts: Record<string, number> = {};

    failedLogs.forEach((log) => {
      let errorType = "Erro desconhecido";
      if (log.message) {
        if (log.message.includes("timeout") || log.message.includes("Timeout")) {
          errorType = "Timeout";
        } else if (log.message.includes("auth") || log.message.includes("Auth")) {
          errorType = "Autenticação";
        } else if (log.message.includes("connection") || log.message.includes("Connection")) {
          errorType = "Conexão";
        } else if (log.message.includes("permission") || log.message.includes("Permission")) {
          errorType = "Permissão";
        } else if (log.message.includes("not found") || log.message.includes("Not found")) {
          errorType = "Não encontrado";
        } else {
          errorType = log.message.substring(0, 25) + "...";
        }
      }
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    });

    const distribution = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setErrorDistribution(distribution);
  };

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);

      // Fetch all data in parallel via API
      const [dashboardStats, vmsResult, zonesData] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/vms'),
        api.get('/zones'),
      ]);

      const vms = vmsResult.data || [];
      const zones = zonesData || [];
      const zoneConfigs = (dashboardStats.zone_configs || []) as { zone_id: string; is_configured: boolean }[];
      const logs = (dashboardStats.recent_logs || []) as any[];

      // Calculate basic stats
      const pending = vms.filter((vm) => vm.onboarding_status === "pending").length;
      const inProgress = vms.filter((vm) => vm.onboarding_status === "in_progress").length;
      const completed = vms.filter((vm) => vm.onboarding_status === "completed").length;
      const failed = vms.filter((vm) => vm.onboarding_status === "failed").length;

      setStats({
        total: vms.length,
        pending,
        inProgress,
        completed,
        failed,
      });

      // Status distribution
      setStatusData([
        { name: t("dashboard.completed"), value: completed, fill: STATUS_COLORS.completed },
        { name: t("dashboard.pending"), value: pending, fill: STATUS_COLORS.pending },
        { name: t("dashboard.failed"), value: failed, fill: STATUS_COLORS.failed },
        { name: t("dashboard.inProgress"), value: inProgress, fill: STATUS_COLORS.inProgress },
      ]);

      // Subscription distribution
      const subscriptionGroups: Record<string, number> = {};
      vms.forEach((vm) => {
        const subName = vm.subscription_name || vm.subscription?.substring(0, 8) || "Unknown";
        subscriptionGroups[subName] = (subscriptionGroups[subName] || 0) + 1;
      });
      const subData = Object.entries(subscriptionGroups)
        .map(([name, value]) => ({ name: name.length > 20 ? name.substring(0, 20) + "..." : name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
      setSubscriptionData(subData);

      // OS distribution
      const osGroups: Record<string, number> = {};
      vms.forEach((vm) => {
        const os = vm.os_type || "Unknown";
        osGroups[os] = (osGroups[os] || 0) + 1;
      });
      // ABInBev palette: Gold primary, Dark brown secondary
      setOsData(
        Object.entries(osGroups).map(([name, value], index) => ({
          name,
          value,
          fill: index === 0 ? "hsl(45, 100%, 58%)" : "hsl(34, 7%, 35%)",
        }))
      );

      // Location distribution
      const locationGroups: Record<string, number> = {};
      vms.forEach((vm) => {
        const location = vm.location || "Unknown";
        locationGroups[location] = (locationGroups[location] || 0) + 1;
      });
      const locData = Object.entries(locationGroups)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      setLocationData(locData);

      // Domain stats
      const domainJoined = vms.filter((vm) => vm.domain_status === "domain_joined").length;
      const standalone = vms.filter((vm) => vm.domain_status === "standalone" || vm.domain_status === "workgroup").length;
      setDomainStats({ domainJoined, standalone });

      // Onboarding type stats
      const created = vms.filter((vm) => vm.onboarding_type === "created").length;
      const alreadyExisted = vms.filter((vm) => vm.onboarding_type === "already_existed").length;
      const partial = vms.filter((vm) => vm.onboarding_type === "partial").length;
      setOnboardingTypes({ created, alreadyExisted, partial });

      // Zone stats
      const zoneStatsArray: ZoneStats[] = zones.map((zone) => {
        const config = zoneConfigs.find((c) => c.zone_id === zone.id);
        const zoneVMs = vms.filter((vm) => vm.zone_id === zone.id);
        const zonePending = zoneVMs.filter((vm) => vm.onboarding_status === "pending").length;
        const zoneCompleted = zoneVMs.filter((vm) => vm.onboarding_status === "completed").length;
        const zoneFailed = zoneVMs.filter((vm) => vm.onboarding_status === "failed").length;
        const zoneInProgress = zoneVMs.filter((vm) => vm.onboarding_status === "in_progress").length;

        return {
          id: zone.id,
          code: zone.code,
          name: zone.name,
          vmCount: zoneVMs.length,
          pending: zonePending,
          completed: zoneCompleted,
          failed: zoneFailed,
          inProgress: zoneInProgress,
          successRate: zoneVMs.length > 0 ? (zoneCompleted / zoneVMs.length) * 100 : 0,
          isConfigured: config?.is_configured || false,
        };
      });
      setZoneStats(zoneStatsArray.sort((a, b) => b.vmCount - a.vmCount));

      // Weekly trend
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split("T")[0]);
      }

      const trendMap: Record<string, { success: number; failed: number }> = {};
      last7Days.forEach((date) => {
        trendMap[date] = { success: 0, failed: 0 };
      });

      logs.forEach((log) => {
        const logDate = log.created_at.split("T")[0];
        if (trendMap[logDate]) {
          if (log.status === "success" || log.status === "completed") {
            trendMap[logDate].success++;
          } else if (log.status === "failed") {
            trendMap[logDate].failed++;
          }
        }
      });

      setTrendData(
        last7Days.map((date) => ({
          date: new Date(date).toLocaleDateString(i18n.language, {
            weekday: "short",
            day: "2-digit",
          }),
          success: trendMap[date].success,
          failed: trendMap[date].failed,
        }))
      );

      // Onboarding times
      const times = await calculateOnboardingTimes(vms);
      setOnboardingTimes(times);

      // Today metrics
      calculateTodayMetrics(vms, logs, times);

      // Error distribution
      calculateErrorDistribution(logs);

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const globalSuccessRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  const gaugeData = [{ value: globalSuccessRate, fill: globalSuccessRate >= 80 ? STATUS_COLORS.completed : globalSuccessRate >= 60 ? STATUS_COLORS.pending : STATUS_COLORS.failed }];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("dashboard.lastUpdated")}:</span>
            <span className="font-medium">
              {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: dateLocale })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-2.5 w-2.5 rounded-full transition-all",
              refreshing ? "bg-warning animate-pulse" : "bg-success"
            )} />
            <span className="text-xs text-muted-foreground">{t("dashboard.autoRefresh")}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      {stats.total > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="animate-slide-up animate-delay-1 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t("dashboard.totalVMs")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold animate-count-up">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{todayMetrics.processed} {t("dashboard.today")}
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up animate-delay-2 border-l-4 border-l-warning">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t("dashboard.pending")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning animate-count-up">{stats.pending}</div>
            <Progress value={(stats.pending / stats.total) * 100} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card className="animate-slide-up animate-delay-3 border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {t("dashboard.inProgress")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary animate-count-up">{stats.inProgress}</div>
            <Progress value={(stats.inProgress / stats.total) * 100} className="h-1 mt-2" />
          </CardContent>
        </Card>

        <Card className="animate-slide-up animate-delay-4 border-l-4 border-l-success">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {t("dashboard.completed")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success animate-count-up">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {globalSuccessRate.toFixed(1)}% {t("dashboard.successRate").toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up animate-delay-5 border-l-4 border-l-destructive">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              {t("dashboard.failed")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive animate-count-up">{stats.failed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : 0}% {t("dashboard.errors")}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Zone Performance Grid - Clickable for Drill-down */}
      {zoneStats.length > 0 && (
        <Card className="animate-slide-up animate-delay-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {t("dashboard.zonePerformance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {zoneStats.map((zone, index) => (
                <TooltipProvider key={zone.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "relative p-4 rounded-xl border-2 transition-all hover:shadow-lg cursor-pointer group",
                          zone.isConfigured
                            ? "bg-card hover:border-primary/50"
                            : "bg-muted/30 opacity-60",
                          `animate-slide-up animate-delay-${index + 1}`
                        )}
                  onClick={() => {
                    if (zone.isConfigured && zone.vmCount > 0) {
                      navigate(`/vms?zone=${zone.id}`);
                    }
                  }}
                      >
                        {/* Drill-down indicator */}
                        {zone.isConfigured && zone.vmCount > 0 && (
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <div
                          className={cn(
                            "absolute top-0 left-0 right-0 h-1 rounded-t-xl",
                            zone.successRate >= 90
                              ? "bg-success"
                              : zone.successRate >= 70
                              ? "bg-warning"
                              : zone.vmCount > 0
                              ? "bg-destructive"
                              : "bg-muted"
                          )}
                        />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">{zone.code}</span>
                            {zone.isConfigured ? (
                              <Badge variant="outline" className="text-xs">
                                {zone.vmCount}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                N/C
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{zone.name}</p>
                          {zone.isConfigured && zone.vmCount > 0 ? (
                            <>
                              <Progress value={zone.successRate} className="h-1.5" />
                              <div className="flex justify-between text-xs">
                                <span className="text-success">✓ {zone.completed}</span>
                                <span className="text-warning">◷ {zone.pending}</span>
                                <span className="text-destructive">✕ {zone.failed}</span>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              {t("dashboard.notConfigured")}
                            </p>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {zone.isConfigured && zone.vmCount > 0 ? (
                        <p className="text-xs">{t("vms.viewDetails")} → {zone.code}</p>
                      ) : (
                        <p className="text-xs">{t("dashboard.notConfigured")}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Password Failures Dashboard Section */}
      <PasswordFailuresDashboard />

      {/* Automanage Disabled Dashboard Section */}
      <AutomanageDashboard />

      {/* Metrics Row: Gauge + Today + Times */}
      {stats.total > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Global Success Gauge */}
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              {t("dashboard.performanceGauge")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <RadialBarChart
                innerRadius="60%"
                outerRadius="100%"
                data={gaugeData}
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  background={{ fill: "hsl(var(--muted))" }}
                  dataKey="value"
                  cornerRadius={15}
                />
              </RadialBarChart>
            </ChartContainer>
            <div className="text-center -mt-16">
              <div className="text-4xl font-bold">{globalSuccessRate.toFixed(0)}%</div>
              <p className="text-sm text-muted-foreground">{t("dashboard.globalSuccessRate")}</p>
            </div>
          </CardContent>
        </Card>

        {/* Today's Metrics */}
        <Card className="animate-slide-up animate-delay-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              {t("dashboard.todayMetrics")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-primary">{todayMetrics.processed}</div>
                <p className="text-xs text-muted-foreground">{t("dashboard.processedToday")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-success">{todayMetrics.successRate.toFixed(0)}%</div>
                <p className="text-xs text-muted-foreground">{t("dashboard.successRate")}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {t("dashboard.domainJoined")}
                </span>
                <Badge variant="secondary">{domainStats.domainJoined}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  {t("dashboard.standalone")}
                </span>
                <Badge variant="outline">{domainStats.standalone}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Onboarding Times */}
        <Card className="animate-slide-up animate-delay-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-accent" />
              {t("dashboard.avgOnboardingTime")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="text-xl font-bold text-success">{todayMetrics.minTime}</div>
                <p className="text-xs text-muted-foreground">{t("dashboard.minTime")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="text-xl font-bold text-primary">{todayMetrics.avgTime}</div>
                <p className="text-xs text-muted-foreground">{t("dashboard.avgTime")}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="text-xl font-bold text-warning">{todayMetrics.maxTime}</div>
                <p className="text-xs text-muted-foreground">{t("dashboard.maxTime")}</p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">{t("dashboard.minutes")}</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Zone Stacked Bar Chart */}
      {zoneStats.filter(z => z.vmCount > 0).length > 0 && (
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {t("dashboard.statusByZone")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={zoneStats.filter(z => z.vmCount > 0)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="code" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="completed" stackId="a" fill={STATUS_COLORS.completed} name={t("dashboard.completed")} radius={[0, 0, 0, 0]} />
                <Bar dataKey="pending" stackId="a" fill={STATUS_COLORS.pending} name={t("dashboard.pending")} radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} name={t("dashboard.failed")} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      {stats.total > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="animate-slide-up">
          <CardHeader>
            <CardTitle>{t("dashboard.statusDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie
                  data={statusData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${value}`}
                  labelLine={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="stroke-background stroke-2" />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Subscription Distribution */}
        <Card className="animate-slide-up animate-delay-1">
          <CardHeader>
            <CardTitle>{t("dashboard.subscriptionDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={subscriptionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="name" className="text-xs" width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* OS Distribution */}
        <Card className="animate-slide-up animate-delay-2">
          <CardHeader>
            <CardTitle>{t("dashboard.osDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie
                  data={osData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {osData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="stroke-background stroke-2" />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Location Distribution */}
        <Card className="animate-slide-up animate-delay-3">
          <CardHeader>
            <CardTitle>{t("dashboard.locationDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={locationData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Top Errors */}
        {errorDistribution.length > 0 && (
          <Card className="animate-slide-up animate-delay-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                {t("dashboard.topErrors")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={errorDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" className="text-xs" />
                  <YAxis type="category" dataKey="error" className="text-xs" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Onboarding Time per VM */}
        {onboardingTimes.length > 0 && (
          <Card className="animate-slide-up animate-delay-5">
            <CardHeader>
              <CardTitle>{t("dashboard.onboardingTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <BarChart data={onboardingTimes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="vmName" className="text-xs" angle={-45} textAnchor="end" height={60} />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="time" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name={t("dashboard.minutes")} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
      )}

      {/* Weekly Trend - Full Width */}
      {stats.total > 0 && (
      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t("dashboard.weeklyTrend")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gradientSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STATUS_COLORS.completed} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={STATUS_COLORS.completed} stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradientFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={STATUS_COLORS.failed} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={STATUS_COLORS.failed} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" className="text-xs" />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                type="monotone"
                dataKey="success"
                stroke={STATUS_COLORS.completed}
                fill="url(#gradientSuccess)"
                strokeWidth={2}
                name={t("dashboard.completed")}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke={STATUS_COLORS.failed}
                fill="url(#gradientFailed)"
                strokeWidth={2}
                name={t("dashboard.failed")}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
      )}

      {/* Quick Actions */}
      <Card className="animate-slide-up">
        <CardHeader>
          <CardTitle>{t("dashboard.quickActions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button asChild variant="outline" className="h-auto py-4 justify-start group hover:border-primary">
              <Link to="/virtual-machines" className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Monitor className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <div className="font-medium">{t("nav.virtualMachines")}</div>
                  <div className="text-xs text-muted-foreground">
                    {stats.total} {t("dashboard.machines")}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="h-auto py-4 justify-start group hover:border-accent">
              <Link to="/beyondtrust" className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10 group-hover:bg-accent/20 transition-colors">
                  <Shield className="h-5 w-5 text-accent" />
                </div>
                <div className="text-left">
                  <div className="font-medium">{t("nav.beyondTrust")}</div>
                  <div className="text-xs text-muted-foreground">Explorer</div>
                </div>
                <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </Button>

            <Button asChild variant="outline" className="h-auto py-4 justify-start group hover:border-muted-foreground">
              <Link to="/settings" className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-medium">{t("nav.settings")}</div>
                  <div className="text-xs text-muted-foreground">{t("dashboard.quickActions")}</div>
                </div>
                <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
