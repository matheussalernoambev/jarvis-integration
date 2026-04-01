import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import azureLogo from "@/assets/azure-logo.png";
import beyondtrustLogo from "@/assets/beyondtrust-logo.png";

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

/* ============================================================
   Auth Page
   ============================================================ */
const Auth = () => {
  const navigate = useNavigate();
  const { session, signIn } = useAuth();

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (session) {
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  const jarvisStyles = `
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

    .jarvis-btn-enter {
      position: relative;
      overflow: hidden;
      border: 2px solid transparent;
      background-image: linear-gradient(hsl(220, 25%, 8%), hsl(220, 25%, 8%)), linear-gradient(90deg, hsl(45, 100%, 45%), hsl(45, 100%, 65%), hsl(45, 100%, 45%));
      background-origin: border-box;
      background-clip: padding-box, border-box;
      transition: all 0.3s ease;
    }
    .jarvis-btn-enter:hover {
      background-image: linear-gradient(hsl(45, 100%, 58%, 0.1), hsl(45, 100%, 58%, 0.05)), linear-gradient(90deg, hsl(45, 100%, 50%), hsl(45, 100%, 70%), hsl(45, 100%, 50%));
      transform: scale(1.02);
    }
    .jarvis-btn-enter::after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, transparent, hsl(45, 100%, 58%, 0.15), transparent);
      animation: jarvis-sweep 3s ease-in-out infinite;
    }
  `;

  const subtitleText = "Just Automated Resource Vaulting & Integration System";

  return (
    <>
      <style>{jarvisStyles}</style>

      <div
        className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, hsl(220, 25%, 6%) 0%, hsl(220, 20%, 12%) 50%, hsl(220, 25%, 6%) 100%)' }}
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
              background: 'linear-gradient(135deg, rgba(20, 25, 40, 0.85) 0%, rgba(12, 15, 25, 0.95) 100%)',
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
                v1.0
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

            {/* Subtitle - acronym letters highlighted */}
            <p
              className="jarvis-font-body text-center text-sm mb-8 leading-relaxed"
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
              className="w-full h-px mb-8"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 198, 41, 0.4) 50%, transparent 100%)',
              }}
            />

            {/* Single Enter Button */}
            <Button
              onClick={signIn}
              className="jarvis-btn-enter jarvis-font-title w-full h-14 rounded text-base font-semibold tracking-[0.25em] uppercase"
              style={{ color: 'hsl(45, 100%, 58%)' }}
            >
              ENTRAR
              <ChevronRight className="ml-2 h-5 w-5" style={{ color: 'hsl(45, 100%, 58%)' }} />
            </Button>

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
            AB INBEV
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
