"use client";

import React, { useRef, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export type ChatPosition = 'bottom-right' | 'bottom-left';
export type ChatSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const chatConfig = {
  dimensions: {
    sm: 'sm:max-w-sm sm:max-h-[500px]',
    md: 'sm:max-w-md sm:max-h-[600px]',
    lg: 'sm:max-w-lg sm:max-h-[700px]',
    xl: 'sm:max-w-xl sm:max-h-[800px]',
    full: 'sm:w-full sm:h-full',
  },
  positions: {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
  },
  chatPositions: {
    'bottom-right': 'sm:bottom-[calc(100%+10px)] sm:right-0',
    'bottom-left': 'sm:bottom-[calc(100%+10px)] sm:left-0',
  },
  states: {
    open: 'pointer-events-auto opacity-100 visible scale-100 translate-y-0',
    closed: 'pointer-events-none opacity-0 invisible scale-100 sm:translate-y-5',
  },
};

interface ExpandableChatProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: ChatPosition;
  size?: ChatSize;
  icon?: React.ReactNode;
}

const ExpandableChat: React.FC<ExpandableChatProps> = ({
  className,
  position = 'bottom-right',
  size = 'md',
  icon,
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen((prev) => !prev);

  return (
    <div className={cn(`fixed ${chatConfig.positions[position]} z-50`, className)} {...props}>
      <div
        ref={chatRef}
        className={cn(
          'flex flex-col bg-neutral-950/90 border border-white/10 sm:rounded-3xl shadow-2xl shadow-black/50 overflow-hidden transition-all duration-300 ease-out sm:absolute sm:w-[90vw] sm:h-[80vh] fixed inset-0 w-full h-full sm:inset-auto',
          chatConfig.chatPositions[position],
          chatConfig.dimensions[size],
          isOpen ? chatConfig.states.open : chatConfig.states.closed,
          className,
        )}
      >
        {children}
        <Button variant="ghost" size="icon" className="absolute top-3 right-3 sm:hidden" onClick={toggleChat}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ExpandableChatToggle icon={icon} isOpen={isOpen} toggleChat={toggleChat} />
    </div>
  );
};

ExpandableChat.displayName = 'ExpandableChat';

const ExpandableChatHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-between p-4 border-b border-white/5 bg-white/5', className)} {...props} />
);
ExpandableChatHeader.displayName = 'ExpandableChatHeader';

const ExpandableChatBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('flex-grow overflow-y-auto bg-gradient-to-b from-transparent to-white/5', className)} {...props} />
);
ExpandableChatBody.displayName = 'ExpandableChatBody';

const ExpandableChatFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('border-t border-white/10 p-4 bg-black/40', className)} {...props} />
);
ExpandableChatFooter.displayName = 'ExpandableChatFooter';

interface ExpandableChatToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  isOpen: boolean;
  toggleChat: () => void;
}

const ExpandableChatToggle: React.FC<ExpandableChatToggleProps> = ({ className, icon, isOpen, toggleChat, ...props }) => (
  <Button
    variant="secondary"
    onClick={toggleChat}
    className={cn(
      'w-16 h-16 rounded-full shadow-glow bg-brand-500 text-white hover:bg-brand-600 flex items-center justify-center',
      className,
    )}
    {...props}
  >
    {isOpen ? <X className="h-6 w-6" /> : icon || <MessageCircle className="h-6 w-6" />}
  </Button>
);

ExpandableChatToggle.displayName = 'ExpandableChatToggle';

export { ExpandableChat, ExpandableChatHeader, ExpandableChatBody, ExpandableChatFooter };
