"use client";

import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import googleLogo from '../../assets/brands/google.svg';
import xLogo from '../../assets/brands/x.svg';

interface AuthShellProps {
  title: string;
  subtitle?: React.ReactNode;
  link?: React.ReactNode;
  onBack?: () => void;
  children: React.ReactNode;
  showSocial?: boolean;
  showTerms?: boolean;
  containerClassName?: string;
  cardClassName?: string;
}

const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  children,
  className,
  ...props
}) => (
  <button
    className={cn(
      'rounded-md bg-brand-500 px-4 py-2 text-lg text-white shadow-glow/30 shadow ring-2 ring-brand-400/40 ring-offset-2 ring-offset-white transition-all hover:bg-brand-600 hover:scale-[1.02] hover:ring-transparent active:scale-[0.98] active:ring-brand-500/70',
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

const SocialButton: React.FC<{
  icon?: React.ReactNode;
  fullWidth?: boolean;
  children?: React.ReactNode;
}> = ({ icon, fullWidth, children }) => (
  <button
    type="button"
    className={cn(
      'relative z-0 flex items-center justify-center gap-2 overflow-hidden rounded-md border border-zinc-300 bg-zinc-100 px-4 py-2 font-semibold text-zinc-800 transition-all duration-500 before:absolute before:inset-0 before:-z-10 before:translate-x-[150%] before:translate-y-[150%] before:scale-[2.5] before:rounded-[100%] before:bg-zinc-800 before:transition-transform before:duration-1000 before:content-[""] hover:scale-105 hover:text-zinc-100 hover:before:translate-x-[0%] hover:before:translate-y-[0%] active:scale-95',
      fullWidth && 'col-span-2',
    )}
  >
    {icon}
    <span>{children}</span>
  </button>
);

const Divider: React.FC = () => (
  <div className="my-6 flex items-center gap-3">
    <div className="h-[1px] w-full bg-zinc-300" />
    <span className="text-zinc-500">OR</span>
    <div className="h-[1px] w-full bg-zinc-300" />
  </div>
);

const SocialButtons: React.FC = () => (
  <div className="mb-6 space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <SocialButton icon={<img src={xLogo} alt="X" className="h-4 w-4 text-zinc-900 dark:invert" />} />
      <SocialButton icon={<img src={googleLogo} alt="Google" className="h-4 w-4" />} />
    </div>
  </div>
);

const TermsAndConditions: React.FC = () => (
  <p className="mt-9 text-xs text-zinc-500">
    By signing in, you agree to our{' '}
    <a href="#" className="text-blue-600">
      Terms & Conditions
    </a>{' '}
    and{' '}
    <a href="#" className="text-blue-600">
      Privacy Policy.
    </a>
  </p>
);

const BackgroundDecoration: React.FC = () => (
  <div
    className="absolute right-0 top-0 z-0 size-[50vw]"
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke-width='2' stroke='rgb(30 58 138 / 0.35)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e\")",
    }}
  >
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'radial-gradient(100% 100% at 100% 0%, rgba(255,255,255,0), rgba(255,255,255,1))',
      }}
    />
  </div>
);

const Logo: React.FC = () => (
  <div className="mb-6 flex justify-center items-center">
    <img
      src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=64&h=64&fit=crop&auto=format"
      alt="Tenax"
      className="h-8 w-8 rounded-full object-cover"
    />
    <span className="ml-2 text-xl font-bold">Tenax</span>
  </div>
);

const BackButton: React.FC<{ onBack?: () => void }> = ({ onBack }) => (
  <button
    type="button"
    onClick={onBack}
    className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-blue-300 hover:text-blue-700"
  >
    <ChevronLeft size={16} /> Go back
  </button>
);

const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  link,
  onBack,
  children,
  showSocial = true,
  showTerms = true,
  containerClassName,
  cardClassName,
}) => (
  <div className="relative min-h-screen bg-white py-20 text-zinc-800 selection:bg-zinc-300">
    <div className={cn('relative z-10 mx-auto w-full max-w-xl px-4', containerClassName)}>
      {onBack && (
        <div className="mb-6">
          <BackButton onBack={onBack} />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.25, ease: 'easeInOut' }}
        className={cn('relative z-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm', cardClassName)}
      >
        <Logo />
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {(subtitle || link) && (
            <p className="mt-2 text-zinc-500">
              {subtitle} {link}
            </p>
          )}
        </div>
        {showSocial && (
          <>
            <SocialButtons />
            <Divider />
          </>
        )}
        {children}
        {showTerms && <TermsAndConditions />}
      </motion.div>
    </div>
    <BackgroundDecoration />
  </div>
);

export { AuthShell, PrimaryButton };
