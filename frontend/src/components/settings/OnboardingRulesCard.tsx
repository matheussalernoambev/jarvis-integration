import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AddOnboardingRuleDialog } from "./AddOnboardingRuleDialog";
import { getPlatformName } from "@/lib/platform-mappings";
import { Plus, Pencil, Trash2, User, Server, AlertCircle, Loader2, Zap, Globe, Monitor, KeyRound, FolderOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OnboardingRule {
  id: string;
  zone_id: string;
  name: string;
  os_group: string;
  domain_type: 'any' | 'standalone' | 'domain_joined';
  managed_system_platform_id: number;
  managed_system_platform_name: string | null;
  functional_account_id: string;
  functional_account_name: string | null;
  functional_account_platform_id: number | null;
  account_names: string[];
  is_default: boolean;
  quick_rule_id: string | null;
  quick_rule_name: string | null;
  password_policy_id: number | null;
  password_policy_name: string | null;
  workgroup_id: string | null;
  workgroup_name: string | null;
}

interface OnboardingRulesCardProps {
  zoneId: string;
  zoneCode: string;
}

export function OnboardingRulesCard({ zoneId, zoneCode }: OnboardingRulesCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OnboardingRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<OnboardingRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch rules for this zone
  const { data: rules, isLoading, error } = useQuery({
    queryKey: ["onboarding-rules", zoneId],
    queryFn: async () => {
      return api.get<OnboardingRule[]>('/zones/' + zoneId + '/onboarding-rules');
    },
    enabled: !!zoneId,
  });

  const handleAddRule = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const handleEditRule = (rule: OnboardingRule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const handleDeleteClick = (rule: OnboardingRule) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!ruleToDelete) return;

    setDeleting(true);
    try {
      await api.delete('/zones/' + zoneId + '/onboarding-rules/' + ruleToDelete.id);

      toast({ title: "Sucesso", description: "Regra excluída com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["onboarding-rules", zoneId] });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao excluir regra",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    }
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["onboarding-rules", zoneId] });
  };

  const getOsBadgeVariant = (osGroup: string) => {
    switch (osGroup) {
      case "windows": return "default";
      case "linux": return "secondary";
      case "sqlServer": return "outline";
      default: return "outline";
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Regras de Onboarding
              </CardTitle>
              <CardDescription>
                Configure regras específicas para cada tipo de sistema operacional
              </CardDescription>
            </div>
            <Button onClick={handleAddRule}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Regra
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Erro ao carregar regras</AlertDescription>
            </Alert>
          ) : !rules || rules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma regra configurada</p>
              <p className="text-sm mt-1">
                Adicione regras para Windows, Linux ou outros tipos de OS
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {rules.map((rule) => (
                <Card key={rule.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium">{rule.name}</h4>
                          <Badge variant={getOsBadgeVariant(rule.os_group)}>
                            {rule.managed_system_platform_name || getPlatformName(rule.managed_system_platform_id)}
                          </Badge>
                          {rule.domain_type && rule.domain_type !== 'any' && (
                            <Badge 
                              variant={rule.domain_type === 'domain_joined' ? 'default' : 'outline'}
                              className={rule.domain_type === 'domain_joined' 
                                ? 'bg-primary/10 text-primary border-primary' 
                                : 'text-muted-foreground'}
                            >
                              {rule.domain_type === 'domain_joined' ? (
                                <><Globe className="h-3 w-3 mr-1" />Domínio</>
                              ) : (
                                <><Monitor className="h-3 w-3 mr-1" />Standalone</>
                              )}
                            </Badge>
                          )}
                        </div>

                        {/* Workgroup */}
                        {rule.workgroup_name && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <FolderOpen className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Workgroup:</span>
                            <Badge variant="secondary" className="text-xs">
                              {rule.workgroup_name}
                            </Badge>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Functional Account:</span>
                            <p className="font-medium">
                              {rule.functional_account_name || rule.functional_account_id}
                            </p>
                            {rule.functional_account_platform_id && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {getPlatformName(rule.functional_account_platform_id)}
                              </Badge>
                            )}
                          </div>
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Usuários:
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {rule.account_names.map((name) => (
                                <Badge key={name} variant="secondary" className="text-xs">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Quick Rule */}
                        {rule.quick_rule_name && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Zap className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Quick Rule:</span>
                            <Badge variant="secondary" className="text-xs">
                              {rule.quick_rule_name}
                            </Badge>
                          </div>
                        )}

                        {/* Password Policy */}
                        {rule.password_policy_name && (
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <KeyRound className="h-4 w-4 text-primary" />
                            <span className="text-sm text-muted-foreground">Password Policy:</span>
                            <Badge variant="secondary" className="text-xs">
                              {rule.password_policy_name}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditRule(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(rule)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddOnboardingRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        zoneId={zoneId}
        zoneCode={zoneCode}
        existingRule={editingRule}
        onSaved={handleSaved}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a regra "{ruleToDelete?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
