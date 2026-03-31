import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { toast } from "sonner";
import { 
  RefreshCw, 
  Search, 
  Download, 
  Clock,
  Server,
  Key,
  Filter
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface PasswordFailure {
  id: string;
  zone_id: string | null;
  managed_account_id: number;
  account_name: string;
  managed_system_id: number | null;
  system_name: string | null;
  platform_name: string | null;
  workgroup_name: string | null;
  last_change_attempt: string | null;
  last_change_result: string | null;
  failure_reason: string | null;
  failure_count: number;
  first_failure_at: string;
  synced_at: string;
}

interface Zone {
  id: string;
  code: string;
  name: string;
}

interface ZoneStats {
  zoneId: string;
  zoneCode: string;
  count: number;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 400];

function getPaginationPages(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > 3) pages.push("ellipsis");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("ellipsis");
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export default function PasswordFailuresContent() {
  const { t, i18n } = useTranslation();
  const { isGlobalAdmin, zoneRoles, hasZoneAccess } = useAuth();
  const dateLocale = i18n.language === "pt-BR" ? ptBR : enUS;

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [failures, setFailures] = useState<PasswordFailure[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [failuresResponse, allZones] = await Promise.all([
        api.get('/password-failures?record_type=failure&limit=10000'),
        api.get('/zones'),
      ]);

      const allFailures = failuresResponse.data || failuresResponse || [];

      let accessibleFailures = allFailures;
      if (!isGlobalAdmin) {
        const accessibleZoneIds = zoneRoles.map(z => z.zoneId);
        accessibleFailures = allFailures.filter(f => 
          f.zone_id && accessibleZoneIds.includes(f.zone_id)
        );
      }

      setFailures(accessibleFailures as any);
      setZones(allZones);

      const stats: Record<string, ZoneStats> = {};
      accessibleFailures.forEach(f => {
        if (f.zone_id) {
          const zone = allZones.find(z => z.id === f.zone_id);
          if (zone) {
            if (!stats[zone.id]) {
              stats[zone.id] = { zoneId: zone.id, zoneCode: zone.code, count: 0 };
            }
            stats[zone.id].count++;
          }
        }
      });
      setZoneStats(Object.values(stats).sort((a, b) => b.count - a.count));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t("passwordFailures.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/password-failures/sync');
      toast.success(t("passwordFailures.syncSuccess"));
      await fetchData();
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error(t("passwordFailures.syncError"));
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCSV = () => {
    const filteredData = getFilteredFailures();
    const headers = ["Account", "System", "Zone", "Platform", "Error", "First Failure", "Attempts"];
    const rows = filteredData.map(f => [
      f.account_name,
      f.system_name || "",
      zones.find(z => z.id === f.zone_id)?.code || "",
      f.platform_name || "",
      f.failure_reason || "",
      f.first_failure_at,
      f.failure_count.toString(),
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `password-failures-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFilteredFailures = () => {
    return failures.filter(f => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          f.account_name.toLowerCase().includes(search) ||
          (f.system_name?.toLowerCase().includes(search)) ||
          (f.failure_reason?.toLowerCase().includes(search));
        if (!matchesSearch) return false;
      }
      if (selectedZone !== "all" && f.zone_id !== selectedZone) return false;
      if (selectedPlatform !== "all" && f.platform_name !== selectedPlatform) return false;
      return true;
    });
  };

  const uniquePlatforms = [...new Set(failures.map(f => f.platform_name).filter(Boolean))];
  const filteredFailures = getFilteredFailures();
  const totalFailures = failures.length;

  // Pagination
  const totalPages = Math.ceil(filteredFailures.length / pageSize);
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedFailures = filteredFailures.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const showingFrom = filteredFailures.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const showingTo = Math.min(safeCurrentPage * pageSize, filteredFailures.length);

  if (loading) {
    return (
      <div className="space-y-6 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Actions + Page Size */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("pagination.rowsPerPage")}:</span>
          <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={filteredFailures.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("passwordFailures.export")}
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("common.loading") : t("passwordFailures.sync")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("passwordFailures.totalFailures")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{totalFailures}</div>
          </CardContent>
        </Card>
        
        {zoneStats.map(stat => (
          <Card key={stat.zoneId}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.zoneCode}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.count}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {t("passwordFailures.filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("passwordFailures.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedZone} onValueChange={(v) => { setSelectedZone(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("passwordFailures.allZones")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("passwordFailures.allZones")}</SelectItem>
                {zones.filter(z => isGlobalAdmin || hasZoneAccess(z.id)).map(zone => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPlatform} onValueChange={(v) => { setSelectedPlatform(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("passwordFailures.allPlatforms")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("passwordFailures.allPlatforms")}</SelectItem>
                {uniquePlatforms.map(platform => (
                  <SelectItem key={platform} value={platform!}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("passwordFailures.account")}</TableHead>
                <TableHead>{t("passwordFailures.system")}</TableHead>
                <TableHead>{t("passwordFailures.zone")}</TableHead>
                <TableHead>{t("passwordFailures.platform")}</TableHead>
                <TableHead>{t("passwordFailures.error")}</TableHead>
                <TableHead>{t("passwordFailures.since")}</TableHead>
                <TableHead className="text-center">{t("passwordFailures.attempts")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedFailures.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {totalFailures === 0 
                      ? t("passwordFailures.noFailures") 
                      : t("passwordFailures.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedFailures.map((failure) => {
                  const zone = zones.find(z => z.id === failure.zone_id);
                  return (
                    <TableRow key={failure.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{failure.account_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span>{failure.system_name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {zone ? (
                          <Badge variant="outline">{zone.code}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{failure.platform_name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-destructive truncate max-w-[200px] block">
                          {failure.failure_reason || failure.last_change_result || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {failure.first_failure_at ? (
                          <div className="flex items-center gap-1 text-muted-foreground text-sm">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(failure.first_failure_at), { 
                              addSuffix: true, 
                              locale: dateLocale 
                            })}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={failure.failure_count > 5 ? "destructive" : "secondary"}>
                          {failure.failure_count}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t("pagination.showing", { from: showingFrom, to: showingTo, total: filteredFailures.length })}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {getPaginationPages(safeCurrentPage, totalPages).map((page, i) => (
                <PaginationItem key={i}>
                  {page === "ellipsis" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      isActive={page === safeCurrentPage}
                      onClick={() => setCurrentPage(page)}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
