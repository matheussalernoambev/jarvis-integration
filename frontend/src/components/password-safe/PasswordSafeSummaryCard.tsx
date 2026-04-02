import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowRight, KeyRound, ToggleLeft, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PasswordSafeSummaryCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [totalFailures, setTotalFailures] = useState(0);
  const [totalAutomanage, setTotalAutomanage] = useState(0);
  const [netChange, setNetChange] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [failRes, autoRes, failSnaps] = await Promise.all([
        api.get("/password-failures?record_type=failure&limit=1"),
        api.get("/password-failures?record_type=automanage_disabled&limit=1"),
        api.get("/password-failures/snapshots?record_type=failure"),
      ]);

      setTotalFailures(failRes.total || 0);
      setTotalAutomanage(autoRes.total || 0);

      // Net change from snapshots
      const snapshots = failSnaps || [];
      if (snapshots.length > 0) {
        const toDateKey = (iso: string) => iso.substring(0, 10);
        const dateTotals: Record<string, number> = {};
        snapshots.forEach((s: any) => {
          const dk = toDateKey(s.snapshot_date);
          dateTotals[dk] = (dateTotals[dk] || 0) + (s.total_failures || 0);
        });
        const sorted = Object.keys(dateTotals).sort();
        if (sorted.length >= 2) {
          const latest = dateTotals[sorted[sorted.length - 1]];
          const previous = dateTotals[sorted[sorted.length - 2]];
          setNetChange(latest - previous);
        }
      }
    } catch (error) {
      console.error("Error fetching password safe summary:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-16 w-full" /></CardContent>
      </Card>
    );
  }

  if (totalFailures === 0 && totalAutomanage === 0) return null;

  return (
    <Card className="animate-slide-up border-l-4 border-l-destructive">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("psDashboard.summaryTitle")}
            </CardTitle>
            <CardDescription />
          </div>
          <Link
            to="/password-safe"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {t("psDashboard.summaryViewAll")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Failures */}
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4 text-destructive" />
              {t("psDashboard.totalFailures")}
            </div>
            <div className="text-3xl font-bold text-destructive">
              {totalFailures.toLocaleString()}
            </div>
          </div>

          {/* Automanage */}
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ToggleLeft className="h-4 w-4 text-warning" />
              {t("psDashboard.totalAutomanage")}
            </div>
            <div className="text-3xl font-bold text-warning">
              {totalAutomanage.toLocaleString()}
            </div>
          </div>

          {/* Net Change */}
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
              {t("psDashboard.netChange")}
            </div>
            <div className={cn(
              "text-3xl font-bold",
              netChange === null ? "text-muted-foreground"
                : netChange <= 0 ? "text-success" : "text-destructive"
            )}>
              {netChange !== null
                ? `${netChange > 0 ? "+" : ""}${netChange.toLocaleString()}`
                : "-"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
