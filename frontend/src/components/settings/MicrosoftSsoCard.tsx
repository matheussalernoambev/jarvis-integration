import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Eye, EyeOff, Loader2, CheckCircle2, Shield, ExternalLink, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AzureGroupMappingCard } from "./AzureGroupMappingCard";

export function MicrosoftSsoCard() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [ssoTenantId, setSsoTenantId] = useState("");
  const [ssoClientId, setSsoClientId] = useState("");
  const [ssoClientSecret, setSsoClientSecret] = useState("");
  const [showSsoSecret, setShowSsoSecret] = useState(false);
  const [ssoConfigured, setSsoConfigured] = useState(false);
  const [loadingSso, setLoadingSso] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [savingSsoToggle, setSavingSsoToggle] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Validation helpers
  const isMaskedValue = (value: string) => 
    value.includes('••••') || value.includes('(verify vault)');
  
  const isValidGuid = (value: string) => 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  useEffect(() => {
    checkExistingConfig();
  }, []);

  const checkExistingConfig = async () => {
    try {
      const data = await api.get<{ configured: boolean; enabled: boolean }>('/credentials/sso-status');

      if (data.configured) {
        setSsoConfigured(true);
        setSsoTenantId("••••••••-••••-••••-••••-••••••••••••");
        setSsoClientId("••••••••-••••-••••-••••-••••••••••••");
        setSsoClientSecret("••••••••••••••••••••••••••••••••");
      }

      setSsoEnabled(data.enabled !== false);
    } catch (e) {
      console.log('Config check error:', e);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setSsoTenantId("");
    setSsoClientId("");
    setSsoClientSecret("");
  };

  const handleSaveSso = async () => {
    if (!ssoTenantId || !ssoClientId || !ssoClientSecret) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.allFieldsRequired') || "Todos os campos são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // Prevent saving masked values
    if (isMaskedValue(ssoTenantId) || isMaskedValue(ssoClientId) || isMaskedValue(ssoClientSecret)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.maskedValuesError') || "Para atualizar, clique em 'Editar' e insira os valores completos. Os campos atuais mostram valores mascarados.",
        variant: "destructive",
      });
      return;
    }

    // Validate GUID format for Tenant ID
    if (!isValidGuid(ssoTenantId)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.invalidTenantId') || "Tenant ID deve ser um GUID válido (ex: 12345678-1234-1234-1234-123456789abc)",
        variant: "destructive",
      });
      return;
    }

    // Validate GUID format for Client ID
    if (!isValidGuid(ssoClientId)) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.sso.invalidClientId') || "Client ID deve ser um GUID válido",
        variant: "destructive",
      });
      return;
    }

    setLoadingSso(true);
    try {
      await api.post('/credentials/save', {
        provider: 'microsoft_sso',
        credentials: {
          tenant_id: ssoTenantId,
          client_id: ssoClientId,
          client_secret: ssoClientSecret,
        },
      });

      toast({
        title: t('common.success'),
        description: t('globalSettings.sso.saveSuccess'),
      });
      setSsoConfigured(true);
      setIsEditing(false);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('globalSettings.sso.saveError'),
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
              {t('globalSettings.sso.redirectAlert')}{" "}
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
            <Label htmlFor="sso-tenant">{t('globalSettings.sso.tenantId')}</Label>
            <Input
              id="sso-tenant"
              placeholder={t('globalSettings.sso.tenantIdPlaceholder')}
              value={ssoTenantId}
              onChange={(e) => setSsoTenantId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-client">{t('globalSettings.sso.clientId')}</Label>
            <Input
              id="sso-client"
              placeholder={t('globalSettings.sso.clientIdPlaceholder')}
              value={ssoClientId}
              onChange={(e) => setSsoClientId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sso-secret">{t('globalSettings.sso.clientSecret')}</Label>
            <div className="relative">
              <Input
                id="sso-secret"
                type={showSsoSecret ? "text" : "password"}
                placeholder={t('globalSettings.sso.clientSecretPlaceholder')}
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

          <div className="flex gap-2">
            {ssoConfigured && !isEditing ? (
              <Button variant="outline" onClick={handleEdit}>
                {t('common.edit') || 'Editar'}
              </Button>
            ) : (
              <Button onClick={handleSaveSso} disabled={loadingSso}>
                {loadingSso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('globalSettings.sso.save')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Azure AD Group Mapping Card */}
      <AzureGroupMappingCard />
    </div>
  );
}
