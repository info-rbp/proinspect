import { useEffect, useRef, useState } from 'react';
type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
export function Turnstile({ siteKey }: { siteKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widget: string | undefined;
    let disposed = false;
    const render = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!disposed && api && ref.current)
        widget = api.render(ref.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: (value: string) => setToken(value),
          'expired-callback': () => setToken(''),
        });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-proinspect-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.proinspectTurnstile = 'true';
      document.head.appendChild(script);
    }
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) render();
    else script.addEventListener('load', render);
    return () => {
      disposed = true;
      script?.removeEventListener('load', render);
      if (widget) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(widget);
    };
  }, [siteKey]);
  return (
    <>
      <div ref={ref} />
      <input type="hidden" name="turnstile" value={token} />
    </>
  );
}
