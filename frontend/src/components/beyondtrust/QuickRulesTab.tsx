import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface QuickRule {
  quick_rule_id: number;
  title: string;
  category: string | null;
  description: string | null;
}

export const QuickRulesTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load from cache
  const { data: rules, isLoading, error } = useQuery({
    queryKey: ["bt-cache", "quick-rules"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/cache/quick-rules');
      return data as QuickRule[];
    },
  });

  // Load sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["bt-sync-status", "quick_rules"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return (data as any[]).find((s: any) => s.resource_type === "quick_rules") || null;
    },
  });

  // Load current setting
  useQuery({
    queryKey: ["onboarding-settings", "quickrule"],
    queryFn: async () => {
      const data = await api.get('/onboarding-settings');
      if (data?.quickrule) {
        setSelectedId(data.quickrule);
      }
      return data;
    },
  });

  const handleSelectForOnboarding = async (rule: QuickRule) => {
    try {
      await api.put('/onboarding-settings', { quickrule: String(rule.quick_rule_id) });

      setSelectedId(String(rule.quick_rule_id));
      toast({
        title: t("beyondTrust.quickRules.selectedSuccess"),
        description: `${rule.title} ${t("beyondTrust.quickRules.selectedDesc")}`,
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

  const isEmpty = !rules || rules.length === 0;
  const needsSync = syncStatus?.status === "pending" || !syncStatus?.last_sync_at;

  if (error || (isEmpty && !needsSync)) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t("beyondTrust.errors.loadQuickRules")}</CardTitle>
          <CardDescription>{error ? String(error) : t("beyondTrust.quickRules.empty")}</CardDescription>
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
            <Zap className="h-5 w-5" />
            {t("beyondTrust.quickRules.title")}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("beyondTrust.quickRules.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("beyondTrust.quickRules.titleColumn")}</TableHead>
                <TableHead>{t("beyondTrust.quickRules.category")}</TableHead>
                <TableHead>{t("beyondTrust.quickRules.descriptionColumn")}</TableHead>
                <TableHead className="text-right">{t("beyondTrust.quickRules.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules?.map((rule) => (
                <TableRow 
                  key={rule.quick_rule_id}
                  className={selectedId === String(rule.quick_rule_id) ? "bg-primary/5" : ""}
                >
                  <TableCell className="font-medium py-4">
                    <div className="flex items-center gap-3">
                      {rule.title}
                      {selectedId === String(rule.quick_rule_id) && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("common.selected")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="outline">{rule.category || t("beyondTrust.quickRules.noCategory")}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate py-4">{rule.description || "-"}</TableCell>
                  <TableCell className="text-right py-4">
                    <Button
                      size="sm"
                      variant={selectedId === String(rule.quick_rule_id) ? "secondary" : "default"}
                      onClick={() => handleSelectForOnboarding(rule)}
                      disabled={selectedId === String(rule.quick_rule_id)}
                    >
                      {selectedId === String(rule.quick_rule_id) 
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
