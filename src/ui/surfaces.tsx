import { Component, createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/** The white-ish box everything sits in. `interactive` adds a hover lift (use with onClick). */
export function Card({
  children,
  padding = "md",
  interactive,
  onClick,
  className,
}: {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const pad = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" }[padding];
  const cls = cx(
    "rounded-ui-xl border border-line-soft bg-surface text-left",
    pad,
    (interactive || onClick) && "transition-shadow hover:shadow-raised hover:border-line",
    className,
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, "block w-full")}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

const tagTones = {
  neutral: "bg-sunken text-ink-soft",
  teal: "bg-teal-wash text-teal-strong",
  accent: "bg-accent-wash text-accent-deep",
  correct: "bg-correct-wash text-correct",
  wrong: "bg-wrong-wash text-wrong-strong",
};

export function Tag({
  children,
  tone = "teal",
  icon,
}: {
  children: ReactNode;
  tone?: keyof typeof tagTones;
  icon?: IconName;
}) {
  return (
    <span
      className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium", tagTones[tone])}
    >
      {icon && <Icon name={icon} size="0.85rem" />}
      {children}
    </span>
  );
}

/** Centered placeholder for "nothing here yet". */
export function EmptyState({
  icon = "folder",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-ui-xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-accent-wash text-accent-strong">
        <Icon name={icon} size="1.6rem" />
      </div>
      <h2 className="font-serif text-2xl text-ink">{title}</h2>
      {text && <p className="mt-2 max-w-sm text-[15px] text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/**
 * A dialog over the page. Uses the native <dialog>, so Esc closes it and focus stays inside.
 *
 *   <Modal open={open} onClose={() => setOpen(false)} title="Delete?" actions={<Button>OK</Button>}>…</Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useT();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-ui-xl border border-line-soft bg-surface p-0 text-ink shadow-overlay backdrop:bg-ink/30 open:animate-slide-up"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl leading-snug">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mt-1 -mr-2 flex size-9 items-center justify-center rounded-ui text-muted hover:bg-sunken hover:text-ink"
          >
            <Icon name="close" size="1.1rem" />
          </button>
        </div>
        {children && <div className="mt-3 text-[15px] text-ink-soft">{children}</div>}
        {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </dialog>
  );
}

// ---- Toasts -------------------------------------------------------------

type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: ReactNode; tone: ToastTone };
type ShowToast = (message: ReactNode, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * Short message at the bottom that disappears by itself.
 *
 *   const toast = useToast();
 *   toast(t("common.saved"), "success");
 */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast() needs <ToastProvider>");
  return show;
}

const toastIcons: Record<ToastTone, IconName> = { info: "bell", success: "checkCircle", error: "alertCircle" };
const toastColors: Record<ToastTone, string> = {
  info: "text-teal",
  success: "text-correct",
  error: "text-wrong",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback<ShowToast>((message, tone = "info") => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Above the phone's bottom tab bar (and its safe area), centred. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex max-w-md animate-slide-up items-center gap-2.5 rounded-ui-lg border border-line-soft bg-surface px-4 py-3 text-[15px] text-ink shadow-overlay"
          >
            <Icon name={toastIcons[item.tone]} className={toastColors[item.tone]} />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- Crash screen -------------------------------------------------------

function CrashScreen() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <EmptyState
        icon="warning"
        title={t("errors.crashTitle")}
        text={t("errors.crashText")}
        action={
          <Button icon="retry" onClick={() => location.reload()}>
            {t("errors.reload")}
          </Button>
        }
      />
    </div>
  );
}

/** Catches a crash in a page and shows a friendly screen instead of a blank one. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    return this.state.crashed ? <CrashScreen /> : this.props.children;
  }
}
