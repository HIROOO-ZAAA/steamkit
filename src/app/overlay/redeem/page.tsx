'use client';

import { useEffect, useState } from 'react';

interface RedeemTrigger {
  claim_id: string;
  redeem_id: string;
  title: string;
  type: 'text' | 'voice' | 'jumpscare' | 'custom';
  cost: number;
  config: Record<string, unknown>;
  input_text?: string;
  input_data?: Record<string, unknown>;
  status: string;
  new_balance: number;
  timestamp: number;
}

export default function RedeemOverlay() {
  const [triggers, setTriggers] = useState<RedeemTrigger[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to SSE for real-time redeem triggers
    const eventSource = new EventSource('/api/events?filter=redeem_trigger');

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // Reconnect after 5 seconds
      setTimeout(() => {
        eventSource.close();
        window.location.reload();
      }, 5000);
    };

    eventSource.addEventListener('redeem_trigger', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.claim) {
          const trigger: RedeemTrigger = {
            ...data.claim,
            timestamp: Date.now(),
          };
          setTriggers((prev) => [...prev, trigger]);

          // Auto-remove after display duration (configurable)
          const displayDuration = (data.claim.config?.display_duration as number) ?? 10000;
          setTimeout(() => {
            setTriggers((prev) => prev.filter((t) => t.claim_id !== trigger.claim_id));
          }, displayDuration);
        }
      } catch {
        // Ignore parse errors
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  // Fallback: poll for triggers if SSE not available
  useEffect(() => {
    if (isConnected) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/redeems/pending?limit=10');
        if (res.ok) {
          const data = await res.json();
          if (data.claims?.length) {
            setTriggers((prev) => [...data.claims, ...prev].slice(0, 20));
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {triggers.map((trigger) => (
        <RedeemTriggerWidget key={trigger.claim_id} trigger={trigger} />
      ))}
      <div className="fixed bottom-2 right-2 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded">
        {isConnected ? '🟢 Live' : '🔴 Reconnecting...'}
      </div>
    </div>
  );
}

function RedeemTriggerWidget({ trigger }: { trigger: RedeemTrigger }) {
  const [show, setShow] = useState(true);
  const [animationClass, setAnimationClass] = useState<'animate-in' | 'animate-out'>('animate-in');

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimationClass('animate-out');
      setTimeout(() => setShow(false), 500);
    }, (trigger.config?.display_duration as number) ?? 10000);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!show) return null;

  const baseStyles: React.CSSProperties = {
    position: 'fixed',
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    maxWidth: '90vw',
    pointerEvents: 'auto',
  };

  const typeStyles: Record<string, React.CSSProperties> = {
    text: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '20px 40px',
      borderRadius: '16px',
      fontSize: '24px',
      fontWeight: 600,
      boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4)',
      textAlign: 'center',
    },
    voice: {
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      color: 'white',
      padding: '20px 40px',
      borderRadius: '16px',
      fontSize: '24px',
      fontWeight: 600,
      boxShadow: '0 10px 40px rgba(240, 147, 251, 0.4)',
      textAlign: 'center',
    },
    jumpscare: {
      background: 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)',
      color: 'white',
      padding: '30px 50px',
      borderRadius: '20px',
      fontSize: '32px',
      fontWeight: 700,
      boxShadow: '0 20px 60px rgba(255, 107, 107, 0.6)',
      textAlign: 'center',
      textTransform: 'uppercase',
      letterSpacing: '2px',
    },
    custom: {
      background: 'rgba(0, 0, 0, 0.85)',
      color: 'white',
      padding: '20px 40px',
      borderRadius: '16px',
      fontSize: '20px',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
      border: '2px solid',
      borderColor: (trigger.config?.border_color as string) ?? '#00ff88',
      textAlign: 'center',
    },
  };

  const animationStyles: Record<string, React.CSSProperties> = {
    'animate-in': {
      animation: 'slideUpFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    },
    'animate-out': {
      animation: 'slideDownFadeOut 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    },
  };

  const animationStyle = animationStyles[animationClass] ?? {};

  const style = {
    ...baseStyles,
    ...typeStyles[trigger.type],
    ...animationStyle,
  } as React.CSSProperties;

  const customIcon = String(trigger.config?.icon ?? '✨');

  return (
    <div style={style} className={animationClass}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        {trigger.type === 'jumpscare' && (
          <span style={{ fontSize: '40px', animation: 'shake 0.5s infinite' }}>⚡</span>
        )}
        {trigger.type === 'voice' && <span style={{ fontSize: '28px' }}>🎤</span>}
        {trigger.type === 'text' && <span style={{ fontSize: '28px' }}>💬</span>}
        {trigger.type === 'custom' && (
          <span style={{ fontSize: '28px' }}>
            {customIcon}
          </span>
        )}
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, marginBottom: '4px' }}>
            {trigger.title}
          </div>
          {trigger.input_text && (
            <div style={{ opacity: 0.9, fontSize: '16px', fontWeight: 400 }}>
              &quot;{trigger.input_text}&quot;
            </div>
          )}
          <div style={{ opacity: 0.7, fontSize: '12px', marginTop: '8px' }}>
            {trigger.cost} pts · Balance: {trigger.new_balance}
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes slideUpFadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
        }
        @keyframes slideDownFadeOut {
          from {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(-20px) scale(0.9);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}