import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Heading } from "./Text";

/** The look of a Card, for pieces that are a card but render their own element. */
export const surface = "rounded-ui-xl border border-line-soft bg-surface";

/** A study card's face (flashcard, question): a surface with the theme's card pattern. */
export const studySurface = "rounded-ui-xl border border-line-soft bg-card";

/**
 * The white-ish box everything sits in. With onClick it is a button that lifts on hover.
 * `study`: a study card (question, flashcard), with the theme's card pattern.
 */
export function Card({
  children,
  padding = "md",
  onClick,
  study,
  className,
}: {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
  study?: boolean;
  className?: string;
}) {
  const pad = { none: "", sm: "p-4", md: "p-5 md:p-6", lg: "p-6 md:p-8" }[padding];
  const cls = cx(
    study ? studySurface : surface,
    "text-left",
    pad,
    onClick && "transition-shadow hover:shadow-raised hover:border-line",
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
      <Heading>{title}</Heading>
      {text && <p className="mt-2 max-w-sm text-[15px] text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
