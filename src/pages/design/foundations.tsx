import { useState } from "react";
import { useT } from "../../i18n";
import { Card, Heading, Icon, ICON_NAMES, PageTitle, Text, TextLink, Wordmark } from "../../ui";
import { Chapter, Section } from "./layout";

const COLORS = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["sunken", "bg-sunken"],
  ["line", "bg-line"],
  ["ink", "bg-ink"],
  ["ink-soft", "bg-ink-soft"],
  ["muted", "bg-muted"],
  ["faint", "bg-faint"],
  ["accent", "bg-accent"],
  ["accent-strong", "bg-accent-strong"],
  ["accent-wash", "bg-accent-wash"],
  ["teal", "bg-teal"],
  ["teal-wash", "bg-teal-wash"],
  ["correct", "bg-correct"],
  ["correct-wash", "bg-correct-wash"],
  ["wrong", "bg-wrong"],
  ["wrong-wash", "bg-wrong-wash"],
] as const;

function Swatch({ name, cls }: { name: string; cls: string }) {
  // The value comes straight from the CSS, so this page can never show a stale colour.
  const [hex] = useState(() => getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim());
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`h-14 rounded-ui border border-line-soft ${cls}`} />
      <span className="font-mono text-xs text-ink-soft">{name}</span>
      <span className="font-mono text-[11px] text-faint">{hex}</span>
    </div>
  );
}

export function Foundations() {
  const { t } = useT();
  return (
    <>
      <Chapter title={t("design.colors")}>
        <Section
          title="Tokens (src/index.css @theme)"
          code={`<div className="bg-surface text-ink border border-line">…</div>
<p className="text-muted">…</p>   // never write a #hex in a component`}
        >
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-6">
            {COLORS.map(([name, cls]) => (
              <Swatch key={name} name={name} cls={cls} />
            ))}
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.type")}>
        <Section
          title="PageTitle · Heading · Text · TextLink"
          code={`<PageTitle subtitle="Optional line">Spanish animals</PageTitle>
<Heading>Section</Heading>
<Heading level={3}>Small heading</Heading>
<Text>Body text</Text>   <Text variant="muted">…</Text>   <Text variant="small">…</Text>
<TextLink href="https://…">a link</TextLink>`}
        >
          <Card>
            <PageTitle subtitle="Learn anything, card by card.">Spanish animals</PageTitle>
            <Heading>Section heading (serif)</Heading>
            <Heading level={3} className="mt-4">
              Small heading (sans)
            </Heading>
            <Text className="mt-2">
              Body text in Anthropic Sans. A sentence about cats and dogs, with{" "}
              <TextLink href="#">a teal link</TextLink> in it.
            </Text>
            <Text variant="muted" className="mt-1">
              Muted text for less important things.
            </Text>
            <Text variant="small" className="mt-1">
              Small text for hints and meta info.
            </Text>
            <p className="mt-3 font-mono text-sm text-ink-soft">font-mono: for code</p>
          </Card>
        </Section>
        <Section title="Icon" code={`<Icon name="search" />   <Icon name="star" size="1.5rem" label="Favourite" />`}>
          <div className="flex flex-wrap gap-1">
            {ICON_NAMES.map((name) => (
              <span
                key={name}
                title={name}
                className="flex size-11 items-center justify-center rounded-ui text-ink-soft hover:bg-surface"
              >
                <Icon name={name} />
              </span>
            ))}
          </div>
        </Section>
        <Section title="Wordmark" code={`<Wordmark />   // the K mark + name: top bar and login`}>
          <Wordmark />
        </Section>
      </Chapter>
    </>
  );
}
