import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { ZONE_COLORS, PLATFORM_COLORS, truncate } from "@/lib/password-safe-constants";

// ─── Types ──────────────────────────────────────────────────────────────────
export interface Zone {
  id: string;
  code: string;
  name: string;
}

export interface PasswordFailureRecord {
  id: string;
  zone_id: string | null;
  managed_account_id: number | null;
  account_name: string;
  system_name: string | null;
  domain_name: string | null;
  platform_name: string | null;
  workgroup_name: string | null;
  failure_count: number;
  failure_reason: string | null;
  last_change_attempt: string | null;
  last_change_result: string | null;
  first_failure_at: string | null;
  import_source: string;
  record_type: string;
  synced_at: string | null;
}

export interface ZoneAggregation {
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  failures: number;
  automanageDisabled: number;
  total: number;
}

export interface PlatformData {
  name: string;
  value: number;
  fill: string;
}

export interface WorkgroupData {
  name: string;
  failures: number;
  automanage: number;
}

export interface SystemData {
  name: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  total: number;
}

interface PasswordSafeContextValue {
  loading: boolean;
  zones: Zone[];

  // Selection
  selectedZoneId: string | null;
  setSelectedZoneId: (id: string | null) => void;

  // Failures
  failureRecords: PasswordFailureRecord[];
  totalFailures: number;
  failuresResolved: number;
  failuresNewCases: number;
  failuresNetChange: number | null;
  failuresHasSnapshots: boolean;
  failuresTrend: TrendPoint[];

  // Automanage
  automanageRecords: PasswordFailureRecord[];
  totalAutomanage: number;
  automanageResolved: number;
  automanageNewCases: number;
  automanageHasSnapshots: boolean;

  // Global aggregations
  byZone: ZoneAggregation[];
  failuresByPlatform: PlatformData[];
  automanageByPlatform: PlatformData[];

  // Drilldown helpers
  getZoneFailures: (zoneId: string) => number;
  getZoneAutomanage: (zoneId: string) => number;
  getZonePlatformBreakdown: (zoneId: string) => PlatformData[];
  getZoneWorkgroupBreakdown: (zoneId: string) => WorkgroupData[];
  getZoneTopSystems: (zoneId: string) => SystemData[];

  // Global top systems
  globalTopSystems: SystemData[];

  // Actions
  refetch: () => Promise<void>;
}

const PasswordSafeContext = createContext<PasswordSafeContextValue | undefined>(undefined);

// ─── Snapshot helpers ────────────────────────────────────────────────────────
function processSnapshots(snapshots: any[]): { resolved: number; newCases: number; hasSnapshots: boolean; trend: TrendPoint[] } {
  if (!snapshots || snapshots.length === 0) {
    return { resolved: 0, newCases: 0, hasSnapshots: false, trend: [] };
  }

  const toDateKey = (iso: string) => iso.substring(0, 10);
  const dateTotals: Record<string, number> = {};
  snapshots.forEach((s: any) => {
    const dk = toDateKey(s.snapshot_date);
    dateTotals[dk] = (dateTotals[dk] || 0) + (s.total_failures || 0);
  });

  const sortedDates = Object.keys(dateTotals).sort();
  let resolved = 0;
  let newCases = 0;
  let hasSnapshots = false;

  if (sortedDates.length >= 2) {
    hasSnapshots = true;
    const latest = dateTotals[sortedDates[sortedDates.length - 1]];
    const previous = dateTotals[sortedDates[sortedDates.length - 2]];
    resolved = Math.max(0, previous - latest);
    newCases = Math.max(0, latest - previous);
  }

  const trend: TrendPoint[] = sortedDates.map((dk) => ({
    date: new Date(dk).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    total: dateTotals[dk],
  }));

  return { resolved, newCases, hasSnapshots, trend };
}

