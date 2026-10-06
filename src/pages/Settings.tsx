import { useState, type ReactNode } from "react";
import { isTKey, LOCALES, useT, type Locale } from "../i18n";
import { api, fieldErrors } from "../lib/api";
import { useSession, useUser } from "../lib/session";
import { Button, ButtonLink, Card, Heading, PageTitle, SegmentedControl, Text, TextField, useToast } from "../ui";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <Heading className="mb-4">{title}</Heading>
      {children}
    </Card>
  );
}

export function SettingsPage() {
  const { t, locale, setLocale } = useT();
  const user = useUser();
  const { logout } = useSession();
  const toast = useToast();

  async function changeLocale(next: Locale) {
    setLocale(next);
    const res = await api.me.settings.$patch({ json: { locale: next } });
    if (res.ok) toast(t("common.saved"), "success");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>{t("settings.title")}</PageTitle>
      <div className="flex flex-col gap-5">
        <Section title={t("settings.language")}>
          <SegmentedControl<Locale>
            label={t("settings.language")}
            value={locale}
            onChange={(l) => void changeLocale(l)}
            options={LOCALES.map((l) => ({ value: l, label: t(`locale.${l}`) }))}
          />
          <Text variant="small" className="mt-3">
            {t("settings.languageHint")}
          </Text>
        </Section>

        <Section title={t("settings.password")}>
          <PasswordForm />
        </Section>

        <Section title={t("settings.data")}>
          <Text variant="muted" className="mb-4">
            {t("settings.dataText")}
          </Text>
          <ButtonLink href="/api/me/export" download variant="secondary" icon="archive">
            {t("settings.dataDownload")}
          </ButtonLink>
        </Section>

        <Section title={t("settings.account")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Text variant="muted">{t("settings.loggedInAs", { name: user.username })}</Text>
            <Button variant="ghost" icon="lock" onClick={() => void logout()}>
              {t("settings.logout")}
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function PasswordForm() {
  const { t } = useT();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== repeat) {
      setErrors({ repeat: "validation.mismatch" });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await api.me.password.$post({ json: { current, next } });
      if (res.ok) {
        toast(t("settings.passwordChanged"), "success");
        setCurrent("");
        setNext("");
        setRepeat("");
      } else {
        setErrors(await fieldErrors(res));
      }
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => {
    const key = errors[field];
    if (!key) return undefined;
    return t(isTKey(key) ? key : "validation.invalid");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label={t("settings.passwordCurrent")}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
        error={err("current")}
        required
      />
      <TextField
        label={t("settings.passwordNew")}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        hint={t("settings.passwordNewHint")}
        error={err("next")}
        minLength={8}
        required
      />
      <TextField
        label={t("settings.passwordRepeat")}
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={setRepeat}
        error={err("repeat")}
        required
      />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          {t("settings.passwordSubmit")}
        </Button>
      </div>
    </form>
  );
}
