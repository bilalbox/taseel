import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useCallback,
} from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          size?: 'invisible' | 'normal' | 'compact';
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'error-callback'?: (errorCode: string | number) => void;
          'expired-callback'?: () => void;
          'timeout-callback'?: (errorCode?: string | number) => void;
        }
      ) => string;
      execute: (container?: HTMLElement | string | null, params?: any) => void;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

// Cloudflare dummy test sitekey that always succeeds
const DEFAULT_TEST_SITE_KEY = '1x00000000000000000000AA';

export interface TurnstileWidgetHandle {
  execute: () => Promise<string>;
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onVerify?: (token: string) => void;
  onError?: (err: any) => void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  ({ siteKey, onVerify, onError }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tokenRef = useRef<string | null>(null);
    const pendingResolveRef = useRef<((token: string) => void) | null>(null);
    const [isReady, setIsReady] = useState(false);

    const activeSiteKey =
      siteKey ||
      ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
      DEFAULT_TEST_SITE_KEY;

    const handleSuccess = useCallback(
      (token: string) => {
        tokenRef.current = token;
        onVerify?.(token);
        if (pendingResolveRef.current) {
          pendingResolveRef.current(token);
          pendingResolveRef.current = null;
        }
      },
      [onVerify]
    );

    const handleError = useCallback(
      (err: any) => {
        console.warn('Turnstile challenge error:', err);
        onError?.(err);
        // Fallback for offline or blocked environments
        if (pendingResolveRef.current) {
          pendingResolveRef.current('fallback-offline-token');
          pendingResolveRef.current = null;
        }
      },
      [onError]
    );

    const handleExpired = useCallback(() => {
      tokenRef.current = null;
    }, []);

    // Load Turnstile script & render widget
    useEffect(() => {
      let isMounted = true;

      const initWidget = () => {
        if (!containerRef.current || !window.turnstile || widgetIdRef.current) return;
        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: activeSiteKey,
            size: 'invisible',
            callback: handleSuccess,
            'error-callback': handleError,
            'expired-callback': handleExpired,
            'timeout-callback': handleError,
          });
          widgetIdRef.current = id;
          if (isMounted) setIsReady(true);
        } catch (e) {
          console.warn('Turnstile render exception:', e);
          if (isMounted) setIsReady(true);
        }
      };

      if (window.turnstile) {
        initWidget();
      } else {
        const existingScript = document.querySelector(
          'script[src*="challenges.cloudflare.com/turnstile"]'
        );
        if (!existingScript) {
          const script = document.createElement('script');
          script.src =
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          script.onload = () => {
            if (isMounted) initWidget();
          };
          script.onerror = () => {
            console.warn('Failed to load Cloudflare Turnstile script (offline or blocked).');
            if (isMounted) setIsReady(true);
          };
          document.head.appendChild(script);
        } else {
          existingScript.addEventListener('load', () => {
            if (isMounted) initWidget();
          });
        }
      }

      return () => {
        isMounted = false;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore cleanup errors
          }
          widgetIdRef.current = null;
        }
      };
    }, [activeSiteKey, handleSuccess, handleError, handleExpired]);

    useImperativeHandle(
      ref,
      () => ({
        execute: () => {
          return new Promise<string>((resolve) => {
            if (tokenRef.current) {
              resolve(tokenRef.current);
              return;
            }

            // Fallback if Turnstile was blocked or failed to load
            if (!window.turnstile || !widgetIdRef.current) {
              resolve('fallback-local-token');
              return;
            }

            pendingResolveRef.current = resolve;

            // Timeout safety (5s)
            const timer = setTimeout(() => {
              if (pendingResolveRef.current) {
                console.warn('Turnstile execution timed out; falling back.');
                pendingResolveRef.current('fallback-timeout-token');
                pendingResolveRef.current = null;
              }
            }, 5000);

            try {
              window.turnstile.execute(widgetIdRef.current);
            } catch (e) {
              clearTimeout(timer);
              resolve('fallback-error-token');
            }
          });
        },
        reset: () => {
          tokenRef.current = null;
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.reset(widgetIdRef.current);
            } catch {
              // ignore
            }
          }
        },
      }),
      [isReady]
    );

    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className="hidden"
        data-testid="turnstile-invisible-container"
      />
    );
  }
);
