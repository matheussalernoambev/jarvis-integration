import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Key, AlertCircle, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

interface PasswordPolicy {
  password_rule_id: number;
  name: string;
  description: string | null;
  minimum_length: number | null;
  maximum_length: number | null;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special_chars: boolean;
}

export const PasswordPoliciesTab = () => {
  const { t } = useTranslation();

  // Load from cache
  const { data: policies, isLoading, error } = useQuery({
    queryKey: ["bt-cache", "password-policies"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/cache/policies');
      return data as PasswordPolicy[];
    },
  });

  // Load sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["bt-sync-status", "password-policies"],
    queryFn: async () => {
      const data = await api.get('/beyondtrust/sync-status');
      return (data as any[]).find((s: any) => s.resource_type === "password_policies") || null;
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

  const isEmpty = !policies || policies.length === 0;
  const needsSync = syncStatus?.status === "pending" || !syncStatus?.last_sync_at;

  if (error || (isEmpty && !needsSync)) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">{t("beyondTrust.errors.loadPasswordPolicies")}</CardTitle>
          <CardDescription>{error ? String(error) : t("beyondTrust.passwordPolicies.empty")}</CardDescription>
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

  const RequirementIcon = ({ enabled }: { enabled: boolean }) => (
    enabled ? (
      <Check className="h-4 w-4 text-green-500" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground" />
    )
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-3">
            <Key className="h-5 w-5" />
            {t("beyondTrust.passwordPolicies.title")}
          </CardTitle>
          <CardDescription className="mt-1.5">
            {t("beyondTrust.passwordPolicies.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("beyondTrust.passwordPolicies.id")}</TableHead>
                <TableHead>{t("beyondTrust.passwordPolicies.name")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.minLength")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.maxLength")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.uppercase")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.lowercase")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.numbers")}</TableHead>
                <TableHead className="text-center">{t("beyondTrust.passwordPolicies.special")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(policies || []).map((policy) => (
                <TableRow key={policy.password_rule_id}>
                  <TableCell className="py-4">
                    <Badge variant="outline" className="font-mono">
                      {policy.password_rule_id}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium py-4">
                    <div className="flex items-center gap-3">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div>{policy.name}</div>
                        {policy.description && (
                          <div className="text-xs text-muted-foreground">{policy.description}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-4">
                    {policy.minimum_length ?? "-"}
                  </TableCell>
                  <TableCell className="text-center py-4">
                    {policy.maximum_length ?? "-"}
                  </TableCell>
                  <TableCell className="text-center py-4">
                    <div className="flex justify-center">
                      <RequirementIcon enabled={policy.require_uppercase} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-4">
                    <div className="flex justify-center">
                      <RequirementIcon enabled={policy.require_lowercase} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-4">
                    <div className="flex justify-center">
                      <RequirementIcon enabled={policy.require_numbers} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-4">
                    <div className="flex justify-center">
                      <RequirementIcon enabled={policy.require_special_chars} />
                    </div>
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
