import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BeyondTrustApi } from "@/lib/beyondtrust-api";
import { getPlatformName } from "@/lib/platform-mappings";
import { Loader2, Plus, X, Info, Zap, Eye, ChevronDown, Server, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface Platform {
  platform_id: number;
  name: string;
  short_name?: string | null;
  platform_type?: string | null;
  supports_password_management?: boolean;
}

interface OnboardingRule {
  id?: string;
  zone_id: string;
  name: string;
  os_group: string;
  domain_type: 'any' | 'standalone' | 'domain_joined';
  managed_system_platform_id: number;
  managed_system_platform_name?: string | null;
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

interface AddOnboardingRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string;
  zoneCode: string;
  existingRule?: OnboardingRule | null;
  onSaved: () => void;
}

// Platform types that are compatible with each other for Functional Account selection
const COMPATIBLE_PLATFORM_TYPES: Record<string, string[]> = {
  "Windows": ["Windows", "Active Directory"],
  "Unix": ["Unix"],
  "Database": ["Database"],
  "Other": ["Other"],
};

interface MatchingVM {
  id: string;
  name: string;
  os_type: string;
  domain_status: string;
  onboarding_status: string;
}

export function AddOnboardingRuleDialog({
  open,
  onOpenChange,
  zoneId,
  zoneCode,
  existingRule,
  onSaved,
}: AddOnboardingRuleDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
  const [functionalAccountId, setFunctionalAccountId] = useState("");
  const [accountNames, setAccountNames] = useState<string[]>([""]);
  const [quickRuleId, setQuickRuleId] = useState("none");
  const [domainType, setDomainType] = useState<'any' | 'standalone' | 'domain_joined'>("any");
  const [passwordPolicyId, setPasswordPolicyId] = useState("1");
  const [workgroupId, setWorkgroupId] = useState("");

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [matchingVMs, setMatchingVMs] = useState<MatchingVM[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);

  // Fetch platforms from cache
  const { data: platforms, isLoading: loadingPlatforms } = useQuery({
    queryKey: ["bt-cache", "platforms"],
    queryFn: async () => {
      return api.get('/beyondtrust/platforms');
    },
  });

  // Fetch functional accounts from cache
  const { data: functionalAccounts, isLoading: loadingFAs } = useQuery({
    queryKey: ["bt-cache", "functional-accounts"],
    queryFn: async () => {
      return api.get('/beyondtrust/functional-accounts');
    },
  });

  // Fetch quick rules from cache (filter by zone on client-side)
  const { data: quickRules, isLoading: loadingQuickRules } = useQuery({
    queryKey: ["bt-cache", "quick-rules"],
    queryFn: async () => {
      return api.get('/beyondtrust/quick-rules');
    },
  });

  // Fetch password policies from cache
  const { data: passwordPolicies, isLoading: loadingPolicies } = useQuery({
    queryKey: ["bt-cache", "password-policies"],
    queryFn: async () => {
      return api.get('/beyondtrust/password-policies');
    },
  });

  // Fetch workgroups from cache (filtered by zone code)
  const { data: workgroups, isLoading: loadingWorkgroups } = useQuery({
    queryKey: ["bt-cache", "workgroups"],
    queryFn: async () => {
      return api.get('/beyondtrust/workgroups');
    },
  });

  // Filter workgroups by zone code
  const filteredWorkgroups = useMemo(() => {
    if (!workgroups || !Array.isArray(workgroups)) return [];
    const zoneCodeUpper = zoneCode?.toUpperCase() || "";
    return workgroups.filter((wg: any) => 
      zoneCodeUpper ? wg.name?.toUpperCase().includes(zoneCodeUpper) : true
    );
  }, [workgroups, zoneCode]);

  // Fetch all zone codes for filtering Quick Rules
  const { data: allZoneCodes, isLoading: loadingZoneCodes } = useQuery({
    queryKey: ["zones-codes"],
    queryFn: async () => {
      const data = await api.get<{ code: string }[]>('/zones');
      return data?.map(z => z.code.toUpperCase()) || [];
    },
  });

  // Helper to determine OS filter based on Platform ID
  const getOsFilterForPlatform = (platform: Platform | null): "windows" | "linux" | "database" | "other" => {
    if (!platform) return "other";
    
    const id = platform.platform_id;
    const type = (platform.platform_type || "").toLowerCase();
    const name = (platform.name || "").toLowerCase();
    
    // Known platform IDs from platform-mappings.ts
    if (id === 1 || id === 3 || id === 25) return "windows"; // Windows Server, Workstation, AD
    if (id === 2) return "linux"; // Linux/Unix SSH
    if (id === 8 || id === 9 || id === 10) return "database"; // SQL, Oracle, MySQL
    
    // Fallback by type/name
    if (type === "windows" || name.includes("windows")) return "windows";
    if (type === "unix" || name.includes("linux") || name.includes("unix") || name.includes("ssh")) return "linux";
    if (type === "database" || name.includes("sql") || name.includes("oracle") || name.includes("mysql")) return "database";
    
    return "other";
  };

  // Get OS label for display
  const getOsFilterLabel = (osFilter: string): string => {
    switch (osFilter) {
      case "windows": return "Windows";
      case "linux": return "Linux/Unix";
      case "database": return "Database (qualquer OS)";
      default: return "Outro";
    }
  };

  // Filter Quick Rules by category "managed account" and zone code in title
  const filteredQuickRules = useMemo(() => {
    if (!quickRules || !Array.isArray(quickRules)) return [];
    
    const zoneCodeUpper = zoneCode?.toUpperCase() || "";
    
    return quickRules
      .filter((rule: any) => {
        // Filter 1: Category must contain "managed account" (case-insensitive)
        const categoryMatch = rule.category?.toLowerCase().includes("managed account");
        
        // Filter 2: Title must contain zone code anywhere (case-insensitive)
        const titleContainsZone = zoneCodeUpper ? rule.title?.toUpperCase().includes(zoneCodeUpper) : true;
        
        return categoryMatch && titleContainsZone;
      })
      .map((rule: any) => {
        const normalizedId = String(rule.quick_rule_id ?? "");
        return {
          ...rule,
          _normalizedId: normalizedId
        };
      });
  }, [quickRules, zoneCode]);

  // Group platforms by platform_type for better organization
  const groupedPlatforms = useMemo(() => {
    if (!platforms || !Array.isArray(platforms)) return {};
    
    return (platforms as Platform[]).reduce((acc, platform) => {
      const type = platform.platform_type || "Other";
      if (!acc[type]) acc[type] = [];
      acc[type].push(platform);
      return acc;
    }, {} as Record<string, Platform[]>);
  }, [platforms]);

  // Get the selected platform object
  const selectedPlatform = useMemo(() => {
    if (!selectedPlatformId || !platforms || !Array.isArray(platforms)) return null;
    return (platforms as Platform[]).find(p => String(p.platform_id) === selectedPlatformId) || null;
  }, [selectedPlatformId, platforms]);

  // Reset form when dialog opens/closes or existingRule changes
  useEffect(() => {
    if (open) {
      try {
        if (existingRule) {
          setName(existingRule.name || "");
          setSelectedPlatformId(existingRule.managed_system_platform_id 
            ? String(existingRule.managed_system_platform_id) 
            : "");
          setFunctionalAccountId(existingRule.functional_account_id || "");
          setAccountNames(
            Array.isArray(existingRule.account_names) && existingRule.account_names.length > 0 
              ? existingRule.account_names 
              : [""]
          );
          setQuickRuleId(existingRule.quick_rule_id || "none");
          setDomainType(existingRule.domain_type || "any");
          setPasswordPolicyId(existingRule.password_policy_id ? String(existingRule.password_policy_id) : "1");
          setWorkgroupId(existingRule.workgroup_id || "");
        } else {
          setName("");
          setSelectedPlatformId("");
          setFunctionalAccountId("");
          setAccountNames([""]);
          setQuickRuleId("none");
          setDomainType("any");
          setPasswordPolicyId("1");
          setWorkgroupId("");
        }
        setShowPreview(false);
        setMatchingVMs([]);
        setTotalMatchingCount(0);
      } catch (error) {
        console.error("[AddOnboardingRuleDialog] Error loading rule:", error);
        // Reset to safe state
        setName("");
        setSelectedPlatformId("");
        setFunctionalAccountId("");
        setAccountNames([""]);
        setQuickRuleId("none");
        setDomainType("any");
        setPasswordPolicyId("1");
        setWorkgroupId("");
        setShowPreview(false);
        setMatchingVMs([]);
        setTotalMatchingCount(0);
      }
    }
  }, [open, existingRule]);

  // Fetch matching VMs for preview
  const fetchMatchingVMs = async () => {
    if (!selectedPlatformId || !zoneId) return;

    setLoadingPreview(true);
    try {
      // Use robust OS filter based on platform ID
      const osFilter = getOsFilterForPlatform(selectedPlatform);

      const params = new URLSearchParams();
      params.set("zone_id", zoneId);
      if (osFilter !== "other" && osFilter !== "database") {
        params.set("os_filter", osFilter);
      }
      if (domainType !== "any") {
        params.set("domain_type", domainType);
      }
      params.set("limit", "10");

      const data = await api.get<{ items: MatchingVM[]; total: number }>(
        '/zones/' + zoneId + '/matching-vms?' + params.toString()
      );

      setMatchingVMs(data.items || []);
      setTotalMatchingCount(data.total || 0);
    } catch (error) {
      console.error("Error fetching matching VMs:", error);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Fetch matching VMs when preview is expanded and criteria change
  useEffect(() => {
    if (showPreview && selectedPlatformId) {
      fetchMatchingVMs();
    }
  }, [showPreview, selectedPlatformId, domainType, zoneId]);

  // Filter functional accounts by selected platform's compatible types
  const filteredFunctionalAccounts = useMemo(() => {
    if (!selectedPlatform || !functionalAccounts || !Array.isArray(functionalAccounts)) return [];
    
    const platformType = selectedPlatform.platform_type || "Other";
    const compatibleTypes = COMPATIBLE_PLATFORM_TYPES[platformType] || [platformType];
    
    // Get all platforms that match compatible types
    const compatiblePlatformIds = (platforms as Platform[] || [])
      .filter(p => compatibleTypes.includes(p.platform_type || "Other"))
      .map(p => p.platform_id);
    
    // Filter FAs by compatible platform and zone code prefix
    return functionalAccounts.filter((fa: any) => {
      const isCompatiblePlatform = compatiblePlatformIds.includes(fa.platform_id);
      const startsWithZoneCode = fa.account_name?.toLowerCase().startsWith(zoneCode.toLowerCase()) ||
                                  fa.display_name?.toLowerCase().startsWith(zoneCode.toLowerCase());
      return isCompatiblePlatform && startsWithZoneCode;
    });
  }, [selectedPlatform, functionalAccounts, platforms, zoneCode]);

  // All compatible FAs (without zone filter) for fallback
  const allCompatibleFunctionalAccounts = useMemo(() => {
    if (!selectedPlatform || !functionalAccounts || !Array.isArray(functionalAccounts)) return [];
    
    const platformType = selectedPlatform.platform_type || "Other";
    const compatibleTypes = COMPATIBLE_PLATFORM_TYPES[platformType] || [platformType];
    
    const compatiblePlatformIds = (platforms as Platform[] || [])
      .filter(p => compatibleTypes.includes(p.platform_type || "Other"))
      .map(p => p.platform_id);
    
    return functionalAccounts.filter((fa: any) => compatiblePlatformIds.includes(fa.platform_id));
  }, [selectedPlatform, functionalAccounts, platforms]);

  // Get selected Functional Account
  const selectedFA = useMemo(() => {
    if (!functionalAccountId || !functionalAccounts || !Array.isArray(functionalAccounts)) return null;
    return functionalAccounts.find((fa: any) => String(fa.functional_account_id) === functionalAccountId) || null;
  }, [functionalAccountId, functionalAccounts]);

  // Get selected Quick Rule - use normalized ID from filteredQuickRules
  const selectedQuickRule = useMemo(() => {
    if (!quickRuleId || quickRuleId === "none" || !filteredQuickRules || filteredQuickRules.length === 0) return null;
    return filteredQuickRules.find((rule: any) => rule._normalizedId === quickRuleId) || null;
  }, [quickRuleId, filteredQuickRules]);

  const handleAddAccountName = () => {
    setAccountNames([...accountNames, ""]);
  };

  const handleRemoveAccountName = (index: number) => {
    if (accountNames.length > 1) {
      setAccountNames(accountNames.filter((_, i) => i !== index));
    }
  };

  const handleAccountNameChange = (index: number, value: string) => {
    const updated = [...accountNames];
    updated[index] = value;
    setAccountNames(updated);
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      toast({ title: "Erro", description: "Nome da regra é obrigatório", variant: "destructive" });
      return;
    }
    if (!selectedPlatformId) {
      toast({ title: "Erro", description: "Selecione uma plataforma", variant: "destructive" });
      return;
    }
    if (!workgroupId) {
      toast({ title: "Erro", description: "Selecione um Workgroup", variant: "destructive" });
      return;
    }
    if (!functionalAccountId) {
      toast({ title: "Erro", description: "Selecione uma Functional Account", variant: "destructive" });
      return;
    }

    const validAccountNames = accountNames.filter(n => n.trim());
    if (validAccountNames.length === 0) {
      toast({ title: "Erro", description: "Adicione pelo menos um nome de usuário", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Find selected FA details
    const selectedFA = functionalAccounts?.find((fa: any) => 
      String(fa.functional_account_id) === functionalAccountId
    );

      // Find selected Quick Rule details using normalized ID from filteredQuickRules
      const selectedQuickRuleData = 
        quickRuleId && quickRuleId !== "none" && filteredQuickRules.length > 0
          ? filteredQuickRules.find((qr: any) => qr._normalizedId === quickRuleId)
          : null;

      // Derive os_group using robust platform mapping
      const osGroup = getOsFilterForPlatform(selectedPlatform);

      // Find selected password policy
      const selectedPolicyData = passwordPolicies?.find(
        (p: any) => String(p.password_rule_id) === passwordPolicyId
      );

      // Find selected workgroup
      const selectedWorkgroupData = workgroups?.find(
        (wg: any) => String(wg.workgroup_id) === workgroupId
      );

      const ruleData = {
        zone_id: zoneId,
        name: name.trim(),
        os_group: osGroup,
        domain_type: domainType,
        managed_system_platform_id: parseInt(selectedPlatformId),
        managed_system_platform_name: selectedPlatform?.name || null,
        functional_account_id: functionalAccountId,
        functional_account_name: selectedFA?.display_name || selectedFA?.account_name || null,
        functional_account_platform_id: selectedFA?.platform_id || null,
        account_names: validAccountNames,
        is_default: false,
        quick_rule_id: selectedQuickRuleData?._normalizedId || null,
        quick_rule_name: selectedQuickRuleData?.title || null,
        password_policy_id: parseInt(passwordPolicyId) || 1,
        password_policy_name: selectedPolicyData?.name || null,
        workgroup_id: workgroupId,
        workgroup_name: selectedWorkgroupData?.name || null,
      };

      if (existingRule?.id) {
        // Update — POST with id in body (PUT endpoint may not exist)
        await api.post('/zones/' + zoneId + '/onboarding-rules', { ...ruleData, id: existingRule.id });
        toast({ title: "Sucesso", description: "Regra atualizada com sucesso" });
      } else {
        // Insert
        await api.post('/zones/' + zoneId + '/onboarding-rules', ruleData);
        toast({ title: "Sucesso", description: "Regra criada com sucesso" });
      }

      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar regra",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const displayFAs = filteredFunctionalAccounts.length > 0 
    ? filteredFunctionalAccounts 
    : allCompatibleFunctionalAccounts;

  const isLoadingData = loadingPlatforms || loadingFAs || loadingQuickRules || loadingPolicies || loadingWorkgroups;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {existingRule ? "Editar Regra de Onboarding" : "Adicionar Regra de Onboarding"}
          </DialogTitle>
          <DialogDescription>
            Configure uma regra específica para um tipo de plataforma
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Rule Name */}
          <div className="space-y-2">
            <Label htmlFor="rule-name">Nome da Regra *</Label>
            <Input
              id="rule-name"
              placeholder={`Ex: Servidores Windows ${zoneCode}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Platform Selection (Dynamic from BeyondTrust) */}
          <div className="space-y-2">
            <Label>Plataforma *</Label>
            <Select 
              value={selectedPlatformId} 
              onValueChange={(value) => {
                setSelectedPlatformId(value);
                setFunctionalAccountId(""); // Reset FA when platform changes
              }} 
              disabled={loadingPlatforms || !!existingRule}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingPlatforms ? "Carregando plataformas..." : "Selecione a plataforma"} />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {Object.entries(groupedPlatforms).map(([type, typePlatforms]) => (
                  <SelectGroup key={type}>
                    <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase">
                      {type}
                    </SelectLabel>
                    {typePlatforms.map((platform) => (
                      <SelectItem 
                        key={platform.platform_id} 
                        value={String(platform.platform_id)}
                        textValue={`${platform.platform_id} - ${platform.name}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs px-1.5">
                            {platform.platform_id}
                          </Badge>
                          <span>{platform.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {existingRule && (
              <p className="text-xs text-muted-foreground">
                A plataforma não pode ser alterada. Exclua e crie uma nova regra se necessário.
              </p>
            )}
          </div>

          {/* Domain Type */}
          <div className="space-y-2">
            <Label>Tipo de Domínio</Label>
            <Select value={domainType} onValueChange={(v) => setDomainType(v as 'any' | 'standalone' | 'domain_joined')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo de domínio" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="any" textValue="Qualquer (Standalone ou Domínio)">
                  <div className="flex items-center gap-2">
                    <span>Qualquer</span>
                    <span className="text-xs text-muted-foreground">(Standalone ou Domínio)</span>
                  </div>
                </SelectItem>
                <SelectItem value="standalone" textValue="Standalone (Fora de domínio)">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Standalone</Badge>
                    <span className="text-xs text-muted-foreground">(Fora de domínio)</span>
                  </div>
                </SelectItem>
                <SelectItem value="domain_joined" textValue="Domínio (Em domínio AD)">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-primary/10 text-primary border-primary">Domínio</Badge>
                    <span className="text-xs text-muted-foreground">(Em domínio AD)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Defina para qual tipo de servidor esta regra se aplica
            </p>
          </div>

          {/* Workgroup */}
          <div className="space-y-2">
            <Label>Workgroup *</Label>
            <Select 
              value={workgroupId} 
              onValueChange={setWorkgroupId}
              disabled={isLoadingData}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  loadingWorkgroups ? "Carregando..." : 
                  filteredWorkgroups.length === 0 ? "Nenhum workgroup encontrado" :
                  "Selecione o Workgroup"
                } />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {filteredWorkgroups.map((wg: any) => (
                  <SelectItem 
                    key={wg.workgroup_id} 
                    value={String(wg.workgroup_id)}
                    textValue={wg.name}
                  >
                    {wg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>Filtrado pelo código da zona ({zoneCode})</span>
            </div>
          </div>

          {/* Functional Account */}
          <div className="space-y-2">
            <Label>Functional Account *</Label>
            <Select 
              value={functionalAccountId} 
              onValueChange={setFunctionalAccountId}
              disabled={!selectedPlatformId || isLoadingData}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  isLoadingData ? "Carregando..." : 
                  !selectedPlatformId ? "Selecione uma plataforma primeiro" : 
                  displayFAs.length === 0 ? "Nenhuma conta compatível encontrada" :
                  "Selecione a Functional Account"
                } />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {displayFAs.map((fa: any) => (
                  <SelectItem 
                    key={fa.functional_account_id} 
                    value={String(fa.functional_account_id)}
                    textValue={`${fa.display_name || fa.account_name} - ${getPlatformName(fa.platform_id)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{fa.display_name || fa.account_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {getPlatformName(fa.platform_id)}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlatform && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3" />
                <span>
                  Mostrando contas compatíveis com {selectedPlatform.platform_type || "esta plataforma"}
                  {filteredFunctionalAccounts.length > 0 && ` (prefixo ${zoneCode})`}
                </span>
              </div>
            )}
          </div>

          {/* Account Names */}
          <div className="space-y-2">
            <Label>Usuários para Gerenciar *</Label>
            <div className="space-y-2">
              {accountNames.map((accountName, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Nome do usuário (ex: Administrator)"
                    value={accountName}
                    onChange={(e) => handleAccountNameChange(index, e.target.value)}
                  />
                  {accountNames.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAccountName(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddAccountName}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Usuário
            </Button>
          </div>

          {/* Quick Rule (Opcional) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Quick Rule (Opcional)
              {!loadingQuickRules && !loadingZoneCodes && filteredQuickRules.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {filteredQuickRules.length} disponíveis
                </Badge>
              )}
            </Label>
            {loadingQuickRules || loadingZoneCodes ? (
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Carregando Quick Rules...</span>
              </div>
            ) : filteredQuickRules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md bg-muted/30">
                Nenhuma Quick Rule disponível para a zona {zoneCode}
              </p>
            ) : (
              <Select 
                value={quickRuleId} 
                onValueChange={setQuickRuleId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma Quick Rule (opcional)" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="none" textValue="Nenhuma">
                    Nenhuma
                  </SelectItem>
                    {filteredQuickRules.map((rule: any) => (
                      <SelectItem 
                        key={rule._normalizedId} 
                        value={rule._normalizedId}
                        textValue={`${rule.title} ${rule.category || ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{rule.title}</span>
                          {rule.category && (
                            <Badge variant="outline" className="text-xs">
                              {rule.category}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              As contas criadas serão automaticamente adicionadas a esta Quick Rule
            </p>
          </div>

          {/* Password Policy Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Password Policy *
              {passwordPolicies && passwordPolicies.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {passwordPolicies.length} disponíveis
                </Badge>
              )}
            </Label>
            {loadingPolicies ? (
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Carregando Password Policies...</span>
              </div>
            ) : !passwordPolicies || passwordPolicies.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md bg-muted/30">
                Nenhuma Password Policy encontrada. Execute a sincronização no BeyondTrust Explorer.
              </p>
            ) : (
              <Select 
                value={passwordPolicyId} 
                onValueChange={setPasswordPolicyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma Password Policy" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  {passwordPolicies.map((policy: any) => (
                    <SelectItem 
                      key={policy.password_rule_id} 
                      value={String(policy.password_rule_id)}
                      textValue={policy.name}
                    >
                      <div className="flex flex-col">
                        <span>{policy.name}</span>
                        {policy.description && (
                          <span className="text-xs text-muted-foreground">
                            {policy.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Define as regras de complexidade de senha para as contas gerenciadas
            </p>
          </div>

          <Collapsible open={showPreview} onOpenChange={setShowPreview} className="border rounded-lg">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-4 py-3 h-auto">
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <span className="font-medium">{t("onboardingRules.previewTitle")}</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", showPreview && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 space-y-3">
              {/* Application Criteria */}
              <Card className="bg-muted/50 border-none shadow-none">
                <CardContent className="pt-4 space-y-2 text-sm">
                  <p className="font-medium flex items-center gap-2">
                    📋 {t("onboardingRules.previewCriteria")}
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-1">
                    <li><strong>{t("onboardingRules.platform")}:</strong> {selectedPlatform?.name || t("onboardingRules.notSelected")}</li>
                    <li><strong>Tipo de OS:</strong> {getOsFilterLabel(getOsFilterForPlatform(selectedPlatform))}</li>
                    <li><strong>Tipo de Domínio:</strong> {
                      domainType === 'any' ? t("onboardingRules.domainAny") : 
                      domainType === 'standalone' ? t("onboardingRules.domainStandalone") : 
                      t("onboardingRules.domainJoined")
                    }</li>
                    <li><strong>Zona:</strong> {zoneCode}</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Onboarding Configuration */}
              <Card className="bg-muted/50 border-none shadow-none">
                <CardContent className="pt-4 space-y-2 text-sm">
                  <p className="font-medium flex items-center gap-2">
                    🎯 {t("onboardingRules.previewConfig")}
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-1">
                    <li><strong>{t("onboardingRules.functionalAccount")}:</strong> {selectedFA?.display_name || t("onboardingRules.notSelected")}</li>
                    <li><strong>{t("onboardingRules.accountNames")}:</strong> {accountNames.filter(n => n.trim()).join(", ") || t("onboardingRules.noUsers")}</li>
                    {quickRuleId && quickRuleId !== "none" && (
                      <li><strong>Quick Rule:</strong> {selectedQuickRule?.title}</li>
                    )}
                    <li><strong>Password Policy:</strong> {passwordPolicies?.find((p: any) => String(p.password_rule_id) === passwordPolicyId)?.name || "Default"}</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Matching VMs */}
              <Card className="bg-muted/50 border-none shadow-none">
                <CardContent className="pt-4">
                  <p className="font-medium mb-2 text-sm flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    {t("onboardingRules.previewMatchingVMs")}
                  </p>
                  {loadingPreview ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">{t("onboardingRules.loadingPreview")}</span>
                    </div>
                  ) : !selectedPlatformId ? (
                    <p className="text-sm text-muted-foreground italic py-2">
                      Selecione uma plataforma primeiro
                    </p>
                  ) : matchingVMs.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic py-2">
                      {t("onboardingRules.previewNoMatch")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-h-32 overflow-y-auto rounded border bg-background">
                        <Table>
                          <TableBody>
                            {matchingVMs.map(vm => (
                              <TableRow key={vm.id} className="text-xs">
                                <TableCell className="py-1.5 font-mono">{vm.name}</TableCell>
                                <TableCell className="py-1.5">
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                                    {vm.domain_status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-1.5 text-center">
                                  {vm.onboarding_status === 'completed' ? '✅' : vm.onboarding_status === 'failed' ? '❌' : '⏳'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        📊 {t("onboardingRules.previewTotal", { count: totalMatchingCount })}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existingRule ? "Salvar Alterações" : "Criar Regra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
