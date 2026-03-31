import { useTranslation } from "react-i18next";
import { ToggleLeft, CheckCircle2, PlusCircle } from "lucide-react";

interface AutomanageKpiCardsProps {
  total: number;
  resolved: number;
  newCases: number;
  hasSnapshots: boolean;
}

export default function AutomanageKpiCards({ total, resolved, newCases, hasSnapshots }: AutomanageKpiCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Total Desabilitados */}
      <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ToggleLeft className="h-4 w-4 text-warning" />
          {t("automanageDisabled.totalDisabled")}
        </div>
        <div className="text-3xl font-bold text-warning">
          {total.toLocaleString()}
        </div>
      </div>

      {/* Resolvidos */}
      <div className="p-4 rounded-xl bg-success/10 border border-success/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {t("automanageDisabled.resolved")}
        </div>
        {hasSnapshots ? (
          <div className="text-3xl font-bold text-success">
            {resolved.toLocaleString()}
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">{t("pfDashboard.needsSecondImport")}</p>
          </>
        )}
      </div>

      {/* Novos Casos */}
      <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlusCircle className="h-4 w-4 text-destructive" />
          {t("automanageDisabled.newCases")}
        </div>
        {hasSnapshots ? (
          <div className="text-3xl font-bold text-destructive">
            {newCases.toLocaleString()}
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold text-muted-foreground">—</div>
            <p className="text-xs text-muted-foreground">{t("pfDashboard.needsSecondImport")}</p>
          </>
        )}
      </div>
    </div>
  );
}
