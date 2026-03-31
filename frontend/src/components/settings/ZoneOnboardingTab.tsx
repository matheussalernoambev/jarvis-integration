import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { OnboardingRulesCard } from "./OnboardingRulesCard";
import { Loader2, MapPin, Settings, Clock, Key, Eye, EyeOff } from "lucide-react";

interface Zone {
  id: string;
  code: string;
  name: string;
}

interface ZoneOnboardingTabProps {
  zoneId: string;
  zone: Zone | null;
}

export function ZoneOnboardingTab({ zoneId, zone }: ZoneOnboardingTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Onboarding settings state
  const [defaultPassword, setDefaultPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [automanageSystem, setAutomanageSystem] = useState(true);
  const [automanageAccounts, setAutomanageAccounts] = useState(true);
  const [changeFrequencyType, setChangeFrequencyType] = useState("xdays");
  const [changeFrequencyDays, setChangeFrequencyDays] = useState(30);
  const [changeTime, setChangeTime] = useState("23:30");
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(1);
  const [systemDescTemplate, setSystemDescTemplate] = useState("Azure VM: {{vm_name}} | RG: {{resource_group}} | {{os_type}}");
  const [accountDescTemplate, setAccountDescTemplate] = useState("{{account_name}} on {{vm_name}}");

  // Load existing settings
  useEffect(() => {
    if (zone) {
      loadSettings();
    }
  }, [zone]);

  const loadSettings = async () => {
    if (!zone) return;

    try {
      const data = await api.get<any>('/zones/' + zoneId + '/onboarding-settings');

      if (data) {
        setSettingsId(data.id);
        setDefaultPassword(data.default_password || "");
        setAutomanageSystem(data.automanage_system ?? true);
        setAutomanageAccounts(data.automanage_accounts ?? true);
        setChangeFrequencyType(data.change_frequency_type || "xdays");
        setChangeFrequencyDays(data.change_frequency_days || 30);
        setChangeTime(data.change_time || "23:30");
        setMaxConcurrentRequests(data.max_concurrent_requests || 1);
        setSystemDescTemplate(data.system_description_template || "Azure VM: {{vm_name}} | RG: {{resource_group}} | {{os_type}}");
        setAccountDescTemplate(data.account_description_template || "{{account_name}} on {{vm_name}}");
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const handleSave = async () => {
    if (!zone) return;

    setLoading(true);
    try {
      const settingsData = {
        default_password: defaultPassword || null,
        automanage_system: automanageSystem,
        automanage_accounts: automanageAccounts,
        change_frequency_type: changeFrequencyType,
        change_frequency_days: changeFrequencyDays,
        change_time: changeTime,
        max_concurrent_requests: maxConcurrentRequests,
        system_description_template: systemDescTemplate,
        account_description_template: accountDescTemplate,
      };

      const data = await api.put<any>('/zones/' + zoneId + '/onboarding-settings', settingsData);
      if (data?.id) {
        setSettingsId(data.id);
      }

      toast({
        title: "Sucesso",
        description: `Configurações de onboarding salvas para ${zone.code}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar configurações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generatePreview = () => {
    const sampleVM = {
      vm_name: "AZPROD-WEB-001",
      resource_group: "RG-PRODUCTION",
      os_type: "Windows Server 2022",
      domain_status: "domain_joined",
      ip_address: "10.0.1.25",
      zone_code: zone?.code || "SAZ",
      zone_name: zone?.name || "South American Zone",
      subscription: "PROD-Subscription",
      subscription_name: "PROD-01",
      location: "brazilsouth",
      vm_size: "Standard_D4s_v3",
    };

    const systemDesc = systemDescTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleVM[key as keyof typeof sampleVM] || `{{${key}}}`);
    
    return { sampleVM, systemDesc };
  };

  const preview = generatePreview();

  if (!zone) return null;

  return (
    <div className="space-y-6">
      <Alert>
        <MapPin className="h-4 w-4" />
        <AlertTitle>Regras de Onboarding - {zone.code}</AlertTitle>
        <AlertDescription>
          Configure as regras de negócio para onboarding automático na zona <strong>{zone.name}</strong>.
          Cada regra pode ter seu próprio workgroup, functional account e configurações específicas por tipo de OS.
        </AlertDescription>
      </Alert>

      {/* Auto-manage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configurações de Auto-gerenciamento
          </CardTitle>
          <CardDescription>
            Defina como o BeyondTrust gerenciará os sistemas e contas desta zona
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-gerenciar Sistema</Label>
              <p className="text-sm text-muted-foreground">BeyondTrust gerencia o sistema automaticamente</p>
            </div>
            <Switch checked={automanageSystem} onCheckedChange={setAutomanageSystem} />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-gerenciar Contas</Label>
              <p className="text-sm text-muted-foreground">BeyondTrust gerencia as contas automaticamente</p>
            </div>
            <Switch checked={automanageAccounts} onCheckedChange={setAutomanageAccounts} />
          </div>
        </CardContent>
      </Card>

      {/* Onboarding Rules */}
      <OnboardingRulesCard zoneId={zoneId} zoneCode={zone.code} />

      {/* Password Rotation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Rotação de Senhas
          </CardTitle>
          <CardDescription>Configure a frequência de troca de senhas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Frequência</Label>
              <Select value={changeFrequencyType} onValueChange={setChangeFrequencyType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xdays">A cada X dias</SelectItem>
                  <SelectItem value="first">Primeiro dia do mês</SelectItem>
                  <SelectItem value="last">Último dia do mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {changeFrequencyType === "xdays" && (
              <div className="space-y-2">
                <Label htmlFor="frequency-days">Dias</Label>
                <Input
                  id="frequency-days"
                  type="number"
                  min={1}
                  max={365}
                  value={changeFrequencyDays}
                  onChange={(e) => setChangeFrequencyDays(parseInt(e.target.value) || 30)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="change-time">Horário (HH:MM)</Label>
              <Input
                id="change-time"
                placeholder="23:30"
                value={changeTime}
                onChange={(e) => setChangeTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-password">Senha Padrão Inicial</Label>
              <div className="relative">
                <Input
                  id="default-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha inicial para novas contas"
                  value={defaultPassword}
                  onChange={(e) => setDefaultPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-concurrent">Requisições Simultâneas</Label>
              <Input
                id="max-concurrent"
                type="number"
                min={1}
                max={100}
                value={maxConcurrentRequests}
                onChange={(e) => setMaxConcurrentRequests(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Limite de onboardings simultâneos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Templates de Descrição
          </CardTitle>
          <CardDescription>Personalize as descrições dos sistemas e contas no BeyondTrust</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system-template">Template de Sistema</Label>
            <Textarea
              id="system-template"
              placeholder="Azure VM: {{vm_name}} | RG: {{resource_group}} | {{os_type}}"
              value={systemDescTemplate}
              onChange={(e) => setSystemDescTemplate(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Variáveis: {"{{vm_name}}, {{resource_group}}, {{os_type}}, {{domain_status}}, {{ip_address}}, {{zone_code}}, {{zone_name}}, {{subscription}}, {{subscription_name}}, {{location}}, {{vm_size}}"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-template">Template de Conta</Label>
            <Textarea
              id="account-template"
              placeholder="{{account_name}} on {{vm_name}}"
              value={accountDescTemplate}
              onChange={(e) => setAccountDescTemplate(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Variáveis: {"{{account_name}}, {{vm_name}}, {{resource_group}}, {{zone_code}}, {{zone_name}}"}
            </p>
          </div>

          {/* Preview */}
          <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
            <h4 className="font-medium text-sm">Preview com VM de exemplo:</h4>
            <div className="text-sm">
              <p><span className="text-muted-foreground">Sistema:</span> {preview.systemDesc}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading} size="lg">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações de {zone.code}
        </Button>
      </div>
    </div>
  );
}
