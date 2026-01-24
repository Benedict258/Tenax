"use client";

import React, { createContext, useContext, useState } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SidebarLinkItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};

interface SidebarProviderProps {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: SidebarProviderProps) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp ?? openState;
  const setOpen = setOpenProp ?? setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

interface SidebarProps {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}

export const Sidebar = ({ children, open, setOpen, animate }: SidebarProps) => (
  <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
    {children}
  </SidebarProvider>
);

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => (
  <>
    <DesktopSidebar {...props} />
    <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
  </>
);

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();

  return (
    <motion.div
      className={cn(
        'h-full px-4 py-6 hidden lg:flex lg:flex-col bg-neutral-900/70 backdrop-blur-xl border-r border-white/5 text-white w-[280px] flex-shrink-0',
        className,
      )}
      animate={{ width: animate ? (open ? 280 : 72) : 280 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) => {
  const { open, setOpen } = useSidebar();

  return (
    <div className="lg:hidden" {...props}>
      <div className="flex items-center justify-between px-4 py-4 text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-white/60">Menu</p>
        <Menu className="h-6 w-6 cursor-pointer" onClick={() => setOpen(!open)} />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-xl p-10 flex flex-col justify-between',
              className,
            )}
          >
            <button
              aria-label="Close menu"
              className="absolute right-8 top-8 text-white"
              onClick={() => setOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface SidebarLinkProps extends Omit<LinkProps, 'to'> {
  link: SidebarLinkItem;
  className?: string;
}

export const SidebarLink = ({ link, className, ...props }: SidebarLinkProps) => {
  const { open, animate } = useSidebar();

  return (
    <Link
      to={link.href}
      className={cn(
        'flex items-center gap-3 text-sm text-white/80 hover:text-white transition-colors py-2',
        className,
      )}
      {...props}
    >
      <span className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
        {link.icon}
      </span>
      <motion.span
        animate={{
          width: animate ? (open ? 'auto' : 0) : 'auto',
          opacity: animate ? (open ? 1 : 0) : 1,
          display: animate ? (open ? 'inline-flex' : 'none') : 'inline-flex',
        }}
        className="whitespace-pre"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};
