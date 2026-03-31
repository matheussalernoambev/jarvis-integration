import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BeyondTrustApi } from "@/lib/beyondtrust-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Brain, Users } from "lucide-react";

interface SmartRule {
  SmartRuleID: number;
  Name: string;
  Title: string;
  Description: string;
  Category: string;
}

interface ManagedAccount {
  ManagedAccountID: number;
  AccountName: string;
  DomainName: string;
}

export const SmartRulesTab = () => {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: rules, isLoading, error } = useQuery({
    queryKey: ["beyondtrust", "smart-rules"],
    queryFn: () => BeyondTrustApi.getSmartRules(),
  });

  const { data: managedAccounts, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ["beyondtrust", "smartrule-accounts", expandedId],
    queryFn: () => BeyondTrustApi.getSmartRuleManagedAccounts(String(expandedId)),
    enabled: expandedId !== null,
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

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Erro ao carregar Smart Rules</CardTitle>
          <CardDescription>{String(error)}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rulesList = Array.isArray(rules) ? rules : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Smart Rules
          </CardTitle>
          <CardDescription>
            Regras dinâmicas que agrupam contas automaticamente baseado em critérios definidos.
            Smart Rules são gerenciadas diretamente na console BeyondTrust.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rulesList.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhuma Smart Rule encontrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesList.map((rule: SmartRule) => (
                  <>
                    <TableRow key={rule.SmartRuleID}>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpandedId(expandedId === rule.SmartRuleID ? null : rule.SmartRuleID)}
                        >
                          {expandedId === rule.SmartRuleID ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{rule.Name || rule.Title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{rule.Category || "Geral"}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{rule.Description || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{rule.SmartRuleID}</Badge>
                      </TableCell>
                    </TableRow>
                    {expandedId === rule.SmartRuleID && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <div className="p-4">
                            <h4 className="font-medium mb-2 flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Managed Accounts nesta Smart Rule
                            </h4>
                            {isLoadingAccounts ? (
                              <Skeleton className="h-20 w-full" />
                            ) : Array.isArray(managedAccounts) && managedAccounts.length > 0 ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {(managedAccounts as ManagedAccount[]).slice(0, 12).map((acc) => (
                                  <Badge key={acc.ManagedAccountID} variant="secondary">
                                    {acc.DomainName ? `${acc.DomainName}\\` : ""}{acc.AccountName}
                                  </Badge>
                                ))}
                                {(managedAccounts as ManagedAccount[]).length > 12 && (
                                  <Badge variant="outline">
                                    +{(managedAccounts as ManagedAccount[]).length - 12} mais
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Nenhuma conta nesta Smart Rule.
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
