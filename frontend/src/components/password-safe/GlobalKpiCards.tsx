import { useTranslation } from "react-i18next";
import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { KeyRound, ToggleLeft, CheckCircle2, PlusCircle, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GlobalKpiCards() {
  const { t } = useTranslation();
  const {
    totalFailures,
    totalAutomanage,
    failuresResolved,
    failuresNewCases,
    failuresNetChange,
    failuresHasSnapshots,
  } = usePasswordSafe();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {/* Total Password Failures */}
      <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4 text-destructive" />
          {t("psDashboard.totalFailures")}
        </div>
        <div className="text-3xl font-bold text-destructive">
          {totalFailures.toLocaleString()}
        </div>
      </div>

      {/* Total Automanage Disabled */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ToggleLeft className="h-4 w-4 text-warning" />
          {t("psDashboard.totalAutomanage")}
        </div>
        <div className="text-3xl font-bold text-warning">
          {totalAutomanage.toLocaleString()}
        </div>
      </div>

      {/* Resolved */}
      <div className="p-4 rounded-xl bg-success/10 border border-success/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {t("psDashboard.resolved")}
        </div>
        {failuresHasSnapshots ? (
          <div className="text-3xl font-bold text-success">
            {failuresResolved.toLocaleString()}
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold text-muted-foreground">-</div>
            <p className="text-xs text-muted-foreground">{t("psDashboard.needsSecondImport")}</p>
          </>
        )}
      </div>

      {/* New Cases */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlusCircle className="h-4 w-4 text-warning" />
          {t("psDashboard.newCases")}
        </div>
        {failuresHasSnapshots ? (
          <div className="text-3xl font-bold text-warning">
            {failuresNewCases.toLocaleString()}
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold text-muted-foreground">-</div>
            <p className="text-xs text-muted-foreground">{t("psDashboard.needsSecondImport")}</p>
          </>
        )}
      </div>

      {/* Net Change */}
      <div className={cn(
        "p-4 rounded-xl space-y-1 border",
        failuresNetChange === null
          ? "bg-muted/50 border-border"
          : failuresNetChange <= 0
          ? "bg-success/10 border-success/20"
          : "bg-destructive/10 border-destructive/20"
      )}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {failuresNetChange !== null && failuresNetChange <= 0 ? (
            <TrendingDown className="h-4 w-4 text-success" />
          ) : (
            <TrendingUp className="h-4 w-4 text-destructive" />
          )}
          {t("psDashboard.netChange")}
        </div>
        <div className={cn(
          "text-3xl font-bold",
          failuresNetChange === null
            ? "text-muted-foreground"
            : failuresNetChange <= 0
            ? "text-success"
            : "text-destructive"
        )}>
          {failuresNetChange !== null
            ? `${failuresNetChange > 0 ? "+" : ""}${failuresNetChange.toLocaleString()}`
            : "-"}
        </div>
      </div>
    </div>
  );
}
