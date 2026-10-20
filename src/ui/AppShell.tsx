import type { ReactNode } from "react";
import { NavLink as RouterNavLink } from "react-router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Wordmark } from "./Logo";

export type NavItem = { to: string; label: string; icon: IconName };

const navStyles = {
  top: {
    link: "inline-flex h-9 items-center gap-2 rounded-ui px-3 text-[15px] font-medium transition-colors",
    active: "bg-sunken text-ink",
    idle: "text-muted hover:text-ink",
    iconSize: "1.05rem",
  },
  tab: {
    link: "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
    active: "text-accent-strong",
    idle: "text-muted",
    iconSize: "1.4rem",
  },
};

/** A nav entry that styles itself as active when its page is open. */
export function NavLink({ to, label, icon, variant = "top" }: NavItem & { variant?: keyof typeof navStyles }) {
  const style = navStyles[variant];
  return (
    <RouterNavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) => cx(style.link, isActive ? style.active : style.idle)}
    >
      <Icon name={icon} size={style.iconSize} />
      {label}
    </RouterNavLink>
  );
}

/**
 * The frame around every logged-in page.
 * Desktop: top bar with links. Phone: slim top bar + tab bar at the bottom
 * (clear of the iPhone home indicator).
 */
export function AppShell({ nav, navLabel, children }: { nav: NavItem[]; navLabel: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-8">
          <RouterNavLink to="/" className="rounded-ui">
            <Wordmark />
          </RouterNavLink>
          <nav aria-label={navLabel} className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-8 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-8 md:pt-12 md:pb-20">
        {children}
      </main>

      <nav
        aria-label={navLabel}
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {nav.map((item) => (
          <NavLink key={item.to} {...item} variant="tab" />
        ))}
      </nav>
    </div>
  );
}
