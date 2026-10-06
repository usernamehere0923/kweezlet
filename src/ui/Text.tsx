import type { ReactNode } from "react";
import { cx } from "./cx";

/** The big serif title at the top of a page. One per page. */
export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="font-serif text-[32px] leading-tight font-normal tracking-tight text-ink md:text-[40px]">
        {children}
      </h1>
      {subtitle && <p className="mt-2 text-[17px] text-muted">{subtitle}</p>}
    </header>
  );
}

/** Section headings. level 2 = serif section title, level 3 = small sans label. */
export function Heading({
  level = 2,
  children,
  className,
}: {
  level?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  return level === 2 ? (
    <h2 className={cx("font-serif text-2xl leading-snug font-normal text-ink", className)}>{children}</h2>
  ) : (
    <h3 className={cx("text-[15px] font-semibold text-ink", className)}>{children}</h3>
  );
}

const textVariants = {
  body: "text-base text-ink-soft",
  muted: "text-[15px] text-muted",
  small: "text-sm text-muted",
};

export function Text({
  variant = "body",
  children,
  className,
}: {
  variant?: keyof typeof textVariants;
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx(textVariants[variant], className)}>{children}</p>;
}

/** A link in running text (teal). For navigation buttons use ButtonLink. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal">
      {children}
    </a>
  );
}
