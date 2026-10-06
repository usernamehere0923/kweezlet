import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type Common = {
  /** primary = the ONE main action on a screen (orange). secondary = teal outline. */
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-ui font-medium whitespace-nowrap select-none " +
  "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50";

const sizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-13 px-7 text-base",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-on-accent hover:bg-accent-deep active:bg-accent-deep",
  secondary: "border border-teal text-teal hover:bg-teal-wash active:bg-teal-wash",
  ghost: "text-ink-soft hover:bg-sunken active:bg-sunken",
  danger: "bg-wrong text-on-accent hover:bg-wrong-strong active:bg-wrong-strong",
};

function classes({ variant = "primary", size = "md", fullWidth }: Common) {
  return cx(base, sizes[size], variants[variant], fullWidth && "w-full");
}

function Content({ icon, loading, children, size }: Common) {
  const iconSize = size === "sm" ? "1rem" : "1.125rem";
  return (
    <>
      {loading ? <Spinner size={16} /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
    </>
  );
}

/**
 *   <Button onClick={save}>Save</Button>
 *   <Button variant="secondary" icon="plus">Add</Button>
 *   <Button loading={busy} type="submit" fullWidth>Log in</Button>
 */
export function Button({
  variant,
  size,
  icon,
  loading,
  fullWidth,
  children,
  disabled,
  type = "button",
  className,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  const props = { variant, size, icon, loading, fullWidth };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(classes(props), className)}
      {...rest}
    >
      <Content {...props}>{children}</Content>
    </button>
  );
}

/** Looks like a Button, navigates like a link. `to` = page in the app, `href` = file/external. */
export function ButtonLink({
  variant,
  size,
  icon,
  fullWidth,
  children,
  to,
  href,
  className,
  ...rest
}: Common &
  ({ to: string; href?: never } | { href: string; to?: never }) &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const props = { variant, size, icon, fullWidth };
  const cls = cx(classes(props), className);
  return to !== undefined ? (
    <Link to={to} className={cls} {...rest}>
      <Content {...props}>{children}</Content>
    </Link>
  ) : (
    <a href={href} className={cls} {...rest}>
      <Content {...props}>{children}</Content>
    </a>
  );
}

/** A square icon-only button. `label` is required: it is what screen readers say. */
export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className,
  type = "button",
  ...rest
}: {
  icon: IconName;
  label: string;
  size?: "sm" | "md";
  variant?: "ghost" | "secondary";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-ui transition-colors disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-9" : "size-11",
        variant === "ghost"
          ? "text-muted hover:bg-sunken hover:text-ink"
          : "border border-line bg-surface text-ink-soft hover:border-teal hover:text-teal",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? "1.05rem" : "1.25rem"} />
    </button>
  );
}
