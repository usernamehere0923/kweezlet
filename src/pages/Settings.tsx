import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useT, type Locale, type TKey } from "../i18n";
import { api, fieldErrors } from "../lib/api";
import { formatCost } from "../lib/cost";
import { useLive } from "../lib/live";
import { useSession, useUser } from "../lib/session";
import {
  Button,
  ButtonLink,
  Card,
  Heading,
  PageTitle,
  LocalePicker,
  ProgressBar,
  Text,
  TextField,
  useToast,
} from "../ui";

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
          <LocalePicker label={t("settings.language")} value={locale} onChange={(l) => void changeLocale(l)} />
          <Text variant="small" className="mt-3">
            {t("settings.languageHint")}
          </Text>
        </Section>

        <Section title={t("settings.password")}>
          <PasswordForm />
        </Section>

        <Section title={t("settings.ai")}>
          <AiUsage />
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
  const [errors, setErrors] = useState<Record<string, TKey>>({});
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

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <TextField
        label={t("settings.passwordCurrent")}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
        error={errors.current && t(errors.current)}
        required
      />
      <TextField
        label={t("settings.passwordNew")}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        hint={t("settings.passwordNewHint")}
        error={errors.next && t(errors.next)}
        minLength={8}
        required
      />
      <TextField
        label={t("settings.passwordRepeat")}
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={setRepeat}
        error={errors.repeat && t(errors.repeat)}
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

type Usage = {
  monthNanos: number;
  totalNanos: number;
  capNanos: number | null;
  recent: {
    createdAt: number;
    action: "create" | "regenerate" | "more";
    inputTokens: number;
    outputTokens: number;
    costNanos: number;
  }[];
};

const ACTION_KEYS: Record<Usage["recent"][number]["action"], TKey> = {
  create: "settings.aiAction.create",
  regenerate: "settings.aiAction.regenerate",
  more: "settings.aiAction.more",
};

/** What the AI cost: this month against the budget, all time, the last runs. */
function AiUsage() {
  const { t, tn, locale, formatNumber } = useT();
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(
    () =>
      api.ai.usage.$get().then(async (res) => {
        if (res.ok) setUsage(await res.json());
      }),
    [],
  );
  useEffect(() => void load(), [load]);
  // A run on another device (or in another tab) adds a row.
  useLive("ai", () => void load());

  if (!usage) return <Text variant="muted">{t("common.loading")}</Text>;
  const when = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const month = formatCost(usage.monthNanos);
  return (
    <div className="flex flex-col gap-4">
      {usage.capNanos === null ? (
        <Text>{t("settings.aiMonthNoCap", { cost: month })}</Text>
      ) : (
        <div className="flex flex-col gap-2">
          <Text>{t("settings.aiMonth", { cost: month, cap: formatCost(usage.capNanos) })}</Text>
          <ProgressBar value={usage.monthNanos} max={usage.capNanos} label={t("settings.aiBudget")} />
          <Text variant="small">{t("settings.aiCapHint")}</Text>
        </div>
      )}
      <Text variant="muted">{t("settings.aiTotal", { cost: formatCost(usage.totalNanos) })}</Text>
      {usage.recent.length === 0 ? (
        <Text variant="small">{t("settings.aiNone")}</Text>
      ) : (
        <div>
          <Heading level={3} className="mb-2">
            {t("settings.aiRecent")}
          </Heading>
          <ul className="divide-y divide-line-soft text-sm">
            {usage.recent.map((run, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-ink">{t(ACTION_KEYS[run.action])}</p>
                  <p className="text-muted">{when.format(run.createdAt * 1000)}</p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-ink">{formatCost(run.costNanos)}</p>
                  <p className="text-muted">
                    {tn("ai.tokens", run.inputTokens + run.outputTokens, {
                      tokens: formatNumber(run.inputTokens + run.outputTokens),
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
