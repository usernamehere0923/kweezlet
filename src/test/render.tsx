import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { I18nProvider } from "../i18n";
import { ToastProvider } from "../ui";

function Providers({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

/** Renders a component with the providers every screen has. rerender() keeps them. */
export function renderUi(ui: ReactNode) {
  return render(ui, { wrapper: Providers });
}
