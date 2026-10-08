"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, X } from "lucide-react";

const NotificationContext = createContext<((message: string) => void) | null>(
  null,
);

export function useSuccessNotification() {
  const notify = useContext(NotificationContext);
  if (!notify)
    throw new Error("Success notifications require NotificationProvider.");
  return notify;
}

function SuccessToast({
  message,
  dismiss,
}: {
  message: string;
  dismiss: () => void;
}) {
  const remaining = useRef(6000);
  const hovered = useRef(false);
  const focused = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timeout = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(timeout);
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - started),
      );
    };
  }, [paused, dismiss]);

  return (
    <div
      className="success-toast"
      data-testid="success-toast"
      onMouseEnter={() => {
        hovered.current = true;
        setPaused(true);
      }}
      onMouseLeave={() => {
        hovered.current = false;
        setPaused(focused.current);
      }}
      onFocus={() => {
        focused.current = true;
        setPaused(true);
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focused.current = false;
        setPaused(hovered.current);
      }}
    >
      <CheckCircle2 className="success-check" size={22} aria-hidden="true" />
      <p>{message}</p>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        onClick={dismiss}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const sequence = useRef(0);
  const [notification, setNotification] = useState<{
    id: number;
    message: string;
  }>();
  const notify = useCallback((message: string) => {
    setNotification({ id: ++sequence.current, message });
  }, []);
  const dismiss = useCallback(() => setNotification(undefined), []);

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div className="sr-only" role="status" aria-atomic="true">
        {notification && (
          <span key={notification.id}>{notification.message}</span>
        )}
      </div>
      {notification && (
        <SuccessToast
          key={notification.id}
          message={notification.message}
          dismiss={dismiss}
        />
      )}
    </NotificationContext.Provider>
  );
}

// The shared live region announces success; this confirmation stays readable afterward.
export function SuccessConfirmation({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="success-confirmation" data-testid="success-confirmation">
      <CheckCircle2 className="success-check" size={22} aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
