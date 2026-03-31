import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Key, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface FunctionalAccount {
  functional_account_id: number;
  display_name: string;
  account_name: string;
  domain_name: string | null;
  platform_id: number | null;
  description: string | null;
}

export const FunctionalAccountsTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load from cache
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ["bt-cache", "functional-accounts"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/cache/functional-accounts');
      return data as FunctionalAccount[];
    },
  });

  // Load sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["bt-sync-status", "functional_accounts"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return (data as any[]).find((s: any) => s.resource_type === "functional_accounts") || null;
    },
  });

  // Load current setting
  useQuery({
    queryKey: ["onboarding-settings", "functional-account"],
    queryFn: async () => {
      const data = await api.get('/onboarding-settings');
      if (data?.functional_account) {
        setSelectedId(data.functional_account);
      }
      return data;
    },
  });

  const handleSelectForOnboarding = async (account: FunctionalAccount) => {
    try {
      await api.put('/onboarding-settings', { functional_account: String(account.functional_account_id) });

      setSelectedId(String(account.functional_account_id));
      toast({
        title: t("beyondTrust.functionalAccounts.selectedSuccess"),
        description: `${account.display_name} ${t("beyondTrust.functionalAccounts.selectedDesc")}`,
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

  const isEmpty = !accounts || accounts.length === 0;
  const needsSync = syncStatus?.status === "pending" || !syncStatus?.last_sync_at;

  if (error || (isEmpty && !needsSync)) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t("beyondTrust.errors.loadFunctionalAccounts")}</CardTitle>
          <CardDescription>{error ? String(error) : t("beyondTrust.functionalAccounts.empty")}</CardDescription>
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
            <Key className="h-5 w-5" />
            {t("beyondTrust.functionalAccounts.title")}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("beyondTrust.functionalAccounts.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("beyondTrust.functionalAccounts.name")}</TableHead>
                <TableHead>{t("beyondTrust.functionalAccounts.account")}</TableHead>
                <TableHead>{t("beyondTrust.functionalAccounts.domain")}</TableHead>
                <TableHead>{t("beyondTrust.functionalAccounts.platformId")}</TableHead>
                <TableHead className="text-right">{t("beyondTrust.functionalAccounts.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((account) => (
                <TableRow 
                  key={account.functional_account_id}
                  className={selectedId === String(account.functional_account_id) ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-medium py-4">
                    <div className="flex items-center gap-3">
                      {account.display_name}
                      {selectedId === String(account.functional_account_id) && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("common.selected")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">{account.account_name}</TableCell>
                  <TableCell className="py-4">{account.domain_name || "-"}</TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline">{account.platform_id || "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-right py-4">
                    <Button
                      size="sm"
                      variant={selectedId === String(account.functional_account_id) ? "secondary" : "default"}
                      onClick={() => handleSelectForOnboarding(account)}
                      disabled={selectedId === String(account.functional_account_id)}
                    >
                      {selectedId === String(account.functional_account_id) 
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
