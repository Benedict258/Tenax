import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics } from '../../context/AnalyticsContext';
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage } from '../../components/ui/chat-bubble';
import { ChatMessageList } from '../../components/ui/chat-message-list';
import { ChatInput } from '../../components/ui/chat-input';
import { Button } from '../../components/ui/button';
import { Bot, CornerDownLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api';

interface StoredMessage {
  id: string;
  text: string;
  role: 'user' | 'assistant' | 'system';
  created_at: string;
}

const WebChatPage = () => {
  const { summary } = useAnalytics();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const syncConversation = useCallback(async () => {
    if (!user || !token) {
      setMessages([]);
      return;
    }
    try {
      const response = await apiClient.get('/agent/conversations/active');
      setMessages(response.data?.messages || []);
      setChatError(null);
    } catch (error) {
      console.error('Chat sync failed', error);
      setChatError('Unable to sync conversation.');
    }
  }, [token, user]);

  useEffect(() => {
    syncConversation();
  }, [syncConversation]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(syncConversation, 10000);
    return () => clearInterval(interval);
  }, [syncConversation, user]);

  const handleChatSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim() || !user) return;

    const optimisticId = `local-${Date.now()}`;
    const outbound: StoredMessage = {
      id: optimisticId,
      text: chatInput,
      role: 'user',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, outbound]);
    setChatInput('');
    setChatBusy(true);

    try {
      await apiClient.post('/agent/message', {
        channel: 'web',
        text: outbound.text,
        timestamp: outbound.created_at,
      });
      await syncConversation();
    } catch (error) {
      console.error('Send message failed', error);
      setChatError('Unable to send message.');
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
    } finally {
      setChatBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-lg font-semibold">Sign in to use the unified agent</p>
        <p className="text-white/60 text-sm mt-2">Create an account from the hero screen to unlock shared WhatsApp + web memory.</p>
        <Button className="mt-4" onClick={() => navigate('/signup')}>
          Start Day 1 setup
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur flex flex-col">
        <header className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">Web Chat</p>
            <h2 className="text-2xl font-semibold">WhatsApp agent, now on web</h2>
          </div>
          <Bot className="h-6 w-6 text-white/70" />
        </header>
        <div className="flex-1 overflow-y-auto py-6">
          <ChatMessageList>
            {messages.map((message) => (
              <ChatBubble key={message.id} variant={message.role === 'user' ? 'sent' : 'received'}>
                <ChatBubbleAvatar
                  className="h-10 w-10"
                  src={
                    message.role === 'user'
                      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&q=80&crop=faces&fit=crop'
                      : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop'
                  }
                  fallback={message.role === 'user' ? 'US' : 'AI'}
                />
                <ChatBubbleMessage variant={message.role === 'user' ? 'sent' : 'received'}>
                  {message.text}
                </ChatBubbleMessage>
              </ChatBubble>
            ))}
            {chatBusy && (
              <ChatBubble variant="received">
                <ChatBubbleAvatar
                  className="h-10 w-10"
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&q=80&crop=faces&fit=crop"
                  fallback="AI"
                />
                <ChatBubbleMessage variant="received">Tenax is typing…</ChatBubbleMessage>
              </ChatBubble>
            )}
          </ChatMessageList>
        </div>
        {chatError && <p className="text-red-400 text-sm">{chatError}</p>}
        <form onSubmit={handleChatSubmit} className="pt-4 border-t border-white/10">
          <ChatInput
            placeholder="Type an execution request, same as WhatsApp."
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
          />
          <Button type="submit" className="mt-3 w-full">
            Send <CornerDownLeft className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/50">Playbook</p>
          <h3 className="mt-1 text-xl font-semibold">How the web agent responds</h3>
          <p className="text-white/60 text-sm">
            Identical routing, tone, and evaluator hooks as WhatsApp. Every prompt here is treated as a signed command.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Active operator</p>
          <p className="text-lg font-semibold">{summary?.user?.name || 'Demo Learner'}</p>
          <p className="text-white/60 text-sm">Goal: {summary?.user?.goal || 'Stay consistent'}</p>
        </div>
        <div className="space-y-3 text-sm text-white/80">
          <p>• Ask for adaptive reminders, pinned P1s, or schedule edits.</p>
          <p>• Use natural language or the WhatsApp quick phrases.</p>
          <p>• Agent loops into evaluator scoring automatically.</p>
        </div>
      </section>
    </div>
  );
};

export default WebChatPage;
