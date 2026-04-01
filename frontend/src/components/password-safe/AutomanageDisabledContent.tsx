import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import AutomanageDashboard from "./AutomanageDashboard";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  Search,
  Download,
  RefreshCw,
  Server,
  Key,
  Filter,
  ToggleLeft
} from "lucide-react";

interface AutomanageRecord {
  id: string;
  zone_id: string | null;
  account_name: string;
  system_name: string | null;
  platform_name: string | null;
  workgroup_name: string | null;
  domain_name: string | null;
  last_change_result: string | null;
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

export default function AutomanageDisabledContent() {
  const { t, i18n } = useTranslation();
  const { isGlobalAdmin, zoneRoles, hasZoneAccess } = useAuth();

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AutomanageRecord[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneStats, setZoneStats] = useState<ZoneStats[]>([]);
  
  const [syncing, setSyncing] = useState(false);
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
      const [allRecords, allZones] = await Promise.all([
        api.get<AutomanageRecord[]>('/password-failures?record_type=automanage_disabled'),
        api.get<Zone[]>('/zones'),
      ]);

      let accessibleRecords = allRecords;
      if (!isGlobalAdmin) {
        const accessibleZoneIds = zoneRoles.map(z => z.zoneId);
        accessibleRecords = allRecords.filter(r => 
          r.zone_id && accessibleZoneIds.includes(r.zone_id)
        );
      }

      setRecords(accessibleRecords as any);
      setZones(allZones);

      const stats: Record<string, ZoneStats> = {};
      accessibleRecords.forEach(r => {
        if (r.zone_id) {
          const zone = allZones.find(z => z.id === r.zone_id);
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

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/password-failures/sync-managed-accounts');
      if (result.success) {
        toast.success(t("passwordFailures.syncManagedSuccess"));
      } else {
        toast.error(result.error || t("passwordFailures.syncManagedError"));
      }
      await fetchData();
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error(t("passwordFailures.syncManagedError"));
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCSV = () => {
    window.open(`${API_BASE}/password-failures/export?format=csv&record_type=automanage_disabled`, '_blank');
  };

  const getFilteredRecords = () => {
    return records.filter(r => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          r.account_name.toLowerCase().includes(search) ||
          (r.system_name?.toLowerCase().includes(search)) ||
          (r.domain_name?.toLowerCase().includes(search));
        if (!matchesSearch) return false;
      }
      if (selectedZone !== "all" && r.zone_id !== selectedZone) return false;
      if (selectedPlatform !== "all" && r.platform_name !== selectedPlatform) return false;
      return true;
    });
  };

  const uniquePlatforms = [...new Set(records.map(r => r.platform_name).filter(Boolean))];
  const filteredRecords = getFilteredRecords();
  const totalRecords = records.length;

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedRecords = filteredRecords.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const showingFrom = filteredRecords.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const showingTo = Math.min(safeCurrentPage * pageSize, filteredRecords.length);

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
      {/* Dashboard */}
      <AutomanageDashboard />

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
          <Button variant="outline" onClick={handleExportCSV} disabled={filteredRecords.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {t("passwordFailures.export")}
          </Button>
          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("passwordFailures.syncInProgress") : t("passwordFailures.syncFromApi")}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("automanageDisabled.totalDisabled")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{totalRecords}</div>
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
                  placeholder={t("automanageDisabled.searchPlaceholder")}
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
                <TableHead>{t("automanageDisabled.domain")}</TableHead>
                <TableHead>{t("passwordFailures.zone")}</TableHead>
                <TableHead>{t("passwordFailures.platform")}</TableHead>
                <TableHead>{t("automanageDisabled.workgroup")}</TableHead>
                <TableHead>{t("automanageDisabled.lastResult")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {totalRecords === 0 
                      ? t("automanageDisabled.noRecords") 
                      : t("passwordFailures.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRecords.map((record) => {
                  const zone = zones.find(z => z.id === record.zone_id);
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{record.account_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span>{record.system_name || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{record.domain_name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        {zone ? (
                          <Badge variant="outline">{zone.code}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{record.platform_name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{record.workgroup_name || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <ToggleLeft className="h-3 w-3" />
                          {record.last_change_result || t("automanageDisabled.disabled")}
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
            {t("pagination.showing", { from: showingFrom, to: showingTo, total: filteredRecords.length })}
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
