import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cpu, Network, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

interface Platform {
  platform_id: number;
  name: string;
  platform_type: string | null;
  port_number: number | null;
  supports_password_management: boolean;
  supports_session_management: boolean;
}

export const PlatformsTab = () => {
  const { t } = useTranslation();

  // Load from cache
  const { data: platforms, isLoading, error } = useQuery({
    queryKey: ["bt-cache", "platforms"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/cache/platforms');
      return data as Platform[];
    },
  });

  // Load sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["bt-sync-status", "platforms"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return (data as any[]).find((s: any) => s.resource_type === "platforms") || null;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const isEmpty = !platforms || platforms.length === 0;
  const needsSync = syncStatus?.status === "pending" || !syncStatus?.last_sync_at;

  if (error || (isEmpty && !needsSync)) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t("beyondTrust.errors.loadPlatforms")}</CardTitle>
          <CardDescription>{error ? String(error) : t("beyondTrust.platforms.empty")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isEmpty && needsSync) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            {t("beyondTrust.sync.needsSync")}
          </CardTitle>
          <CardDescription>
            {t("beyondTrust.sync.needsSyncDesc")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Group by type
  const groupedPlatforms = (platforms || []).reduce((acc: Record<string, Platform[]>, platform) => {
    const type = platform.platform_type || "Other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(platform);
    return acc;
  }, {} as Record<string, Platform[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-3">
            <Cpu className="h-5 w-5" />
            {t("beyondTrust.platforms.title")}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("beyondTrust.platforms.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {(Object.entries(groupedPlatforms) as [string, Platform[]][]).map(([type, typePlatforms]) => (
              <div key={type}>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="default">{type}</Badge>
                  <span className="text-sm text-muted-foreground">({typePlatforms.length})</span>
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("beyondTrust.platforms.id")}</TableHead>
                      <TableHead>{t("beyondTrust.platforms.name")}</TableHead>
                      <TableHead>{t("beyondTrust.platforms.port")}</TableHead>
                      <TableHead>{t("beyondTrust.platforms.features")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typePlatforms.map((platform) => (
                      <TableRow key={platform.platform_id}>
                        <TableCell className="py-4">
                          <Badge variant="outline" className="font-mono">
                            {platform.platform_id}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium py-4">
                          <div className="flex items-center gap-3">
                            <Cpu className="h-4 w-4 text-muted-foreground" />
                            {platform.name}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          {platform.port_number ? (
                            <div className="flex items-center gap-1">
                              <Network className="h-3 w-3 text-muted-foreground" />
                              <span>{platform.port_number}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex gap-2">
                            {platform.supports_password_management && (
                              <Badge variant="secondary" className="text-xs">Password</Badge>
                            )}
                            {platform.supports_session_management && (
                              <Badge variant="secondary" className="text-xs">Session</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm">{t("beyondTrust.platforms.commonMappings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Windows Server</p>
              <p className="text-muted-foreground">Platform ID: 1, 3</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Linux/Unix (SSH)</p>
              <p className="text-muted-foreground">Platform ID: 2</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Active Directory</p>
              <p className="text-muted-foreground">Platform ID: 25</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">SQL Server</p>
              <p className="text-muted-foreground">Platform ID: 8</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">Oracle</p>
              <p className="text-muted-foreground">Platform ID: 9</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium">MySQL</p>
              <p className="text-muted-foreground">Platform ID: 10</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
