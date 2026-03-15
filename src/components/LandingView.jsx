/**
 * Custom landing page for Spyglass
 *
 * Professional, dark-themed landing page designed for developer tools.
 * Features a hero with animated canvas preview, feature grid, keyboard
 * shortcut highlights, and a call-to-action section.
 *
 * @component
 * @returns {JSX.Element} Landing page
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Badge } from '@stevederico/skateboard-ui/shadcn/ui/badge';
import { Separator } from '@stevederico/skateboard-ui/shadcn/ui/separator';

/** Feature items for the grid section */
const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
        <line x1="3" y1="12" x2="7" y2="12" />
        <line x1="17" y1="12" x2="21" y2="12" />
      </svg>
    ),
    title: 'Canvas Composer',
    desc: 'Layer backgrounds, device frames, and marketing text on a live canvas preview.'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'Batch Export',
    desc: '10 device sizes x 28 locales in one click. ASC-ready file naming and zip download.'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: '28 Locales',
    desc: 'Auto-translate marketing text and metadata to every App Store language.'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    title: 'Template System',
    desc: 'Save presets, upload custom fonts, and load starter templates instantly.'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: 'AI Metadata',
    desc: 'Generate descriptions, keywords, and release notes with Grok. ASO suggestions built in.'
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Simulator Capture',
    desc: 'Auto-detect devices, multi-step capture, named screenshots, status bar cropping.'
  }
];

/** Keyboard shortcuts to highlight */
const SHORTCUTS = [
  { keys: ['Cmd', 'Z'], action: 'Undo' },
  { keys: ['Cmd', 'Shift', 'Z'], action: 'Redo' },
  { keys: ['Cmd', 'E'], action: 'Export PNG' }
];

/**
 * Animated grid background pattern
 *
 * @component
 * @returns {JSX.Element} SVG grid overlay
 */
function GridPattern() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}

/**
 * Animated mock device frame for the hero section
 *
 * @component
 * @returns {JSX.Element} Animated device preview
 */
function HeroDevice() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = 320;
    const h = 693;
    canvas.width = w;
    canvas.height = h;

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Device frame area
    const fx = 30;
    const fy = 120;
    const fw = w - 60;
    const fh = h - 180;

    // Screen background
    ctx.fillStyle = '#0f0f1a';
    ctx.beginPath();
    ctx.roundRect(fx, fy, fw, fh, 12);
    ctx.fill();

    // Fake app UI lines
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    for (let i = 0; i < 6; i++) {
      const ly = fy + 40 + i * 60;
      const lw = fw * (0.4 + Math.random() * 0.5);
      ctx.beginPath();
      ctx.roundRect(fx + 20, ly, lw, 8, 4);
      ctx.fill();
    }

    // Marketing text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Track Your Fitness', w / 2, 60);
    ctx.font = '16px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Reach Your Goals', w / 2, 88);
  }, []);

  return (
    <div className="landing-device-glow relative">
      <canvas
        ref={canvasRef}
        className="rounded-2xl border border-white/10 shadow-2xl"
        style={{ width: '240px', height: 'auto' }}
        aria-label="Screenshot composer preview"
      />
    </div>
  );
}

/**
 * Keyboard shortcut badge display
 *
 * @component
 * @param {Object} props
 * @param {string[]} props.keys - Key labels
 * @param {string} props.action - Action description
 * @returns {JSX.Element} Keyboard shortcut display
 */
function ShortcutBadge({ keys, action }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i}>
            <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[11px] text-white/60">
              {key}
            </kbd>
            {i < keys.length - 1 && <span className="mx-0.5 text-white/20">+</span>}
          </span>
        ))}
      </div>
      <span className="text-xs text-white/40">{action}</span>
    </div>
  );
}

