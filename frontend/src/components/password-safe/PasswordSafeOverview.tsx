import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { Skeleton } from "@/components/ui/skeleton";
import GlobalKpiCards from "./GlobalKpiCards";
import ZoneCardsGrid from "./ZoneCardsGrid";
import ZoneDrilldownPanel from "./ZoneDrilldownPanel";
import GlobalCharts from "./GlobalCharts";

export default function PasswordSafeOverview() {
  const { loading, totalFailures, totalAutomanage } = usePasswordSafe();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (totalFailures === 0 && totalAutomanage === 0) return null;

  return (
    <div className="space-y-6">
      <GlobalKpiCards />
      <ZoneCardsGrid />
      <ZoneDrilldownPanel />
      <GlobalCharts />
    </div>
  );
}