// ─── Platform aggregation helper ─────────────────────────────────────────────
function aggregatePlatforms(records: PasswordFailureRecord[]): PlatformData[] {
  const counts: Record<string, number> = {};
  records.forEach((r) => {
    const name = r.platform_name || "Unknown";
    counts[name] = (counts[name] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, value], i) => ({
      name: truncate(name, 25),
      value,
      fill: PLATFORM_COLORS[i % PLATFORM_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function PasswordSafeProvider({ children }: { children: ReactNode }) {
  const { isGlobalAdmin, zoneRoles } = useAuth();

  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<Zone[]>([]);
  const [failureRecords, setFailureRecords] = useState<PasswordFailureRecord[]>([]);
  const [automanageRecords, setAutomanageRecords] = useState<PasswordFailureRecord[]>([]);
  const [failureSnapshots, setFailureSnapshots] = useState<any[]>([]);
  const [automanageSnapshots, setAutomanageSnapshots] = useState<any[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [failRes, autoRes, zonesRes, failSnaps, autoSnaps] = await Promise.all([
        api.get("/password-failures?record_type=failure&limit=50000"),
        api.get("/password-failures?record_type=automanage_disabled&limit=50000"),
        api.get("/zones"),
        api.get("/password-failures/snapshots?record_type=failure"),
        api.get("/password-failures/snapshots?record_type=automanage_disabled"),
      ]);

      const allFailures: PasswordFailureRecord[] = failRes.data || failRes || [];
      const allAutomanage: PasswordFailureRecord[] = autoRes.data || autoRes || [];
      const allZones: Zone[] = zonesRes || [];

      // Access control
      let accessibleFailures = allFailures;
      let accessibleAutomanage = allAutomanage;
      if (!isGlobalAdmin) {
        const accessibleZoneIds = zoneRoles.map((z) => z.zoneId);
        accessibleFailures = allFailures.filter((r) => r.zone_id && accessibleZoneIds.includes(r.zone_id));
        accessibleAutomanage = allAutomanage.filter((r) => r.zone_id && accessibleZoneIds.includes(r.zone_id));
      }

      setZones(allZones);
      setFailureRecords(accessibleFailures);
      setAutomanageRecords(accessibleAutomanage);
      setFailureSnapshots(failSnaps || []);
      setAutomanageSnapshots(autoSnaps || []);
    } catch (error) {
      console.error("Error fetching password safe data:", error);
    } finally {
      setLoading(false);
    }
  }, [isGlobalAdmin, zoneRoles]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Memoized aggregations ─────────────────────────────────────────────
  const zoneCodeMap = useMemo(() => {
    const map: Record<string, { code: string; name: string }> = {};
    zones.forEach((z) => {
      map[z.id] = { code: z.code, name: z.name };
    });
    return map;
  }, [zones]);

  const failureSnapshotData = useMemo(() => processSnapshots(failureSnapshots), [failureSnapshots]);
  const automanageSnapshotData = useMemo(() => processSnapshots(automanageSnapshots), [automanageSnapshots]);

  // Zone aggregation
  const byZone = useMemo<ZoneAggregation[]>(() => {
    const map: Record<string, ZoneAggregation> = {};
    zones.forEach((z) => {
      map[z.id] = { zoneId: z.id, zoneCode: z.code, zoneName: z.name, failures: 0, automanageDisabled: 0, total: 0 };
    });
    failureRecords.forEach((r) => {
      if (r.zone_id && map[r.zone_id]) {
        map[r.zone_id].failures++;
        map[r.zone_id].total++;
      }
    });
    automanageRecords.forEach((r) => {
      if (r.zone_id && map[r.zone_id]) {
        map[r.zone_id].automanageDisabled++;
        map[r.zone_id].total++;
      }
    });
    return Object.values(map)
      .filter((z) => z.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [zones, failureRecords, automanageRecords]);

  // Platform aggregation
  const failuresByPlatform = useMemo(() => aggregatePlatforms(failureRecords), [failureRecords]);
  const automanageByPlatform = useMemo(() => aggregatePlatforms(automanageRecords), [automanageRecords]);

  // Global top systems (failures)
  const globalTopSystems = useMemo<SystemData[]>(() => {
    const counts: Record<string, number> = {};
    failureRecords.forEach((r) => {
      const name = r.system_name || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name: truncate(name, 20), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [failureRecords]);

  // ─── Drilldown helpers ─────────────────────────────────────────────────
  const getZoneFailures = useCallback(
    (zoneId: string) => failureRecords.filter((r) => r.zone_id === zoneId).length,
    [failureRecords]
  );

  const getZoneAutomanage = useCallback(
    (zoneId: string) => automanageRecords.filter((r) => r.zone_id === zoneId).length,
    [automanageRecords]
  );

  const getZonePlatformBreakdown = useCallback(
    (zoneId: string): PlatformData[] => {
      const zoneFailures = failureRecords.filter((r) => r.zone_id === zoneId);
      const zoneAutomanage = automanageRecords.filter((r) => r.zone_id === zoneId);
      const all = [...zoneFailures, ...zoneAutomanage];
      return aggregatePlatforms(all);
    },
    [failureRecords, automanageRecords]
  );

  const getZoneWorkgroupBreakdown = useCallback(
    (zoneId: string): WorkgroupData[] => {
      const counts: Record<string, { failures: number; automanage: number }> = {};
      failureRecords
        .filter((r) => r.zone_id === zoneId)
        .forEach((r) => {
          const name = r.workgroup_name || "Unknown";
          if (!counts[name]) counts[name] = { failures: 0, automanage: 0 };
          counts[name].failures++;
        });
      automanageRecords
        .filter((r) => r.zone_id === zoneId)
        .forEach((r) => {
          const name = r.workgroup_name || "Unknown";
          if (!counts[name]) counts[name] = { failures: 0, automanage: 0 };
          counts[name].automanage++;
        });
      return Object.entries(counts)
        .map(([name, data]) => ({ name: truncate(name, 25), ...data }))
        .sort((a, b) => b.failures + b.automanage - (a.failures + a.automanage))
        .slice(0, 10);
    },
    [failureRecords, automanageRecords]
  );

  const getZoneTopSystems = useCallback(
    (zoneId: string): SystemData[] => {
      const counts: Record<string, number> = {};
      [...failureRecords, ...automanageRecords]
        .filter((r) => r.zone_id === zoneId)
        .forEach((r) => {
          const name = r.system_name || "Unknown";
          counts[name] = (counts[name] || 0) + 1;
        });
      return Object.entries(counts)
        .map(([name, count]) => ({ name: truncate(name, 20), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    [failureRecords, automanageRecords]
  );

  const value = useMemo<PasswordSafeContextValue>(
    () => ({
      loading,
      zones,
      selectedZoneId,
      setSelectedZoneId,
      failureRecords,
      totalFailures: failureRecords.length,
      failuresResolved: failureSnapshotData.resolved,
      failuresNewCases: failureSnapshotData.newCases,
      failuresNetChange: failureSnapshotData.hasSnapshots
        ? failureSnapshotData.newCases - failureSnapshotData.resolved
        : null,
      failuresHasSnapshots: failureSnapshotData.hasSnapshots,
      failuresTrend: failureSnapshotData.trend,
      automanageRecords,
      totalAutomanage: automanageRecords.length,
      automanageResolved: automanageSnapshotData.resolved,
      automanageNewCases: automanageSnapshotData.newCases,
      automanageHasSnapshots: automanageSnapshotData.hasSnapshots,
      byZone,
      failuresByPlatform,
      automanageByPlatform,
      getZoneFailures,
      getZoneAutomanage,
      getZonePlatformBreakdown,
      getZoneWorkgroupBreakdown,
      getZoneTopSystems,
      globalTopSystems,
      refetch: fetchData,
    }),
    [
      loading, zones, selectedZoneId, failureRecords, automanageRecords,
      failureSnapshotData, automanageSnapshotData,
      byZone, failuresByPlatform, automanageByPlatform,
      getZoneFailures, getZoneAutomanage, getZonePlatformBreakdown,
      getZoneWorkgroupBreakdown, getZoneTopSystems, globalTopSystems, fetchData,
    ]
  );

  return <PasswordSafeContext.Provider value={value}>{children}</PasswordSafeContext.Provider>;
}

export function usePasswordSafe() {
  const ctx = useContext(PasswordSafeContext);
  if (!ctx) throw new Error("usePasswordSafe must be used within PasswordSafeProvider");
  return ctx;
}
