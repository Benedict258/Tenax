"use client";

import React, { createContext, useContext, useState } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { AnimatePresence, motion, type AnimatePresenceProps } from 'framer-motion';
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

const Presence = AnimatePresence as React.ComponentType<React.PropsWithChildren<AnimatePresenceProps>>;

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
        'hidden md:flex md:flex-col h-full px-4 py-4 bg-white border-r border-gray-200 w-[280px] shrink-0',
        className,
      )}
      animate={{ width: animate ? (open ? 280 : 60) : 280 }}
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
    <div
      className={cn(
        'flex md:hidden items-center justify-between h-12 px-4 bg-white border-b border-gray-200 w-full',
        className,
      )}
      {...props}
    >
      <div className="flex justify-end w-full">
        <Menu className="h-5 w-5 text-gray-800 cursor-pointer" onClick={() => setOpen(!open)} />
      </div>
      <Presence>
        {open && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'fixed inset-0 z-50 bg-white p-10 flex flex-col justify-between',
              className,
            )}
          >
            <button
              aria-label="Close menu"
              className="absolute right-8 top-8 text-gray-700"
              onClick={() => setOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
            {children}
          </motion.div>
        )}
      </Presence>
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
        'flex items-center justify-start gap-2 py-2 text-sm text-gray-700 hover:text-brand transition-colors',
        className,
      )}
      {...props}
    >
      {link.icon}
      <motion.span
        animate={{
          display: animate ? (open ? 'inline-block' : 'none') : 'inline-block',
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="whitespace-pre inline-block"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};
