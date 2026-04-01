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

/* ============================================================
   Arc Reactor SVG component - pure CSS/SVG animated
   ============================================================ */
const ArcReactor = () => (
  <div className="relative w-[120px] h-[120px] mx-auto">
    <svg viewBox="0 0 120 120" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(45, 100%, 90%)" />
          <stop offset="40%" stopColor="hsl(45, 100%, 58%)" />
          <stop offset="100%" stopColor="hsl(45, 100%, 30%)" stopOpacity="0" />
        </radialGradient>
        <filter id="glow-filter">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="core-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer ring - slow rotation */}
      <g style={{ transformOrigin: '60px 60px', animation: 'jarvis-rotate 12s linear infinite' }}>
        <circle cx="60" cy="60" r="55" fill="none" stroke="hsl(45, 100%, 58%)" strokeWidth="1" opacity="0.3" />
        <circle cx="60" cy="60" r="55" fill="none" stroke="hsl(45, 100%, 58%)" strokeWidth="2"
          strokeDasharray="12 8 4 8" opacity="0.6" filter="url(#glow-filter)" />
        {/* Tick marks on outer ring */}
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line key={`outer-${deg}`}
            x1="60" y1="7" x2="60" y2="12"
            stroke="hsl(45, 100%, 58%)" strokeWidth="1.5" opacity="0.7"
            transform={`rotate(${deg} 60 60)`}
          />
        ))}
      </g>

      {/* Middle ring - reverse rotation */}
      <g style={{ transformOrigin: '60px 60px', animation: 'jarvis-rotate-reverse 8s linear infinite' }}>
        <circle cx="60" cy="60" r="42" fill="none" stroke="hsl(45, 100%, 58%)" strokeWidth="1.5"
          strokeDasharray="6 4 2 4" opacity="0.5" filter="url(#glow-filter)" />
        {/* Segments */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <line key={`mid-${deg}`}
            x1="60" y1="20" x2="60" y2="28"
            stroke="hsl(45, 100%, 70%)" strokeWidth="2" opacity="0.6"
            transform={`rotate(${deg} 60 60)`}
          />
        ))}
      </g>

      {/* Inner ring - slow rotation */}
      <g style={{ transformOrigin: '60px 60px', animation: 'jarvis-rotate 6s linear infinite' }}>
        <circle cx="60" cy="60" r="30" fill="none" stroke="hsl(45, 100%, 58%)" strokeWidth="1"
          strokeDasharray="3 5" opacity="0.4" />
        {/* Small triangle indicators */}
        {[0, 90, 180, 270].map((deg) => (
          <polygon key={`tri-${deg}`}
            points="60,32 58,37 62,37"
            fill="hsl(45, 100%, 58%)" opacity="0.8"
            transform={`rotate(${deg} 60 60)`}
          />
        ))}
      </g>

      {/* Core - glowing center */}
      <circle cx="60" cy="60" r="14" fill="url(#core-glow)" filter="url(#core-filter)"
        style={{ animation: 'jarvis-core-pulse 2s ease-in-out infinite' }} />
      <circle cx="60" cy="60" r="8" fill="hsl(45, 100%, 85%)" opacity="0.9"
        style={{ animation: 'jarvis-core-pulse 2s ease-in-out infinite alternate' }} />
      <circle cx="60" cy="60" r="3" fill="white" opacity="0.95" />
    </svg>
  </div>
);

/* ============================================================
   Floating HUD Particles (pure CSS-driven)
   ============================================================ */
const HudParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 6,
    duration: Math.random() * 4 + 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: 'hsl(45, 100%, 58%)',
            opacity: 0,
            animation: `jarvis-particle ${p.duration}s ${p.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
};

/* ============================================================
   HUD Corner decorators
   ============================================================ */
const HudCorner = ({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const base = "absolute w-5 h-5 pointer-events-none";
  const gold = "hsl(45, 100%, 58%)";
  const posClass = {
    tl: "top-0 left-0",
    tr: "top-0 right-0",
    bl: "bottom-0 left-0",
    br: "bottom-0 right-0",
  }[position];

  const borderStyle = {
    tl: { borderTop: `2px solid ${gold}`, borderLeft: `2px solid ${gold}` },
    tr: { borderTop: `2px solid ${gold}`, borderRight: `2px solid ${gold}` },
    bl: { borderBottom: `2px solid ${gold}`, borderLeft: `2px solid ${gold}` },
    br: { borderBottom: `2px solid ${gold}`, borderRight: `2px solid ${gold}` },
  }[position];

  return <div className={`${base} ${posClass}`} style={borderStyle} />;
};

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
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#1a1816' }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  /* ============================================================
     JARVIS HUD styles - injected via <style> tag
     ============================================================ */
  const jarvisStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');

    @keyframes jarvis-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes jarvis-rotate-reverse {
      from { transform: rotate(360deg); }
      to { transform: rotate(0deg); }
    }
    @keyframes jarvis-core-pulse {
      0%, 100% { opacity: 0.7; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }
    @keyframes jarvis-particle {
      0% { opacity: 0; transform: translateY(0) scale(0.5); }
      20% { opacity: 0.6; }
      50% { opacity: 0.3; transform: translateY(-30px) scale(1); }
      80% { opacity: 0.5; }
      100% { opacity: 0; transform: translateY(-60px) scale(0.5); }
    }
    @keyframes jarvis-scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes jarvis-sweep {
      0% { left: -100%; }
      100% { left: 200%; }
    }
    @keyframes jarvis-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    @keyframes jarvis-grid-pulse {
      0%, 100% { opacity: 0.03; }
      50% { opacity: 0.07; }
    }
    @keyframes jarvis-border-glow {
      0%, 100% { box-shadow: 0 0 5px hsl(45, 100%, 58%, 0.2), inset 0 0 5px hsl(45, 100%, 58%, 0.05); }
      50% { box-shadow: 0 0 15px hsl(45, 100%, 58%, 0.3), inset 0 0 10px hsl(45, 100%, 58%, 0.1); }
    }
    @keyframes jarvis-title-flicker {
      0%, 100% { text-shadow: 0 0 10px hsl(45, 100%, 58%, 0.5), 0 0 20px hsl(45, 100%, 58%, 0.3), 0 0 40px hsl(45, 100%, 58%, 0.1); }
      50% { text-shadow: 0 0 15px hsl(45, 100%, 58%, 0.7), 0 0 30px hsl(45, 100%, 58%, 0.4), 0 0 60px hsl(45, 100%, 58%, 0.2); }
    }

    .jarvis-font-title {
      font-family: 'Orbitron', monospace, sans-serif;
    }
    .jarvis-font-body {
      font-family: 'Rajdhani', 'DM Sans', sans-serif;
    }
    .jarvis-font-mono {
      font-family: 'Share Tech Mono', monospace;
    }

    .jarvis-input:focus {
      border-color: hsl(45, 100%, 58%) !important;
      box-shadow: 0 0 0 1px hsl(45, 100%, 58%, 0.3), 0 0 12px hsl(45, 100%, 58%, 0.15) !important;
    }
    .jarvis-input::placeholder {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }

    .jarvis-btn-initialize {
      position: relative;
      overflow: hidden;
      border: 2px solid transparent;
      background-image: linear-gradient(#1a1816, #1a1816), linear-gradient(90deg, hsl(45, 100%, 45%), hsl(45, 100%, 65%), hsl(45, 100%, 45%));
      background-origin: border-box;
      background-clip: padding-box, border-box;
      transition: all 0.3s ease;
    }
    .jarvis-btn-initialize:hover {
      background-image: linear-gradient(hsl(45, 100%, 58%, 0.1), hsl(45, 100%, 58%, 0.05)), linear-gradient(90deg, hsl(45, 100%, 50%), hsl(45, 100%, 70%), hsl(45, 100%, 50%));
    }
    .jarvis-btn-initialize::after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, transparent, hsl(45, 100%, 58%, 0.15), transparent);
      animation: jarvis-sweep 3s ease-in-out infinite;
    }

    .jarvis-btn-sso {
      position: relative;
      overflow: hidden;
      background: transparent;
      border: 1px solid hsl(45, 100%, 58%, 0.4);
      transition: all 0.3s ease;
    }
    .jarvis-btn-sso:hover {
      border-color: hsl(45, 100%, 58%, 0.8);
      background: hsl(45, 100%, 58%, 0.08);
      box-shadow: 0 0 20px hsl(45, 100%, 58%, 0.15);
    }
  `;

  const subtitleText = "Just Automated Resource Vaulting & Integration System";

  return (
    <>
      <style>{jarvisStyles}</style>

      <div
        className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #1a1816 0%, #2d2a26 50%, #1a1816 100%)' }}
      >
        {/* Scan lines overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          aria-hidden="true"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 198, 41, 0.015) 2px, rgba(255, 198, 41, 0.015) 4px)',
          }}
        />

        {/* Animated grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 198, 41, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 198, 41, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            animation: 'jarvis-grid-pulse 4s ease-in-out infinite',
          }}
        />

        {/* Floating particles */}
        <HudParticles />

        {/* Moving scan line */}
        <div
          className="absolute left-0 right-0 h-px pointer-events-none z-[2]"
          aria-hidden="true"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, hsl(45, 100%, 58%, 0.3) 50%, transparent 100%)',
            animation: 'jarvis-scanline 6s linear infinite',
          }}
        />

        {/* Language Selector - Top Right */}
        <div className="absolute top-4 right-4 z-30">
          <LanguageSelector />
        </div>

        {/* Main Card Container */}
        <div
          className="relative z-10 w-full max-w-md mx-4"
          style={{ animation: 'jarvis-border-glow 3s ease-in-out infinite' }}
        >
          {/* HUD Corners */}
          <div className="absolute -top-2 -left-2 -right-2 -bottom-2 pointer-events-none">
            <HudCorner position="tl" />
            <HudCorner position="tr" />
            <HudCorner position="bl" />
            <HudCorner position="br" />
          </div>

          {/* Glass panel */}
          <div
            className="relative rounded-lg p-8 pt-6"
            style={{
              background: 'linear-gradient(135deg, rgba(45, 42, 38, 0.85) 0%, rgba(26, 24, 22, 0.95) 100%)',
              border: '1px solid rgba(255, 198, 41, 0.2)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Top status bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: '#4ade80',
                    boxShadow: '0 0 6px #4ade80',
                    animation: 'jarvis-blink 2s ease-in-out infinite',
                  }}
                />
                <span
                  className="jarvis-font-mono text-xs uppercase"
                  style={{ color: 'rgba(255, 198, 41, 0.6)', letterSpacing: '0.15em' }}
                >
                  SYSTEM ONLINE
                </span>
              </div>
              <span
                className="jarvis-font-mono text-xs"
                style={{ color: 'rgba(255, 198, 41, 0.4)', letterSpacing: '0.1em' }}
              >
                v4.2.1
              </span>
            </div>

            {/* Arc Reactor */}
            <ArcReactor />

            {/* Title */}
            <h1
              className="jarvis-font-title text-center text-3xl font-bold mt-5 mb-1 tracking-[0.2em]"
              style={{
                color: 'hsl(45, 100%, 58%)',
                animation: 'jarvis-title-flicker 3s ease-in-out infinite',
              }}
            >
              J.A.R.V.I.S.
            </h1>

            {/* Subtitle - each word, acronym letters highlighted */}
            <p
              className="jarvis-font-body text-center text-sm mb-6 leading-relaxed"
              style={{ color: 'rgba(234, 234, 234, 0.6)', letterSpacing: '0.05em' }}
            >
              {subtitleText.split(' ').map((word, wi) => {
                const acronymLetters = ['J', 'A', 'R', 'V', 'I', 'S'];
                const firstChar = word.charAt(0).toUpperCase();
                const isAcronymWord = acronymLetters.includes(firstChar) && (
                  (wi === 0 && firstChar === 'J') ||
                  (wi === 1 && firstChar === 'A') ||
                  (wi === 2 && firstChar === 'R') ||
                  (wi === 3 && firstChar === 'V') ||
                  (wi === 4) ||
                  (wi === 5 && firstChar === 'I') ||
                  (wi === 6 && firstChar === 'S')
                );
                return (
                  <span key={wi}>
                    {wi > 0 && ' '}
                    {isAcronymWord ? (
                      <>
                        <span style={{ color: 'hsl(45, 100%, 58%)', fontWeight: 600 }}>{word.charAt(0)}</span>
                        <span>{word.slice(1)}</span>
                      </>
                    ) : (
                      <span>{word}</span>
                    )}
                  </span>
                );
              })}
            </p>

            {/* Divider line */}
            <div
              className="w-full h-px mb-6"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 198, 41, 0.4) 50%, transparent 100%)',
              }}
            />

            {/* Loading State for SSO Check */}
            {ssoConfigured === null ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'rgba(255, 198, 41, 0.6)' }} />
                <span
                  className="jarvis-font-mono text-xs uppercase"
                  style={{ color: 'rgba(255, 198, 41, 0.4)', letterSpacing: '0.15em' }}
                >
                  CHECKING SYSTEMS...
                </span>
              </div>
            ) : ssoConfigured === true ? (
              /* SSO Only Mode */
              <div className="space-y-5">
                {/* SSO Label */}
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4" style={{ color: 'hsl(45, 100%, 58%)' }} />
                  <span
                    className="jarvis-font-mono text-xs uppercase"
                    style={{ color: 'rgba(255, 198, 41, 0.7)', letterSpacing: '0.15em' }}
                  >
                    AUTHENTICATION
                  </span>
                </div>

                <Button
                  onClick={handleMicrosoftLogin}
                  disabled={loading}
                  className="jarvis-btn-initialize jarvis-font-body w-full h-12 rounded text-sm font-semibold tracking-[0.15em] uppercase"
                  style={{
                    color: 'hsl(45, 100%, 58%)',
                  }}
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

                <p
                  className="jarvis-font-mono text-center text-xs"
                  style={{ color: 'rgba(255, 198, 41, 0.35)', letterSpacing: '0.1em' }}
                >
                  {t('auth.ssoOnly')}
                </p>
              </div>
            ) : (
              /* Full Login Mode */
              <div className="space-y-5">
                {/* Section Label */}
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4" style={{ color: 'hsl(45, 100%, 58%)' }} />
                  <span
                    className="jarvis-font-mono text-xs uppercase"
                    style={{ color: 'rgba(255, 198, 41, 0.7)', letterSpacing: '0.15em' }}
                  >
                    AUTHENTICATION
                  </span>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="email"
                      className="jarvis-font-mono text-xs uppercase"
                      style={{ color: 'rgba(255, 198, 41, 0.6)', letterSpacing: '0.15em' }}
                    >
                      {t('auth.email')}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="operator@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loadingEmail}
                      className="jarvis-input jarvis-font-body h-11 rounded border text-sm"
                      style={{
                        background: 'rgba(26, 24, 22, 0.8)',
                        borderColor: 'rgba(255, 198, 41, 0.2)',
                        color: '#eaeaea',
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="password"
                      className="jarvis-font-mono text-xs uppercase"
                      style={{ color: 'rgba(255, 198, 41, 0.6)', letterSpacing: '0.15em' }}
                    >
                      {t('auth.password')}
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loadingEmail}
                      className="jarvis-input jarvis-font-body h-11 rounded border text-sm"
                      style={{
                        background: 'rgba(26, 24, 22, 0.8)',
                        borderColor: 'rgba(255, 198, 41, 0.2)',
                        color: '#eaeaea',
                      }}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={loadingEmail}
                    className="jarvis-btn-initialize jarvis-font-body w-full h-11 rounded text-sm font-semibold tracking-[0.15em] uppercase"
                    style={{
                      color: 'hsl(45, 100%, 58%)',
                    }}
                  >
                    {loadingEmail ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" style={{ color: 'hsl(45, 100%, 58%)' }} />
                    )}
                    <span className="jarvis-font-title text-xs tracking-[0.2em]">
                      {isSignUp ? t('auth.createAccount') : 'INITIALIZE'}
                    </span>
                  </Button>
                </form>

                {/* Toggle Sign Up / Sign In */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="jarvis-font-mono text-xs hover:underline"
                    style={{ color: 'hsl(45, 100%, 58%)', letterSpacing: '0.05em' }}
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
                    <span
                      className="w-full h-px"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(255, 198, 41, 0.25), transparent)' }}
                    />
                  </div>
                  <div className="relative flex justify-center">
                    <span
                      className="jarvis-font-mono px-3 text-xs uppercase"
                      style={{
                        background: 'linear-gradient(135deg, rgba(45, 42, 38, 0.95), rgba(26, 24, 22, 0.95))',
                        color: 'rgba(255, 198, 41, 0.4)',
                        letterSpacing: '0.15em',
                      }}
                    >
                      {t('auth.or')}
                    </span>
                  </div>
                </div>

                {/* Microsoft SSO Button */}
                <Button
                  onClick={handleMicrosoftLogin}
                  disabled={loading}
                  variant="outline"
                  className="jarvis-btn-sso jarvis-font-body w-full h-11 rounded text-sm font-medium tracking-wider uppercase"
                  style={{ color: '#eaeaea' }}
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

            {/* Footer - Integration Badges */}
            <div className="mt-8 pt-4" style={{ borderTop: '1px solid rgba(255, 198, 41, 0.1)' }}>
              <div className="flex items-center justify-center gap-4">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded"
                  style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 198, 41, 0.1)' }}
                >
                  <img src={azureLogo} alt="Microsoft Azure" className="w-5 h-5 object-contain opacity-70" />
                  <span
                    className="jarvis-font-mono text-[10px] uppercase"
                    style={{ color: 'rgba(234, 234, 234, 0.4)', letterSpacing: '0.1em' }}
                  >
                    Azure
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(255, 198, 41, 0.4)' }} />
                  <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(255, 198, 41, 0.25)' }} />
                  <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(255, 198, 41, 0.4)' }} />
                </div>

                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded"
                  style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 198, 41, 0.1)' }}
                >
                  <img src={beyondtrustLogo} alt="BeyondTrust" className="w-5 h-5 object-contain opacity-70" />
                  <span
                    className="jarvis-font-mono text-[10px] uppercase"
                    style={{ color: 'rgba(234, 234, 234, 0.4)', letterSpacing: '0.1em' }}
                  >
                    BeyondTrust
                  </span>
                </div>
              </div>

              {/* Terms notice */}
              <p
                className="jarvis-font-mono text-center text-[10px] mt-4"
                style={{ color: 'rgba(234, 234, 234, 0.2)', letterSpacing: '0.05em' }}
              >
                Ao continuar, você concorda com os Termos de Serviço e Política de Privacidade
              </p>
            </div>
          </div>
        </div>

        {/* Bottom HUD decorative bar */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10"
          aria-hidden="true"
        >
          <div className="w-16 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255, 198, 41, 0.3))' }} />
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'hsl(45, 100%, 58%)', boxShadow: '0 0 6px hsl(45, 100%, 58%)', animation: 'jarvis-blink 3s ease-in-out infinite' }}
          />
          <span
            className="jarvis-font-mono text-[10px] uppercase"
            style={{ color: 'rgba(255, 198, 41, 0.3)', letterSpacing: '0.2em' }}
          >
            STARK INDUSTRIES
          </span>
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'hsl(45, 100%, 58%)', boxShadow: '0 0 6px hsl(45, 100%, 58%)', animation: 'jarvis-blink 3s ease-in-out infinite 1.5s' }}
          />
          <div className="w-16 h-px" style={{ background: 'linear-gradient(90deg, rgba(255, 198, 41, 0.3), transparent)' }} />
        </div>
      </div>
    </>
  );
};

export default Auth;
