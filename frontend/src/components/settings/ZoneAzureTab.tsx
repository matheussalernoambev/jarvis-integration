import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Eye, EyeOff, Loader2, CheckCircle2, Cloud, MapPin, RefreshCw } from "lucide-react";

interface Zone {
  id: string;
  code: string;
  name: string;
}

interface DiscoveredSubscription {
  id: string;
  name: string;
  state: string;
  selected: boolean;
}

interface SavedSubscription {
  id: string;
  name: string;
  state: string;
}

interface ZoneAzureTabProps {
  zoneId: string;
  zone: Zone | null;
}

export function ZoneAzureTab({ zoneId, zone }: ZoneAzureTabProps) {
  const { toast } = useToast();

  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const [discoveredSubscriptions, setDiscoveredSubscriptions] = useState<DiscoveredSubscription[]>([]);
  const [showSubscriptionSelector, setShowSubscriptionSelector] = useState(false);
  const [savedSubscriptions, setSavedSubscriptions] = useState<SavedSubscription[]>([]);

  useEffect(() => {
    if (zone) {
      checkExistingConfig();
    }
  }, [zone]);

  const checkExistingConfig = async () => {
    if (!zone) return;

    try {
      // Check if Azure credentials exist for this zone
      const statusData = await api.get<{ configured: boolean }>('/credentials/azure-status?zone_code=' + zone.code);

      if (statusData.configured) {
        setIsConfigured(true);
        setTenantId("••••••••-••••-••••-••••-••••••••••••");
        setClientId("••••••••-••••-••••-••••-••••••••••••");
        setClientSecret("••••••••••••••••••••••••••••••••");
      } else {
        setIsConfigured(false);
        setTenantId("");
        setClientId("");
        setClientSecret("");
      }

      // Check zone_azure_config for subscriptions
      const configData = await api.get<{ subscription_ids?: SavedSubscription[]; is_configured?: boolean }>('/zones/' + zoneId + '/azure-config');

      if (configData?.subscription_ids && Array.isArray(configData.subscription_ids)) {
        setSavedSubscriptions(configData.subscription_ids);
      }
    } catch (e) {
      console.error("Error checking config:", e);
    }
  };

  const handleSave = async () => {
    if (!zone) return;

    setLoading(true);
    try {
      // Save credentials with zone suffix
      await api.post('/credentials/save', {
        provider: 'azure',
        zone_code: zone.code,
        credentials: {
          tenant_id: tenantId,
          client_id: clientId,
          client_secret: clientSecret,
        },
      });

      // Update or create zone_azure_config
      await api.put('/zones/' + zoneId + '/azure-config', {
        is_configured: true,
      });

      toast({
        title: "Sucesso",
        description: `Credenciais Azure para ${zone.code} salvas`,
      });
      setIsConfigured(true);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar credenciais",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!zone) return;

    setTesting(true);
    try {
      const data = await api.post<{ success: boolean; details?: string; error?: string; subscriptions?: any[] }>('/credentials/test', {
        provider: 'azure',
        zone_code: zone.code,
      });

      if (data.success) {
        toast({
          title: "Conexão bem-sucedida",
          description: `${data.details || ''} para zona ${zone.code}`,
        });

        // If subscriptions were returned, show selector
        if (data.subscriptions?.length > 0) {
          setDiscoveredSubscriptions(
            data.subscriptions.map((sub: any) => ({
              id: sub.id,
              name: sub.name,
              state: sub.state,
              selected: savedSubscriptions.some(saved => saved.id === sub.id),
            }))
          );
          setShowSubscriptionSelector(true);
        }
      } else {
        toast({
          title: "Falha na conexão",
          description: data.error || "Não foi possível conectar",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao testar conexão",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDiscoverSubscriptions = async () => {
    if (!zone) return;

    setDiscovering(true);
    try {
      const data = await api.post<{ subscriptions?: any[] }>('/credentials/test', {
        provider: 'azure',
        zone_code: zone.code,
      });

      if (data.subscriptions?.length > 0) {
        setDiscoveredSubscriptions(
          data.subscriptions.map((sub: any) => ({
            id: sub.id,
            name: sub.name,
            state: sub.state,
            selected: savedSubscriptions.some(saved => saved.id === sub.id),
          }))
        );
        setShowSubscriptionSelector(true);
      } else {
        toast({
          title: "Nenhuma subscription encontrada",
          description: "Verifique as permissões do Service Principal",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao descobrir subscriptions",
        variant: "destructive",
      });
    } finally {
      setDiscovering(false);
    }
  };

  const toggleSubscription = (id: string) => {
    setDiscoveredSubscriptions(prev =>
      prev.map(sub =>
        sub.id === id ? { ...sub, selected: !sub.selected } : sub
      )
    );
  };

  const handleSaveSubscriptions = async () => {
    if (!zone) return;

    const selectedSubs = discoveredSubscriptions
      .filter(s => s.selected)
      .map(s => ({
        id: s.id,
        name: s.name,
        state: s.state,
      }));

    try {
      // Update zone_azure_config with selected subscriptions (full objects)
      await api.put('/zones/' + zoneId + '/azure-config', {
        subscription_ids: selectedSubs,
        is_configured: true,
      });

      setSavedSubscriptions(selectedSubs);
      setShowSubscriptionSelector(false);
      toast({
        title: "Sucesso",
        description: `${selectedSubs.length} subscriptions selecionadas para ${zone.code}`,
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar subscriptions",
        variant: "destructive",
      });
    }
  };

  if (!zone) return null;

  return (
    <div className="space-y-6">
      <Alert>
        <MapPin className="h-4 w-4" />
        <AlertTitle>Configuração Azure - {zone.code}</AlertTitle>
        <AlertDescription>
          Configure as credenciais do Azure (Tenant/Service Principal) específicas para a zona <strong>{zone.name}</strong>.
          Cada zona pode ter seu próprio tenant Azure.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Azure Credentials
                <Badge variant="outline">{zone.code}</Badge>
              </CardTitle>
              <CardDescription>Credenciais do tenant Azure para {zone.name}</CardDescription>
            </div>
            {isConfigured && (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Configurado</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-id">Tenant ID</Label>
            <Input
              id="tenant-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID (Application ID)</Label>
            <Input
              id="client-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-secret">Client Secret</Label>
            <div className="relative">
              <Input
                id="client-secret"
                type={showSecret ? "text" : "password"}
                placeholder="Client secret do Service Principal"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Credenciais
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !isConfigured}>
              {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Testar Conexão
            </Button>
            <Button variant="secondary" onClick={handleDiscoverSubscriptions} disabled={discovering || !isConfigured}>
              {discovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <RefreshCw className="mr-2 h-4 w-4" />
              Descobrir Subscriptions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Selector */}
      {showSubscriptionSelector && discoveredSubscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Subscriptions para {zone.code}</CardTitle>
            <CardDescription>
              Selecione as subscriptions que serão sincronizadas nesta zona
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-64 overflow-y-auto space-y-2">
              {discoveredSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleSubscription(sub.id)}
                >
                  <Checkbox
                    checked={sub.selected}
                    onCheckedChange={() => toggleSubscription(sub.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{sub.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{sub.id}</p>
                  </div>
                  <Badge variant={sub.state === "Enabled" ? "default" : "secondary"}>
                    {sub.state}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <span className="text-sm text-muted-foreground">
                {discoveredSubscriptions.filter(s => s.selected).length} de {discoveredSubscriptions.length} selecionadas
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowSubscriptionSelector(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveSubscriptions}>
                  Salvar Seleção
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved Subscriptions Summary - Card Format */}
      {savedSubscriptions.length > 0 && !showSubscriptionSelector && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Subscriptions Configuradas</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDiscoverSubscriptions}
                disabled={discovering || !isConfigured}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Alterar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedSubscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg bg-muted/30"
                >
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{sub.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{sub.id}</p>
                  </div>
                  <Badge variant={sub.state === "Enabled" ? "default" : "secondary"}>
                    {sub.state}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
