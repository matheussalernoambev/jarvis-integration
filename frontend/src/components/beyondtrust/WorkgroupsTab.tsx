import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderTree, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface Workgroup {
  workgroup_id: number;
  name: string;
}

export const WorkgroupsTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load from cache
  const { data: workgroups, isLoading, error } = useQuery({
    queryKey: ["bt-cache", "workgroups"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/cache/workgroups');
      return data as Workgroup[];
    },
  });

  // Load sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["bt-sync-status", "workgroups"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return (data as any[]).find((s: any) => s.resource_type === "workgroups") || null;
    },
  });

  // Load current setting
  useQuery({
    queryKey: ["onboarding-settings", "workgroup"],
    queryFn: async () => {
      const data = await api.get('/onboarding-settings');
      if (data?.workgroup) {
        setSelectedId(data.workgroup);
      }
      return data;
    },
  });

  const handleSelectForOnboarding = async (workgroup: Workgroup) => {
    const id = String(workgroup.workgroup_id);
    try {
      await api.put('/onboarding-settings', { workgroup: id });

      setSelectedId(id);
      toast({
        title: t("beyondTrust.workgroups.selectedSuccess"),
        description: `${workgroup.name} ${t("beyondTrust.workgroups.selectedDesc")}`,
      });
    } catch (err) {
      toast({
        title: t("beyondTrust.errors.saveError"),
        description: String(err),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const isEmpty = !workgroups || workgroups.length === 0;
  const needsSync = syncStatus?.status === "pending" || !syncStatus?.last_sync_at;

  if (error || (isEmpty && !needsSync)) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t("beyondTrust.errors.loadWorkgroups")}</CardTitle>
          <CardDescription>{error ? String(error) : t("beyondTrust.workgroups.empty")}</CardDescription>
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-3">
            <FolderTree className="h-5 w-5" />
            {t("beyondTrust.workgroups.title")}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("beyondTrust.workgroups.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("beyondTrust.workgroups.name")}</TableHead>
                <TableHead>{t("beyondTrust.workgroups.id")}</TableHead>
                <TableHead className="text-right">{t("beyondTrust.workgroups.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workgroups?.map((wg) => (
                <TableRow 
                  key={wg.workgroup_id}
                  className={selectedId === String(wg.workgroup_id) ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-medium py-4">
                    <div className="flex items-center gap-3">
                      <FolderTree className="h-4 w-4 text-muted-foreground" />
                      {wg.name}
                      {selectedId === String(wg.workgroup_id) && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("common.selected")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline">{wg.workgroup_id}</Badge>
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <Button
                      size="sm"
                      variant={selectedId === String(wg.workgroup_id) ? "secondary" : "default"}
                      onClick={() => handleSelectForOnboarding(wg)}
                      disabled={selectedId === String(wg.workgroup_id)}
                    >
                      {selectedId === String(wg.workgroup_id) 
                        ? t("common.selected") 
                        : t("common.useForOnboarding")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
