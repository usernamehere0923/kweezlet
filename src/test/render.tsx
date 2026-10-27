import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { App } from "../App";
import { I18nProvider } from "../i18n";
import { ThemeProvider } from "../lib/theme";
import { HotkeyInput, ToastProvider } from "../ui";

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <I18nProvider>
        <ThemeProvider>
          <HotkeyInput>
            <ToastProvider>{children}</ToastProvider>
          </HotkeyInput>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

/** The logged-in user GET /api/me answers with. */
export const ME = { username: "demo", locale: "en", level: "admin", theme: "cardigan" };

/** The whole app at `path`, as the browser would load it. */
export function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/** Renders a component with the providers every screen has. rerender() keeps them. */
export function renderUi(ui: ReactNode) {
  return render(ui, { wrapper: Providers });
}
