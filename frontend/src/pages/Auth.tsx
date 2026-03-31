import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, Mail, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/pkce";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/LanguageSelector";
import azureLogo from "@/assets/azure-logo.png";
import beyondtrustLogo from "@/assets/beyondtrust-logo.png";

// Microsoft Logo Component
const MicrosoftIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

// Circular Arrows Component - ABInBev Gold Theme
const CircularArrows = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Top Arrow - Left to Right */}
    <path
      d="M20 25 Q60 5 100 25"
      stroke="url(#arrow-gradient-1)"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      strokeDasharray="5 3"
      className="animate-arrow-flow"
    />
    <polygon points="100,20 105,28 95,28" fill="hsl(45, 100%, 58%)" className="animate-sync-pulse"/>

    {/* Bottom Arrow - Right to Left */}
    <path
      d="M100 55 Q60 75 20 55"
      stroke="url(#arrow-gradient-2)"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
      strokeDasharray="5 3"
      className="animate-arrow-flow"
      style={{ animationDelay: '0.75s' }}
    />
    <polygon points="20,60 15,52 25,52" fill="hsl(45, 100%, 58%)" className="animate-sync-pulse" style={{ animationDelay: '0.75s' }}/>

    <defs>
      <linearGradient id="arrow-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="hsl(45, 100%, 58%)"/>
        <stop offset="100%" stopColor="hsl(45, 100%, 45%)"/>
      </linearGradient>
      <linearGradient id="arrow-gradient-2" x1="100%" y1="0%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="hsl(45, 100%, 45%)"/>
        <stop offset="100%" stopColor="hsl(45, 100%, 58%)"/>
      </linearGradient>
    </defs>
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ssoConfigured, setSsoConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSsoConfig = async () => {
      try {
        const data = await api.get<{ configured: boolean; enabled: boolean }>('/credentials/sso-status');
        setSsoConfigured(data.configured && data.enabled);
      } catch (e: any) {
        console.error('[Auth] SSO check failed:', e.message || e);
        setSsoConfigured(false);
      }
    };

    const checkSession = async () => {
      try {
        const data = await api.get<{ user: any }>('/auth/session');
        if (data?.user) {
          navigate("/", { replace: true });
        }
      } catch {
        // No session
      }
      setCheckingSession(false);
    };

    checkSsoConfig();
    checkSession();
  }, [navigate, toast]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: t('common.error'),
        description: !email ? t('auth.emailRequired') : t('auth.passwordRequired'),
        variant: "destructive",
      });
      return;
    }

    setLoadingEmail(true);
    try {
      const data = await api.post<{ success: boolean; error?: string }>('/auth/login', { email, password });

      if (!data.success) {
        throw new Error(data.error || t('auth.invalidCredentials'));
      }

      navigate("/", { replace: true });
    } catch (error: any) {
      console.error('Auth Error:', error);
      toast({
        title: t('auth.loginError'),
        description: error.message || t('auth.invalidCredentials'),
        variant: "destructive",
      });
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoading(true);
    try {
      const config = await api.get<{ configured: boolean; tenant_id?: string; client_id?: string }>('/credentials/sso-login-config');

      if (!config.configured || !config.tenant_id || !config.client_id) {
        throw new Error("SSO Microsoft não configurado. Configure em Settings → Integrações → Microsoft.");
      }

      const { tenant_id: tenantId, client_id: clientId } = config;

      // Validate GUID format
      const isValidGuid = (value: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

      if (!isValidGuid(tenantId)) {
        throw new Error(`Tenant ID inválido. Reconfigure em Settings → Integrações → Microsoft.`);
      }

      if (!isValidGuid(clientId)) {
        throw new Error(`Client ID inválido. Reconfigure em Settings → Integrações → Microsoft.`);
      }

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateState();

      sessionStorage.setItem('pkce_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/callback`);
      authUrl.searchParams.set('scope', 'openid email profile User.Read');
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);

      window.location.href = authUrl.toString();
    } catch (error: any) {
      console.error('[SSO] Error:', error);
      toast({
        title: "Erro de Autenticação",
        description: error.message || "Não foi possível iniciar o login com Microsoft",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-dark">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const features = [
    t('auth.features.sync'),
    t('auth.features.onboarding'),
    t('auth.features.monitoring'),
  ];

  return (
    <div className="min-h-screen flex">
      {/* Login Sidebar - Dark Theme */}
      <aside className="w-full lg:w-[420px] bg-brand-dark flex flex-col justify-center p-8 lg:p-12 relative z-10">
        {/* Language Selector - Top Right */}
        <div className="absolute top-4 right-4">
          <LanguageSelector />
        </div>

        <div className="max-w-sm mx-auto w-full space-y-8">
          {/* Logo and Title */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-brand-light">Azure Integration</h1>
                <p className="text-sm text-brand-light/60">PasswordSafe Manager</p>
              </div>
            </div>
          </div>

          {/* Welcome Message */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-brand-light">
              {isSignUp ? t('auth.createAccount') : t('auth.welcome')}
            </h2>
            <p className="text-brand-light/70 text-sm">
              {isSignUp
                ? t('auth.createAccountSubtitle')
                : t('auth.subtitle')
              }
            </p>
          </div>

          {/* Loading State for SSO Check */}
          {ssoConfigured === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-light/50" />
            </div>
          ) : ssoConfigured === true ? (
            /* SSO Only Mode */
            <div className="space-y-6">
              <Button
                onClick={handleMicrosoftLogin}
                disabled={loading}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <span className="mr-3">
                    <MicrosoftIcon />
                  </span>
                )}
                {t('auth.signInWithMicrosoft')}
              </Button>

              <p className="text-center text-sm text-brand-light/60">
                {t('auth.ssoOnly')}
              </p>
            </div>
          ) : (
            /* Full Login Mode */
            <div className="space-y-6">
              {/* Email/Password Form */}
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-brand-light">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loadingEmail}
                    className="bg-brand-dark/50 border-brand-light/20 text-brand-light placeholder:text-brand-light/40 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-brand-light">{t('auth.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loadingEmail}
                    className="bg-brand-dark/50 border-brand-light/20 text-brand-light placeholder:text-brand-light/40 focus:ring-primary focus:border-primary"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={loadingEmail}
                  className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                >
                  {loadingEmail ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-4 w-4" />
                  )}
                  {isSignUp ? t('auth.createAccount') : t('auth.login')}
                </Button>
              </form>

              {/* Toggle Sign Up / Sign In */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-primary hover:underline"
                >
                  {isSignUp
                    ? `${t('auth.hasAccount')} ${t('auth.signIn')}`
                    : `${t('auth.noAccount')} ${t('auth.signUp')}`
                  }
                </button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-brand-light/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-brand-dark px-3 text-brand-light/50">{t('auth.or')}</span>
                </div>
              </div>

              {/* Microsoft SSO Button */}
              <Button
                onClick={handleMicrosoftLogin}
                disabled={loading}
                className="w-full h-11 bg-transparent border-2 border-primary hover:bg-primary/10 text-brand-light"
                variant="outline"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <span className="mr-3">
                    <MicrosoftIcon />
                  </span>
                )}
                {t('auth.signInWithMicrosoft')}
              </Button>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-brand-light/40 pt-4">
            Ao continuar, você concorda com os Termos de Serviço e Política de Privacidade
          </p>
        </div>
      </aside>

      {/* Hero Visual Section - ABInBev Style */}
      <main className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-brand-dark">
        {/* Decorative Chevrons */}
        <div className="absolute left-8 top-1/4 opacity-30">
          <ChevronRight className="w-24 h-32 text-primary" strokeWidth={3} />
        </div>
        <div className="absolute left-4 top-1/3 opacity-20">
          <ChevronRight className="w-16 h-24 text-primary" strokeWidth={2} />
        </div>
        <div className="absolute right-12 bottom-1/4 opacity-20 rotate-180">
          <ChevronRight className="w-20 h-28 text-primary" strokeWidth={2} />
        </div>

        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, hsl(45, 100%, 58%) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }} />
        </div>

        {/* Main Content */}
        <div className="relative z-10 px-12 max-w-2xl text-center">
          {/* Logos Section - Azure + BeyondTrust */}
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className="w-24 h-24 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-primary/30 shadow-lg shadow-primary/10 animate-slide-up">
              <img
                src={azureLogo}
                alt="Microsoft Azure"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex flex-col items-center">
              <CircularArrows className="w-32 h-20 animate-glow" />
            </div>

            <div className="w-24 h-24 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-primary/30 shadow-lg shadow-primary/10 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <img
                src={beyondtrustLogo}
                alt="BeyondTrust"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* Title with ABInBev Style */}
          <h1 className="text-4xl lg:text-5xl font-bold uppercase tracking-tight mb-4">
            <span className="text-primary">Azure Integration</span>
            <br />
            <span className="text-brand-light">PasswordSafe Manager</span>
          </h1>

          <p className="text-brand-light/70 text-lg mb-10">
            Automatize o onboarding de máquinas virtuais Azure no BeyondTrust PasswordSafe
          </p>

          {/* Features with ABInBev Card Style */}
          <div className="space-y-3 max-w-md mx-auto">
            {features.map((feature, i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-l-4 border-primary bg-white/5 backdrop-blur-sm px-4 py-3 text-left animate-slide-up"
                style={{ animationDelay: `${(i + 2) * 0.1}s` }}
              >
                <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                <span className="text-brand-light">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Auth;
