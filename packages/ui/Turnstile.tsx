import { useEffect, useRef, useState } from 'react';

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

export function Turnstile({ siteKey, action }: { siteKey?: string; action?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widget: string | undefined;
    let disposed = false;

    const render = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (disposed || !api || !ref.current || widget) return;
      try {
        widget = api.render(ref.current, {
          sitekey: siteKey,
          theme: 'light',
          action,
          callback: (value: string) => {
            setToken(value);
            setStatus('ready');
          },
          'expired-callback': () => {
            setToken('');
            setStatus('error');
          },
          'error-callback': () => {
            setToken('');
            setStatus('error');
          },
        });
        setStatus('ready');
      } catch {
        setToken('');
        setStatus('error');
      }
    };
    const onError = () => {
      setToken('');
      setStatus('error');
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-proinspect-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.proinspectTurnstile = 'true';
      // Keep dynamically loaded scripts compatible with the Worker's nonce CSP.
      const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
      if (nonce) script.nonce = nonce;
      document.head.appendChild(script);
    }
    script.addEventListener('error', onError);
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) render();
    else script.addEventListener('load', render);
    return () => {
      disposed = true;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', onError);
      if (widget) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(widget);
    };
  }, [siteKey, action]);

  return (
    <>
      <div ref={ref} aria-label="Security verification" />
      {siteKey && status === 'loading' && <p role="status">Loading security check…</p>}
      {siteKey && status === 'error' && (
        <p role="alert">Security check unavailable or expired. Refresh the page to retry.</p>
      )}
      <input type="hidden" name="turnstile" value={token} />
    </>
  );
}
