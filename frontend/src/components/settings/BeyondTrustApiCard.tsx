import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Eye, EyeOff, Loader2, CheckCircle2, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BeyondTrustApiCard() {
  const { toast } = useToast();
  const { t } = useTranslation();

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

  useEffect(() => {
    checkExistingConfig();
  }, []);

  const verifyCredentialsSaved = async (): Promise<boolean> => {
    try {
      const data = await api.get('/credentials/beyondtrust');
      return !!data.configured;
    } catch {
      return false;
    }
  };

  const checkExistingConfig = async () => {
    try {
      const data = await api.get('/credentials/beyondtrust');

      if (data.configured) {
        setBtConfigured(true);
        setBtUrl("https://••••••.pm.beyondtrustcloud.com");
        setBtPsAuth("••••••••••••••••••••••••••••••••");
        setBtUsername("••••••••@••••••.com");
        setBtPassword("••••••••••••••••");
      } else if (localStorage.getItem('bt_credentials_saved')) {
        console.warn('API unavailable, using localStorage fallback');
        setBtConfigured(true);
        setBtUrl("••••• (verify vault)");
        setBtPsAuth("••••• (verify vault)");
        setBtUsername("••••• (verify vault)");
        setBtPassword("••••• (verify vault)");
      }
    } catch (e) {
      console.log('Config check error:', e);
      if (localStorage.getItem('bt_credentials_saved')) {
        setBtConfigured(true);
        setBtUrl("••••• (verify vault)");
        setBtPsAuth("••••• (verify vault)");
        setBtUsername("••••• (verify vault)");
        setBtPassword("••••• (verify vault)");
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
          title: t('common.success'),
          description: t('globalSettings.beyondtrust.saveSuccess'),
        });
        setBtConfigured(true);
      }
    } catch (error: any) {
      if (error.message?.includes('Failed to fetch')) {
        const wasSaved = await verifyCredentialsSaved();
        if (wasSaved) {
          toast({ title: t('common.success'), description: t('globalSettings.beyondtrust.saveSuccess') });
          setBtConfigured(true);
          return;
        }
      }
      toast({
        title: t('common.error'),
        description: error.message || t('globalSettings.beyondtrust.saveError'),
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
          title: t('globalSettings.beyondtrust.testSuccess'),
          description: t('globalSettings.beyondtrust.testSuccessDesc'),
        });
      } else {
        toast({
          title: t('globalSettings.beyondtrust.testError'),
          description: data.error || t('globalSettings.beyondtrust.testError'),
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message || t('globalSettings.beyondtrust.testError'),
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
      setOutboundIp(data.ip || data.origin || 'Not detected');
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('globalSettings.beyondtrust.ipError'),
        variant: "destructive",
      });
    } finally {
      setLoadingOutboundIp(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('globalSettings.beyondtrust.title')}
            </CardTitle>
            <CardDescription>{t('globalSettings.beyondtrust.description')}</CardDescription>
          </div>
          {btConfigured && (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">{t('common.configured')}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bt-url">{t('globalSettings.beyondtrust.url')}</Label>
          <Input
            id="bt-url"
            type="url"
            placeholder={t('globalSettings.beyondtrust.urlPlaceholder')}
            value={btUrl}
            onChange={(e) => setBtUrl(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bt-ps-auth">{t('globalSettings.beyondtrust.apiKey')}</Label>
          <div className="relative">
            <Input
              id="bt-ps-auth"
              type={showBtPsAuth ? "text" : "password"}
              placeholder={t('globalSettings.beyondtrust.apiKeyPlaceholder')}
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
            <Label htmlFor="bt-username">{t('globalSettings.beyondtrust.runAsUser')}</Label>
            <Input
              id="bt-username"
              placeholder={t('globalSettings.beyondtrust.runAsUserPlaceholder')}
              value={btUsername}
              onChange={(e) => setBtUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bt-password">{t('globalSettings.beyondtrust.runAsPassword')}</Label>
            <div className="relative">
              <Input
                id="bt-password"
                type={showBtPassword ? "text" : "password"}
                placeholder={t('globalSettings.beyondtrust.runAsPasswordPlaceholder')}
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
              <h4 className="font-medium">{t('globalSettings.beyondtrust.outboundIP')}</h4>
              <p className="text-sm text-muted-foreground">
                {t('globalSettings.beyondtrust.outboundIPDesc')}
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
                  t('globalSettings.beyondtrust.discoverIP')
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={handleSaveBeyondtrust} disabled={loadingBt}>
            {loadingBt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('globalSettings.beyondtrust.save')}
          </Button>
          <Button variant="outline" onClick={handleTestBeyondtrust} disabled={testingBt || !btConfigured}>
            {testingBt && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('globalSettings.beyondtrust.test')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
