import { useState } from "react";
import { LOCALES, useT, type Locale } from "../i18n";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, Card, Icon, SegmentedControl, TextField, Wordmark } from "../ui";

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
    try {
      const res = await api.login.$post({ json: { username, password } });
      if (res.ok) {
        signedIn(await res.json());
        return;
      }
      setError(t(res.status === 429 ? "login.rateLimited" : "login.invalid"));
    } catch {
      // network error: the app-wide toast already says so
    }
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
            <h1 className="font-serif text-3xl text-ink">{t("login.title")}</h1>
            <p className="mt-1 mb-6 text-muted">{t("login.subtitle")}</p>
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
              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-2 rounded-ui bg-wrong-wash px-3 py-2.5 text-sm text-wrong-strong"
                >
                  <Icon name="alertCircle" size="1rem" />
                  {error}
                </p>
              )}
              <Button type="submit" loading={busy} fullWidth className="mt-2">
                {t("login.submit")}
              </Button>
            </form>
          </Card>
          <p className="mt-6 text-center font-serif text-muted italic">{t("app.tagline")}</p>
        </div>
      </div>
    </div>
  );
}
