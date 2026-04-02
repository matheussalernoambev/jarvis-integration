import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePasswordSafe } from "@/contexts/PasswordSafeContext";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { PAGE_SIZE_OPTIONS, getPaginationPages } from "@/lib/password-safe-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Filter,
  ToggleLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface DataTableContentProps {
  recordType: "failure" | "automanage_disabled";
}

export default function DataTableContent({ recordType }: DataTableContentProps) {
  const { t, i18n } = useTranslation();
  const { isGlobalAdmin, hasZoneAccess } = useAuth();
  const dateLocale = i18n.language === "pt-BR" ? ptBR : enUS;

  const {
    failureRecords,
    automanageRecords,
    zones,
    selectedZoneId,
    refetch,
    loading,
  } = usePasswordSafe();

  const records = recordType === "failure" ? failureRecords : automanageRecords;

  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Sync zone filter from context drilldown
  const effectiveZoneFilter = selectedZoneId || (selectedZone !== "all" ? selectedZone : null);

  const uniquePlatforms = useMemo(
    () => [...new Set(records.map((r) => r.platform_name).filter(Boolean))] as string[],
    [records]
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesSearch =
          r.account_name.toLowerCase().includes(search) ||
          (r.system_name?.toLowerCase().includes(search)) ||
          (recordType === "failure"
            ? r.failure_reason?.toLowerCase().includes(search)
            : r.domain_name?.toLowerCase().includes(search));
        if (!matchesSearch) return false;
      }
      if (effectiveZoneFilter && r.zone_id !== effectiveZoneFilter) return false;
      if (selectedPlatform !== "all" && r.platform_name !== selectedPlatform) return false;
      return true;
    });
  }, [records, searchTerm, effectiveZoneFilter, selectedPlatform, recordType]);

  // Pagination
  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));
  const paginatedRecords = filteredRecords.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const showingFrom = filteredRecords.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const showingTo = Math.min(safeCurrentPage * pageSize, filteredRecords.length);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await api.post("/password-failures/sync");
      if (result.success) {
        toast.success(t("passwordFailures.syncSuccess"));
      } else {
        toast.error(result.error || t("passwordFailures.syncError"));
      }
      await refetch();
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error(t("passwordFailures.syncError"));
    } finally {
      setSyncing(false);
    }
  };

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const handleExportCSV = () => {
    window.open(`${API_BASE}/password-failures/export?format=csv&record_type=${recordType}`, "_blank");
  };

  const isFailure = recordType === "failure";

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
              {PAGE_SIZE_OPTIONS.map((size) => (
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
          {isFailure && (
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? t("passwordFailures.syncing") : t("passwordFailures.sync")}
            </Button>
          )}
        </div>
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
                  placeholder={isFailure ? t("passwordFailures.searchPlaceholder") : t("automanageDisabled.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            {!selectedZoneId && (
              <Select value={selectedZone} onValueChange={(v) => { setSelectedZone(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t("passwordFailures.allZones")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("passwordFailures.allZones")}</SelectItem>
                  {zones.filter((z) => isGlobalAdmin || hasZoneAccess(z.id)).map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>{zone.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={selectedPlatform} onValueChange={(v) => { setSelectedPlatform(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("passwordFailures.allPlatforms")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("passwordFailures.allPlatforms")}</SelectItem>
                {uniquePlatforms.map((platform) => (
                  <SelectItem key={platform} value={platform}>{platform}</SelectItem>
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
                {!isFailure && <TableHead>{t("automanageDisabled.domain")}</TableHead>}
                <TableHead>{t("passwordFailures.zone")}</TableHead>
                <TableHead>{t("passwordFailures.platform")}</TableHead>
                {isFailure ? (
                  <>
                    <TableHead>{t("passwordFailures.error")}</TableHead>
                    <TableHead>{t("passwordFailures.since")}</TableHead>
                    <TableHead className="text-center">{t("passwordFailures.attempts")}</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>{t("automanageDisabled.workgroup")}</TableHead>
                    <TableHead>{t("automanageDisabled.lastResult")}</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isFailure ? 7 : 7} className="text-center py-8 text-muted-foreground">
                    {records.length === 0
                      ? (isFailure ? t("passwordFailures.noFailures") : t("automanageDisabled.noRecords"))
                      : t("passwordFailures.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRecords.map((record) => {
                  const zone = zones.find((z) => z.id === record.zone_id);
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
                      {!isFailure && (
                        <TableCell>
                          <span className="text-sm">{record.domain_name || "-"}</span>
                        </TableCell>
                      )}
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
                      {isFailure ? (
                        <>
                          <TableCell>
                            <span className="text-sm text-destructive truncate max-w-[200px] block">
                              {record.failure_reason || record.last_change_result || "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {record.first_failure_at ? (
                              <div className="flex items-center gap-1 text-muted-foreground text-sm">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(record.first_failure_at), {
                                  addSuffix: true,
                                  locale: dateLocale,
                                })}
                              </div>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={record.failure_count > 5 ? "destructive" : "secondary"}>
                              {record.failure_count}
                            </Badge>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <span className="text-sm">{record.workgroup_name || "-"}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <ToggleLeft className="h-3 w-3" />
                              {record.last_change_result || t("automanageDisabled.disabled")}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t("pagination.showing", { from: showingFrom, to: showingTo, total: filteredRecords.length })}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
