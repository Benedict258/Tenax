import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { Button } from './button';
import { useAutoScroll } from '../hooks/use-auto-scroll';

interface ChatMessageListProps extends React.HTMLAttributes<HTMLDivElement> {
  smooth?: boolean;
}

const ChatMessageList = React.forwardRef<HTMLDivElement, ChatMessageListProps>(
  ({ className, children, smooth = false, ...props }, _ref) => {
    const { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll } = useAutoScroll({ smooth, content: children });

    return (
      <div className="relative w-full h-full">
        <div
          className={`flex flex-col w-full h-full p-4 overflow-y-auto space-y-4 ${className ?? ''}`}
          ref={scrollRef}
          onWheel={disableAutoScroll}
          onTouchMove={disableAutoScroll}
          {...props}
        >
          {children}
        </div>
        {!isAtBottom && (
          <Button
            onClick={() => scrollToBottom()}
            size="icon"
            variant="secondary"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  },
);

ChatMessageList.displayName = 'ChatMessageList';

export { ChatMessageList };
