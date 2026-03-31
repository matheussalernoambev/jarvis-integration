import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface AutomanageResolvedChartProps {
  resolved: number;
  newCases: number;
  hasSnapshots: boolean;
}

const chartConfig = {
  resolved: { label: "Resolved", color: "hsl(142, 76%, 36%)" },
  newCases: { label: "New Cases", color: "hsl(0, 84%, 60%)" },
};

export default function AutomanageResolvedChart({ resolved, newCases, hasSnapshots }: AutomanageResolvedChartProps) {
  const { t } = useTranslation();

  if (!hasSnapshots) return null;

  const data = [
    { name: t("automanageDisabled.resolved"), value: resolved, fill: "hsl(142, 76%, 36%)" },
    { name: t("automanageDisabled.newCases"), value: newCases, fill: "hsl(0, 84%, 60%)" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t("automanageDisabled.resolvedVsNew")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis className="text-xs" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
