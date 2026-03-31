import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, AlertCircle, Shield, ExternalLink, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

export function GlobalSettingsTab() {
  const { toast } = useToast();
  const { t } = useTranslation();

  // BeyondTrust state
  const [btUrl, setBtUrl] = useState("");
  const [btPsAuth, setBtPsAuth] = useState("");
  const [btUsername, setBtUsername] = useState("");
  const [btPassword, setBtPassword] = useState("");
  const [showBtPsAuth, setShowBtPsAuth] = useState(false);
  const [showBtPassword, setShowBtPassword] = useState(false);
  const [btConfigured, setBtConfigured] = useState(false);
  const [loadingBt, setLoadingBt] = useState(false);
  const [testingBt, setTestingBt] = useState(false);
  const [loadingOutboundIp, setLoadingOutboundIp] = useState(false);
  const [outboundIp, setOutboundIp] = useState<string | null>(null);

  // Microsoft SSO state
  const [ssoTenantId, setSsoTenantId] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoClientSecret, setSsoClientSecret] = useState("");
  const [showSsoSecret, setShowSsoSecret] = useState(false);
  const [ssoConfigured, setSsoConfigured] = useState(false);
  const [loadingSso, setLoadingSso] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [savingSsoToggle, setSavingSsoToggle] = useState(false);

  useEffect(() => {
    checkExistingConfigs();
  }, []);

  const verifyCredentialsSaved = async (provider: string): Promise<boolean> => {
    try {
      if (provider === 'beyondtrust') {
        const data = await api.get('/credentials/beyondtrust');
        return !!data.configured;
      } else if (provider === 'microsoft_sso') {
        const data = await api.get('/credentials/azure-status');
        return !!data.configured;
      }
      return false;
    } catch {
      return false;
    }
  };

  const checkExistingConfigs = async () => {
    try {
      // Check BeyondTrust
      const btData = await api.get('/credentials/beyondtrust');

      if (btData.configured) {
        setBtConfigured(true);
        setBtUrl("https://••••••.pm.beyondtrustcloud.com");
        setBtPsAuth("••••••••••••••••••••••••••••••••");
        setBtUsername("••••••••@••••••.com");
        setBtPassword("••••••••••••••••");
      } else if (localStorage.getItem('bt_credentials_saved')) {
        console.warn('API indisponível, usando fallback localStorage');
        setBtConfigured(true);
        setBtUrl("••••• (verificar vault)");
        setBtPsAuth("••••• (verificar vault)");
        setBtUsername("••••• (verificar vault)");
        setBtPassword("••••• (verificar vault)");
      }

      // Check SSO
      const ssoData = await api.get('/credentials/azure-status');

      if (ssoData.configured) {
        setSsoConfigured(true);
        setSsoTenantId("••••••••-••••-••••-••••-••••••••••••");
        setSsoClientId("••••••••-••••-••••-••••-••••••••••••");
        setSsoClientSecret("••••••••••••••••••••••••••••••••");
      } else if (localStorage.getItem('sso_credentials_saved')) {
        console.warn('API indisponível para SSO, usando fallback localStorage');
        setSsoConfigured(true);
        setSsoTenantId("••••• (verificar vault)");
        setSsoClientId("••••• (verificar vault)");
        setSsoClientSecret("••••• (verificar vault)");
      }

      // SSO enabled defaults to true when no explicit setting
      setSsoEnabled(true);
    } catch (e) {
      console.log('Config check error:', e);
      // Final fallback - check localStorage
      if (localStorage.getItem('bt_credentials_saved')) {
        setBtConfigured(true);
        setBtUrl("••••• (verificar vault)");
        setBtPsAuth("••••• (verificar vault)");
        setBtUsername("••••• (verificar vault)");
        setBtPassword("••••• (verificar vault)");
      }
      if (localStorage.getItem('sso_credentials_saved')) {
        setSsoConfigured(true);
        setSsoTenantId("••••• (verificar vault)");
        setSsoClientId("••••• (verificar vault)");
        setSsoClientSecret("••••• (verificar vault)");
      }
    }
  };

  const handleSaveBeyondtrust = async () => {
    setLoadingBt(true);
    try {
      const credentials = {
        url: btUrl,
        ps_auth: btPsAuth,
        username: btUsername,
        password: btPassword,
      };

      const data = await api.post('/credentials/save', { provider: 'beyondtrust', credentials });

      if (data.success) {
        localStorage.setItem('bt_credentials_saved', 'true');
        toast({
          title: "Sucesso",
          description: "Credenciais BeyondTrust (Global) salvas com segurança",
        });
        setBtConfigured(true);
      }
    } catch (error: any) {
      if (error.message?.includes('Failed to fetch')) {
        const wasSaved = await verifyCredentialsSaved('beyondtrust');
        if (wasSaved) {
          toast({ title: "Sucesso", description: "Credenciais BeyondTrust salvas" });
          setBtConfigured(true);
          return;
        }
      }
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar credenciais",
        variant: "destructive",
      });
    } finally {
      setLoadingBt(false);
    }
  };

  const handleTestBeyondtrust = async () => {
    setTestingBt(true);
    try {
      const data = await api.post('/credentials/test', { provider: 'beyondtrust' });

      if (data.success) {
        toast({
          title: "Conexão bem-sucedida",
          description: data.message,
        });
      } else {
        toast({
          title: "Falha na conexão",
          description: data.error || "Não foi possível conectar ao BeyondTrust",
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
      setTestingBt(false);
    }
  };

  const handleDiscoverOutboundIp = async () => {
    setLoadingOutboundIp(true);
    try {
      const data = await api.get('/health/outbound-ip');
      setOutboundIp(data.ip || data.origin || 'Não detectado');
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível descobrir o IP de saída",
        variant: "destructive",
      });
    } finally {
      setLoadingOutboundIp(false);
    }
  };

  const handleSaveSso = async () => {
    if (!ssoTenantId || !ssoClientId || !ssoClientSecret) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setLoadingSso(true);
    try {
      const data = await api.post<{ success: boolean }>('/credentials/save', {
        provider: 'microsoft_sso',
        credentials: {
          tenant_id: ssoTenantId,
          client_id: ssoClientId,
          client_secret: ssoClientSecret,
        }
      });

      if (data.success) {
        toast({
          title: "Sucesso",
          description: "Credenciais SSO Microsoft salvas com segurança",
        });
        setSsoConfigured(true);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao salvar credenciais",
        variant: "destructive",
      });
    } finally {
      setLoadingSso(false);
    }
  };

  const handleToggleSso = async (enabled: boolean) => {
    setSavingSsoToggle(true);
    try {
      await api.post('/credentials/save', {
        provider: 'microsoft_sso_toggle',
        credentials: { enabled: enabled ? 'true' : 'false' },
      });
      
      setSsoEnabled(enabled);
      toast({
        title: enabled ? t('globalSettings.sso.enabled') : t('globalSettings.sso.disabled'),
        description: enabled 
          ? t('globalSettings.sso.enabledDesc')
          : t('globalSettings.sso.disabledDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('globalSettings.sso.toggleError'),
        variant: "destructive",
      });
    } finally {
      setSavingSsoToggle(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Configurações Globais</AlertTitle>
        <AlertDescription>
          Estas configurações se aplicam a todas as zonas. O BeyondTrust é uma console única global e o SSO é compartilhado.
        </AlertDescription>
      </Alert>

      {/* BeyondTrust Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                BeyondTrust (Global)
              </CardTitle>
              <CardDescription>Credenciais da console BeyondTrust global</CardDescription>
            </div>
            {btConfigured && (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Configurado</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bt-url">URL do BeyondTrust</Label>
            <Input
              id="bt-url"
              type="url"
              placeholder="https://empresa.pm.beyondtrustcloud.com"
              value={btUrl}
              onChange={(e) => setBtUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bt-ps-auth">PS-Auth Key</Label>
            <div className="relative">
              <Input
                id="bt-ps-auth"
                type={showBtPsAuth ? "text" : "password"}
                placeholder="Chave PS-Auth da API"
                value={btPsAuth}
                onChange={(e) => setBtPsAuth(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() => setShowBtPsAuth(!showBtPsAuth)}
              >
                {showBtPsAuth ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bt-username">RunAs Username</Label>
              <Input
                id="bt-username"
                placeholder="usuario@empresa.com"
                value={btUsername}
                onChange={(e) => setBtUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bt-password">RunAs Password</Label>
              <div className="relative">
                <Input
                  id="bt-password"
                  type={showBtPassword ? "text" : "password"}
                  placeholder="Senha do usuário RunAs"
                  value={btPassword}
                  onChange={(e) => setBtPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowBtPassword(!showBtPassword)}
                >
                  {showBtPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {/* Outbound IP Discovery */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">IP de Saída (Allowlist)</h4>
                <p className="text-sm text-muted-foreground">
                  Adicione este IP na allowlist do BeyondTrust Cloud
                </p>
              </div>
              <div className="flex items-center gap-2">
                {outboundIp && (
                  <code className="px-2 py-1 bg-muted rounded text-sm font-mono">{outboundIp}</code>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDiscoverOutboundIp}
                  disabled={loadingOutboundIp}
                >
                  {loadingOutboundIp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Descobrir IP"
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveBeyondtrust} disabled={loadingBt}>
              {loadingBt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Credenciais
            </Button>
            <Button variant="outline" onClick={handleTestBeyondtrust} disabled={testingBt || !btConfigured}>
              {testingBt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Testar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SSO Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t('globalSettings.sso.title')}
              </CardTitle>
              <CardDescription>{t('globalSettings.sso.description')}</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              {/* SSO Toggle */}
              {ssoConfigured && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="sso-toggle" className="text-sm text-muted-foreground">
                    {ssoEnabled ? t('globalSettings.sso.enabled') : t('globalSettings.sso.disabled')}
                  </Label>
                  <Switch
                    id="sso-toggle"
                    checked={ssoEnabled}
                    onCheckedChange={handleToggleSso}
                    disabled={savingSsoToggle}
                  />
                </div>
              )}
              {/* Configured indicator */}
              {ssoConfigured && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">{t('common.configured')}</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Este App Registration deve ter permissão <code>User.Read</code> e redirect URI configurada.{" "}
              <a 
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Azure Portal <ExternalLink className="h-3 w-3" />
              </a>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="sso-tenant">Tenant ID</Label>
            <Input
              id="sso-tenant"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={ssoTenantId}
              onChange={(e) => setSsoTenantId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-client">Client ID (Application ID)</Label>
            <Input
              id="sso-client"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={ssoClientId}
              onChange={(e) => setSsoClientId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-secret">Client Secret</Label>
            <div className="relative">
              <Input
                id="sso-secret"
                type={showSsoSecret ? "text" : "password"}
                placeholder="Client secret do App Registration"
                value={ssoClientSecret}
                onChange={(e) => setSsoClientSecret(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0"
                onClick={() => setShowSsoSecret(!showSsoSecret)}
              >
                {showSsoSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Button onClick={handleSaveSso} disabled={loadingSso}>
            {loadingSso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar SSO
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
