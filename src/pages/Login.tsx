import { useState } from "react";
import { LOCALES, useT, type Locale } from "../i18n";
import { api, offline } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, Card, FormError, PageTitle, SegmentedControl, Text, TextField, Wordmark } from "../ui";

export function LoginPage() {
  const { t, locale, setLocale } = useT();
  const { signedIn } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.login.$post({ json: { username, password } });
    if (res.ok) {
      signedIn(await res.json());
      return;
    }
    // No connection: the app-wide toast already says so.
    if (!offline(res)) setError(t(res.status === 429 ? "login.rateLimited" : "login.invalid"));
    setBusy(false);
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-end py-4">
        <SegmentedControl<Locale>
          size="sm"
          label={t("login.language")}
          value={locale}
          onChange={setLocale}
          options={LOCALES.map((l) => ({ value: l, label: t(`locale.${l}`) }))}
        />
      </div>
      <div className="flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Wordmark />
          </div>
          <Card padding="lg">
            <PageTitle subtitle={t("login.subtitle")}>{t("login.title")}</PageTitle>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <TextField
                label={t("login.username")}
                value={username}
                onChange={setUsername}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <TextField
                label={t("login.password")}
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
              {error && <FormError boxed>{error}</FormError>}
              <Button type="submit" loading={busy} fullWidth className="mt-2">
                {t("login.submit")}
              </Button>
            </form>
          </Card>
          <Text variant="muted" className="mt-6 text-center font-serif italic">
            {t("app.tagline")}
          </Text>
        </div>
      </div>
    </div>
  );
}
