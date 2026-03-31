import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw, Database, Check, AlertCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { ptBR, enUS } from "date-fns/locale";

interface SyncStatus {
  resource_type: string;
  last_sync_at: string | null;
  items_count: number;
  status: string;
  error_message: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  platforms: "Platforms",
  workgroups: "Workgroups",
  functional_accounts: "Functional Accounts",
  quick_rules: "Quick Rules",
  password_policies: "Password Policies",
};

export function BeyondTrustSyncButton() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: syncStatuses, refetch } = useQuery({
    queryKey: ["bt-sync-status"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return data as SyncStatus[];
    },
    refetchInterval: isSyncing ? 2000 : false,
  });

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      toast({
        title: t("beyondTrust.sync.starting"),
        description: t("beyondTrust.sync.startingDesc"),
      });

      await api.post('/beyondtrust/sync-cache', { resource_type: "all" });

      // Refetch status and cache data
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["bt-cache"] });

      toast({
        title: t("beyondTrust.sync.completed"),
        description: t("beyondTrust.sync.completedDesc"),
      });
    } catch (err) {
      console.error("[BeyondTrustSyncButton] Sync error:", err);
      toast({
        title: t("beyondTrust.sync.error"),
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check className="h-3 w-3 text-success" />;
      case "syncing":
        return <RefreshCw className="h-3 w-3 animate-spin text-primary" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return t("beyondTrust.sync.never");
    try {
      return formatDistanceToNow(new Date(dateStr), {
        addSuffix: true,
        locale: i18n.language === "pt-BR" ? ptBR : enUS,
      });
    } catch {
      return t("beyondTrust.sync.never");
    }
  };

  const totalItems = syncStatuses?.reduce((sum, s) => sum + (s.items_count || 0), 0) || 0;
  const hasErrors = syncStatuses?.some(s => s.status === "error");
  const allSynced = syncStatuses?.every(s => s.status === "completed");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={isSyncing}
        >
          <Database className="h-4 w-4" />
          {isSyncing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t("beyondTrust.sync.syncing")}
            </>
          ) : (
            <>
              {t("beyondTrust.sync.cache")}
              <Badge variant={hasErrors ? "destructive" : allSynced ? "default" : "secondary"} className="ml-1">
                {totalItems}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{t("beyondTrust.sync.cacheStatus")}</h4>
            <Button size="sm" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
              {t("beyondTrust.sync.syncNow")}
            </Button>
          </div>

          <div className="space-y-2">
            {syncStatuses?.map((status) => (
              <div
                key={status.resource_type}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(status.status)}
                  <span className="text-sm font-medium">
                    {RESOURCE_LABELS[status.resource_type] || status.resource_type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {status.items_count || 0}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatLastSync(status.last_sync_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {hasErrors && (
            <div className="text-xs text-destructive">
              {t("beyondTrust.sync.hasErrors")}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