export default function LandingView() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  return (
    <div className="landing-root min-h-screen bg-[#09090b] text-white">
      <style>{`
        .landing-root {
          --glow: 99 102 241;
          font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .landing-hero-gradient {
          background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(var(--glow), 0.12) 0%, transparent 70%);
        }
        .landing-device-glow {
          filter: drop-shadow(0 0 80px rgba(var(--glow), 0.15));
        }
        .landing-card {
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .landing-card:hover {
          border-color: rgba(var(--glow), 0.2);
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
        }
        .landing-fade-in {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s ease, transform 0.8s ease;
        }
        .landing-fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .landing-stagger-1 { transition-delay: 0.1s; }
        .landing-stagger-2 { transition-delay: 0.2s; }
        .landing-stagger-3 { transition-delay: 0.3s; }
        .landing-stagger-4 { transition-delay: 0.4s; }
        .landing-stagger-5 { transition-delay: 0.5s; }
        .landing-pill {
          background: rgba(var(--glow), 0.08);
          border: 1px solid rgba(var(--glow), 0.15);
        }
        .landing-cta-gradient {
          background: linear-gradient(135deg, rgba(var(--glow), 0.08) 0%, rgba(var(--glow), 0.02) 100%);
          border: 1px solid rgba(var(--glow), 0.1);
        }
        .landing-footer-line {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
        }
      `}</style>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="21.17" y1="8" x2="12" y2="8" />
              <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
              <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight">Spyglass</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/signin"
            className="rounded-md px-3 py-1.5 text-sm text-white/60 transition-colors hover:text-white"
            aria-label="Sign in to Spyglass"
          >
            Sign In
          </a>
          <a
            href="/signup"
            className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
            aria-label="Get started with Spyglass"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero-gradient relative overflow-hidden pb-20 pt-12 md:pt-20" aria-label="Hero">
        <GridPattern />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 md:flex-row md:gap-16 md:px-12">
          {/* Left: Copy */}
          <div className="flex flex-1 flex-col items-center gap-6 md:items-start">
            <div className={`landing-fade-in ${isVisible ? 'visible' : ''}`}>
              <div className="landing-pill mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" aria-hidden="true" />
                <span className="text-xs font-medium text-indigo-300/80">Built for iOS developers</span>
              </div>
            </div>
            <h1 className={`landing-fade-in landing-stagger-1 ${isVisible ? 'visible' : ''} text-center text-4xl font-bold leading-tight tracking-tight md:text-left md:text-5xl lg:text-6xl`}>
              Deploy to the<br />
              App Store<br />
              <span className="bg-gradient-to-r from-indigo-400 to-indigo-600 bg-clip-text text-transparent">in one click</span>.
            </h1>
            <p className={`landing-fade-in landing-stagger-2 ${isVisible ? 'visible' : ''} max-w-md text-center text-base leading-relaxed text-white/50 md:text-left md:text-lg`}>
              Compose, translate, and batch export App Store screenshots across every device and locale. Manage metadata with AI. Ship faster.
            </p>
            <div className={`landing-fade-in landing-stagger-3 ${isVisible ? 'visible' : ''} flex items-center gap-3`}>
              <a
                href="/signup"
                className="rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-600 hover:shadow-indigo-500/30"
                aria-label="Start using Spyglass for free"
              >
                Start Free
              </a>
              <a
                href="#features"
                className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="View Spyglass features"
              >
                See Features
              </a>
            </div>
            <div className={`landing-fade-in landing-stagger-4 ${isVisible ? 'visible' : ''} flex flex-col gap-1.5 pt-2`}>
              {SHORTCUTS.map((s, i) => (
                <ShortcutBadge key={i} keys={s.keys} action={s.action} />
              ))}
            </div>
          </div>

          {/* Right: Device Preview */}
          <div className={`landing-fade-in landing-stagger-5 ${isVisible ? 'visible' : ''} flex flex-1 justify-center`}>
            <HeroDevice />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto flex max-w-4xl items-center justify-around px-6 py-6">
          <div className="flex flex-col items-center gap-1" aria-label="10 device sizes supported">
            <span className="text-2xl font-bold tracking-tight">10</span>
            <span className="text-[11px] uppercase tracking-widest text-white/30">Device Sizes</span>
          </div>
          <Separator orientation="vertical" className="h-8 bg-white/5" />
          <div className="flex flex-col items-center gap-1" aria-label="28 locales supported">
            <span className="text-2xl font-bold tracking-tight">28</span>
            <span className="text-[11px] uppercase tracking-widest text-white/30">Locales</span>
          </div>
          <Separator orientation="vertical" className="h-8 bg-white/5" />
          <div className="flex flex-col items-center gap-1" aria-label="280 screenshots per batch">
            <span className="text-2xl font-bold tracking-tight">280</span>
            <span className="text-[11px] uppercase tracking-widest text-white/30">Screenshots / Batch</span>
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="relative py-20 md:py-28" aria-label="Features">
        <div className="mx-auto max-w-6xl px-6 md:px-12">
          <div className="mb-14 text-center">
            <Badge variant="outline" className="mb-4 border-white/10 bg-white/5 text-[11px] uppercase tracking-widest text-white/50">
              Features
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need to ship
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-white/40">
              From screenshot composition to App Store Connect upload, Spyglass handles the entire pipeline.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="landing-card rounded-xl p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  {f.icon}
                </div>
                <h3 className="mb-1.5 text-sm font-semibold">{f.title}</h3>
                <p className="text-[13px] leading-relaxed text-white/40">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="border-y border-white/5 bg-white/[0.01] py-20 md:py-28" aria-label="Workflow">
        <div className="mx-auto max-w-4xl px-6 md:px-12">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Three steps. Every screenshot.
            </h2>
          </div>
          <div className="flex flex-col gap-8 md:flex-row md:gap-12">
            {[
              { step: '01', title: 'Compose', desc: 'Design your screenshot with background, device frame, and marketing text on a live canvas.' },
              { step: '02', title: 'Translate', desc: 'Auto-translate text to all 28 App Store locales with manual override for each language.' },
              { step: '03', title: 'Export', desc: 'Batch render every device size and locale combination. Download as a zip or push to ASC.' }
            ].map((s, i) => (
              <div key={i} className="flex flex-1 flex-col gap-3">
                <span className="font-mono text-xs text-indigo-400/60">{s.step}</span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-white/40">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28" aria-label="Call to action">
        <div className="mx-auto max-w-2xl px-6 text-center md:px-12">
          <div className="landing-cta-gradient rounded-2xl px-8 py-14">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Stop making screenshots by hand
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-white/40">
              Spyglass automates the most tedious part of shipping to the App Store. Free to start.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <a
                href="/signup"
                className="rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-600"
                aria-label="Get started with Spyglass"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 md:px-12" aria-label="Footer">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-500/10 text-indigo-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span className="text-xs text-white/30">Spyglass</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="text-xs text-white/30 transition-colors hover:text-white/50" aria-label="Privacy policy">Privacy</a>
            <a href="/terms" className="text-xs text-white/30 transition-colors hover:text-white/50" aria-label="Terms of service">Terms</a>
            <a href="/eula" className="text-xs text-white/30 transition-colors hover:text-white/50" aria-label="End user license agreement">EULA</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
