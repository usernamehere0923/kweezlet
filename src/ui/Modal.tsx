import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { surface } from "./surfaces";
import { Heading } from "./Text";

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
      className={cx(
        surface,
        "m-auto w-[min(440px,calc(100vw-32px))] p-0 text-ink shadow-overlay backdrop:bg-ink/30 open:animate-slide-up",
      )}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <Heading>{title}</Heading>
          <IconButton icon="close" size="sm" label={t("common.close")} onClick={onClose} className="-mt-1 -mr-2" />
        </div>
        {children && <div className="mt-3 text-[15px] text-ink-soft">{children}</div>}
        {actions && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </dialog>
  );
}
