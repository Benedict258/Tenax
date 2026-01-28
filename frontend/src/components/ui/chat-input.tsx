import * as React from 'react';
import { Textarea } from './textarea';
import { cn } from '../../lib/utils';

interface ChatInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(({ className, ...props }, ref) => (
  <Textarea
    autoComplete="off"
    ref={ref}
    name="message"
    className={cn(
      'max-h-14 px-4 py-3 bg-transparent text-sm placeholder:text-gray-400 focus-visible:ring-0 border-0 shadow-none h-16 resize-none',
      className,
    )}
    {...props}
  />
));
ChatInput.displayName = 'ChatInput';

export { ChatInput };
