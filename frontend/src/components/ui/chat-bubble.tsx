"use client";

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { Button } from './button';
import { MessageLoading } from './message-loading';

interface ChatBubbleProps {
  variant?: 'sent' | 'received';
  layout?: 'default' | 'ai';
  className?: string;
  children: React.ReactNode;
}

export function ChatBubble({ variant = 'received', className, children }: ChatBubbleProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 mb-4',
        variant === 'sent' && 'flex-row-reverse text-right',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface ChatBubbleMessageProps {
  variant?: 'sent' | 'received';
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function ChatBubbleMessage({
  variant = 'received',
  isLoading,
  className,
  children,
}: ChatBubbleMessageProps) {
  return (
    <div
      className={cn(
        'rounded-2xl px-4 py-2 text-sm max-w-sm',
        variant === 'sent'
          ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
          : 'bg-gray-100 text-gray-800',
        className,
      )}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <MessageLoading />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

interface ChatBubbleAvatarProps {
  src?: string;
  fallback?: string;
  className?: string;
}

export function ChatBubbleAvatar({ src, fallback = 'AI', className }: ChatBubbleAvatarProps) {
  return (
    <Avatar className={cn('h-10 w-10', className)}>
      {src && <AvatarImage src={src} />}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}

interface ChatBubbleActionProps {
  icon?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ChatBubbleAction({ icon, onClick, className }: ChatBubbleActionProps) {
  return (
    <Button variant="ghost" size="icon" className={cn('h-7 w-7', className)} onClick={onClick}>
      {icon}
    </Button>
  );
}

export function ChatBubbleActionWrapper({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex items-center gap-2 mt-2', className)}>{children}</div>;
}
