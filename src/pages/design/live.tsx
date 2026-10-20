import { useState } from "react";
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { clientId } from "../../lib/live";
import { Button, Card, Text, useToast } from "../../ui";
import { Chapter, Section } from "./layout";

export function LiveDemo() {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Chapter title={t("design.live")}>
      <Section
        title="useLive · notify()"
        code={`// worker, after saving:
await notify(c.env, c.get("user").id, "sets");

// page, on every other device of that user:
useLive("sets", () => void loadSets());`}
      >
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Text variant="muted" className="max-w-md">
            {t("design.liveText")}
          </Text>
          <Button
            icon="bell"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await api.live.ping.$post({ json: { from: clientId } }).finally(() => setBusy(false));
              if (res.ok) toast(t("design.pingSent"), "success");
            }}
          >
            {t("design.ping")}
          </Button>
        </Card>
      </Section>
    </Chapter>
  );
}
