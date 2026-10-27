import { useState } from "react";
import { useT } from "../../i18n";
import { aiErrorMessage, type AiErrorCode } from "../../lib/cost";
import { AiUsage, CostLine, DraftCard, FormError, PageTile, UnfinishedDrafts } from "../../ui";
import { Chapter, Section } from "./layout";

const PAGES = [
  { n: 1, thumbnail: "icon-192.png" },
  { n: 2, label: "Kapitel 2 · Die Kantone der Schweiz und ihre Hauptorte" },
  { n: 3, thumbnail: "icon-192.png", scan: true },
  { n: 4, label: "Vokabeln: el perro — the dog, el gato — the cat", used: true },
  { n: 5, label: "Anhang", disabled: true },
];

const CARDS = [
  { term: "el perro", definition: "the dog", source: "el perro — the dog", page: 2, verified: true },
  { term: "el gato", definition: "the cat", source: "el gato, la gata", page: 2, verified: false },
  { term: "el caballo", definition: "the horse", source: "", page: null, verified: false },
];

const DRAFTS = [
  { to: "/design", title: "Kantone der Schweiz", status: "running" as const, cardCount: 0 },
  { to: "/design#ai", title: "Spanisch Tiere", status: "ready" as const, cardCount: 24 },
  { to: "/design#kit", title: "kurs.pdf", status: "failed" as const, cardCount: 0 },
];

const RUNS = [
  { at: new Date(2026, 9, 27, 7, 46), action: "more" as const, tokens: 4_120, nanos: 2_410_000 },
  { at: new Date(2026, 9, 26, 18, 2), action: "create" as const, tokens: 14_210, nanos: 14_310_000 },
];

const ERRORS: AiErrorCode[] = [
  "ai_busy",
  "ai_quota",
  "ai_key",
  "ai_input",
  "ai_cut_off",
  "ai_server",
  "ai_cap",
  "ai_running",
];

export function AiKit() {
  const { t } = useT();
  const [picked, setPicked] = useState<number[]>([1]);
  const [cards, setCards] = useState(CARDS.map((card, id) => ({ ...card, id, checked: card.verified })));
  const update = (i: number, change: Partial<(typeof cards)[number]>) =>
    setCards((list) => list.map((card, j) => (j === i ? { ...card, ...change } : card)));

  return (
    <Chapter title={t("design.ai")} intro={t("design.aiIntro")}>
      <Section
        title="CostLine"
        code={`<CostLine nanos={draft.cost.nanos} tokens={draft.cost.tokens} durationMs={draft.cost.durationMs} />   // after a run
<CostLine estimate nanos={estimate.nanos} tokens={estimate.tokens} />   // before: "about …"; cost always rounded UP to the cent (formatCost)`}
      >
        <div className="flex flex-col gap-1">
          <CostLine nanos={14_310_000} tokens={14_210} durationMs={38_400} />
          <CostLine estimate nanos={3_100_000} tokens={6000} />
        </div>
      </Section>

      <Section
        title="PageTile"
        code={`<PageTile n={5} thumbnail={dataUrl} selected={picked.has(5)} onToggle={(on) => toggle(5, on)} />
<PageTile n={2} label="Kapitel 2" ... />   // no thumbnail: Word sections, slides, sheets show their text
// scan: image page (its cards stay unverified) · used: an earlier run had it · disabled: the run's limit is reached`}
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {PAGES.map((page) => (
            <PageTile
              key={page.n}
              {...page}
              selected={picked.includes(page.n)}
              onToggle={(on) => setPicked((list) => (on ? [...list, page.n] : list.filter((n) => n !== page.n)))}
            />
          ))}
        </div>
      </Section>

      <Section
        title="DraftCard"
        code={`<DraftCard index={i} term={card.term} definition={card.definition} onChange={(term, definition) => edit(i, { term, definition })}
  checked={card.checked} onCheck={(checked) => edit(i, { checked })}
  source={card.source} page={card.page} verified={card.verified} onDelete={() => drop(i)} />
// unverified cards start unchecked (the page does that) and say why`}
      >
        <div className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <DraftCard
              key={card.id}
              index={i}
              {...card}
              onChange={(term, definition) => update(i, { term, definition })}
              onCheck={(checked) => update(i, { checked })}
              onDelete={() => setCards((list) => list.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      </Section>

      <Section
        title="UnfinishedDrafts"
        code={`<UnfinishedDrafts drafts={drafts.map((d) => ({ to: \`/create/ai/\${d.id}\`, title: d.title || sourceLabel(t, d.sourceName), status: d.status, cardCount: d.cardCount }))} />
// Home, above the sets: every unfinished draft, newest first (Home is the only way back to one)`}
      >
        <UnfinishedDrafts drafts={DRAFTS} />
      </Section>

      <Section
        title="AiUsage"
        code={`<AiUsage monthNanos={u.monthNanos} totalNanos={u.totalNanos} capNanos={u.capNanos} runs={runs} />
// Settings → "AI usage"; capNanos null (admins): "no limit", no bar; past the budget: says it is used up`}
      >
        <div className="flex flex-col gap-6">
          <AiUsage monthNanos={16_720_000} totalNanos={52_000_000} capNanos={2_000_000_000} runs={RUNS} />
          <AiUsage monthNanos={2_030_000_000} totalNanos={2_030_000_000} capNanos={2_000_000_000} runs={RUNS} />
          <AiUsage monthNanos={0} totalNanos={0} capNanos={null} runs={[]} />
        </div>
      </Section>

      <Section
        title="aiErrorMessage · FormError"
        code={`<FormError>{aiErrorMessage(t, draft.error)}</FormError>   // a failed draft
<FormError>{aiErrorMessage(t, body.error, body.capNanos)}</FormError>   // an API answer: the 402 names the budget`}
      >
        <div className="flex flex-col gap-2">
          {ERRORS.map((code) => (
            <FormError key={code}>{aiErrorMessage(t, code, 2_000_000_000)}</FormError>
          ))}
        </div>
      </Section>
    </Chapter>
  );
}
