import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

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
