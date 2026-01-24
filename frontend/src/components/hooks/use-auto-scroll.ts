import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ScrollState {
  isAtBottom: boolean;
  autoScrollEnabled: boolean;
}

interface UseAutoScrollOptions {
  offset?: number;
  smooth?: boolean;
  content?: ReactNode;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { offset = 32, smooth = false, content } = options;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastContentHeight = useRef(0);

  const [scrollState, setScrollState] = useState<ScrollState>({
    isAtBottom: true,
    autoScrollEnabled: true,
  });

  const checkIsAtBottom = useCallback(
    (element: HTMLElement) => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const distanceToBottom = Math.abs(scrollHeight - scrollTop - clientHeight);
      return distanceToBottom <= offset;
    },
    [offset],
  );

  const scrollToBottom = useCallback(
    (instant?: boolean) => {
      if (!scrollRef.current) return;

      const targetScrollTop = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;

      if (instant) {
        scrollRef.current.scrollTop = targetScrollTop;
      } else {
        scrollRef.current.scrollTo({
          top: targetScrollTop,
          behavior: smooth ? 'smooth' : 'auto',
        });
      }

      setScrollState({ isAtBottom: true, autoScrollEnabled: true });
    },
    [smooth],
  );

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const atBottom = checkIsAtBottom(scrollRef.current);
    setScrollState((prev) => ({ isAtBottom: atBottom, autoScrollEnabled: atBottom ? true : prev.autoScrollEnabled }));
  }, [checkIsAtBottom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const currentHeight = element.scrollHeight;
    if (currentHeight !== lastContentHeight.current && scrollState.autoScrollEnabled) {
      requestAnimationFrame(() => {
        scrollToBottom(lastContentHeight.current === 0);
      });
      lastContentHeight.current = currentHeight;
    }
  }, [content, scrollState.autoScrollEnabled, scrollToBottom]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(() => {
      if (scrollState.autoScrollEnabled) {
        scrollToBottom(true);
      }
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [scrollState.autoScrollEnabled, scrollToBottom]);

  const disableAutoScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const atBottom = checkIsAtBottom(scrollRef.current);
    if (!atBottom) {
      setScrollState((prev) => ({ ...prev, autoScrollEnabled: false }));
    }
  }, [checkIsAtBottom]);

  return {
    scrollRef,
    isAtBottom: scrollState.isAtBottom,
    autoScrollEnabled: scrollState.autoScrollEnabled,
    scrollToBottom: () => scrollToBottom(false),
    disableAutoScroll,
  };
}
