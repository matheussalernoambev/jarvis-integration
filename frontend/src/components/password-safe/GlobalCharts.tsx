import { useTranslation } from "react-i18next";
import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { ZONE_COLORS } from "@/lib/password-safe-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AreaChart,
  Area,
} from "recharts";
import { BarChart3, PieChartIcon, TrendingUp } from "lucide-react";

const chartConfig = {
  failures: { label: "Failures", color: "hsl(var(--destructive))" },
  automanageDisabled: { label: "Automanage", color: "hsl(var(--warning))" },
  value: { label: "Total", color: "hsl(var(--primary))" },
  total: { label: "Total", color: "hsl(var(--destructive))" },
};

export default function GlobalCharts() {
  const { t } = useTranslation();
  const { byZone, failuresByPlatform, failuresTrend } = usePasswordSafe();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Zone Distribution - Stacked Bar */}
      {byZone.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              {t("psDashboard.zoneDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={byZone} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="zoneCode" className="text-xs" width={50} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="failures"
                  stackId="stack"
                  fill="hsl(var(--destructive))"
                  radius={[0, 0, 0, 0]}
                  name={t("psDashboard.totalFailures")}
                />
                <Bar
                  dataKey="automanageDisabled"
                  stackId="stack"
                  fill="hsl(var(--warning))"
                  radius={[0, 4, 4, 0]}
                  name={t("psDashboard.totalAutomanage")}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Platform Donut */}
      {failuresByPlatform.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-muted-foreground" />
              {t("psDashboard.platformDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <PieChart>
                <Pie
                  data={failuresByPlatform}
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
                  {failuresByPlatform.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} className="stroke-background stroke-2" />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            {t("psDashboard.trendOverTime")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {failuresTrend.length > 1 ? (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <AreaChart data={failuresTrend}>
                <defs>
                  <linearGradient id="gradientPsTrend" x1="0" y1="0" x2="0" y2="1">
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
                  fill="url(#gradientPsTrend)"
                  strokeWidth={2}
                  name={t("psDashboard.totalFailures")}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] rounded-xl bg-muted/30 border border-dashed">
              <div className="text-center space-y-2">
                <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium text-muted-foreground">
                  {t("psDashboard.trendAvailableAfter")}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
