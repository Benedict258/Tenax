import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { HeroGeometric } from '../components/ui/shape-landing-hero';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';

const heroChips = [
  { label: 'Reminder routing', value: 'Adaptive cadence' },
  { label: 'Quality pulse', value: 'Opik compliant' },
  { label: 'Channels', value: 'WhatsApp + Web' },
];
const whatsappLink = 'http://wa.me/+14155238886?text=join%20pipe-born';

const HeroLanding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#03040b] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/40 via-transparent to-cyan-400/30 blur-[200px]" />
        <div className="absolute inset-0 bg-noise" />
      </div>
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="flex items-center justify-between px-6 py-6 lg:px-12">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-white/60">Tenax</p>
            <p className="text-2xl font-semibold">Execution Companion</p>
          </div>
          <Button
            variant="ghost"
            className="border border-white/20 bg-white/5"
            onClick={() => navigate('/dashboard/today')}
          >
            Enter Command
          </Button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center gap-12 px-6 pb-16 text-center">
          <div className="max-w-4xl space-y-6">
            <p className="text-sm uppercase tracking-[0.4em] text-white/40">Tenax</p>
            <h1 className="text-4xl lg:text-6xl font-semibold leading-tight">Tenax Execution Companion</h1>
            <p className="text-2xl text-white/80">{user?.preferred_name ? `${user.preferred_name}, stay locked in.` : 'Welcome, stay locked in.'}</p>
            <p className="text-xl text-white/70">
              Stay consistent. Adaptive reminders, Opik-aligned messaging, and a WhatsApp + web copilot keeping every
              commitment accountable.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              {heroChips.map((chip) => (
                <div key={chip.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">{chip.label}</p>
                  <p className="text-lg font-semibold">{chip.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            {!user ? (
              <>
                <Button size="lg" className="gap-3" onClick={() => navigate('/login')}>
                  <Zap className="h-5 w-5" />
                  Login
                </Button>
                <Button variant="ghost" className="border border-white/20" onClick={() => navigate('/signup')}>
                  Get Started
                </Button>
              </>
            ) : (
              <Button size="lg" className="gap-3" onClick={() => navigate('/dashboard')}>
                <Zap className="h-5 w-5" />
                Launch Command Deck
              </Button>
            )}
            <p className="text-white/60 text-sm">Your dashboard stays encrypted. This hero is simply the welcome airlock.</p>
          </div>
          <section className="w-full max-w-4xl rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-left">
            <p className="text-xs uppercase tracking-[0.4em] text-white/50">Tenax on WhatsApp</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Execution lives inside WhatsApp</h2>
            <p className="mt-2 text-white/70">
              Reminders, check-ins, and daily execution happen directly in your WhatsApp chat with Tenax. Send the join
              message to connect.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-white/80">
              <span>Number: +1 415 523 8886</span>
              <span className="rounded bg-white/10 px-3 py-1 font-mono text-xs">send “join pipe-born”</span>
            </div>
            <div className="mt-6">
              <Button
                className="border border-green-200 bg-green-100 text-green-900 hover:bg-green-200"
                onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
              >
                Chat with Tenax
              </Button>
            </div>
          </section>
          <div className="w-full max-w-5xl">
            <HeroGeometric
              badge="Ops readiness"
              title1="Tenax frames your day, one decisive block at a time."
              title2="No noise. All execution."
              description="Enter Command to move into the control deck."
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default HeroLanding;
