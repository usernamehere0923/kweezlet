import { useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { clientId } from "../lib/live";
import {
  AnswerInput,
  AnswerOption,
  Button,
  Card,
  CardNav,
  Checkbox,
  EmptyState,
  FeedbackBanner,
  FlipCard,
  Heading,
  Icon,
  ICON_NAMES,
  IconButton,
  KnowItButtons,
  MatchTile,
  Modal,
  PageTitle,
  ProgressBar,
  ResultSummary,
  SearchField,
  SegmentedControl,
  Select,
  Spinner,
  StreakBadge,
  StudyModeTile,
  StudySetCard,
  Tag,
  TermEditorRow,
  TermList,
  Text,
  TextField,
  TextLink,
  useToast,
  type AnswerState,
  type MatchState,
  type StudyMode,
  type TermEditorHandle,
} from "../ui";

// Sample data. It only exists on this page.
const ANIMALS = [
  { term: "el gato", definition: "the cat" },
  { term: "el perro", definition: "the dog" },
  { term: "el pájaro", definition: "the bird" },
  { term: "el caballo", definition: "the horse" },
  { term: "la vaca", definition: "the cow" },
  { term: "el pez", definition: "the fish" },
];

/** One block on this page: a title, the live demo, and the code to copy. */
function Section({ title, code, children }: { title: string; code?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <Heading level={3} className="text-muted">
        {title}
      </Heading>
      <div>{children}</div>
      {code && (
        <pre className="overflow-x-auto rounded-ui border border-line-soft bg-sunken/50 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-soft">
          {code.trim()}
        </pre>
      )}
    </section>
  );
}

function Chapter({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 border-t border-line-soft pt-10">
      <div>
        <Heading>{title}</Heading>
        {intro && (
          <Text variant="muted" className="mt-1">
            {intro}
          </Text>
        )}
      </div>
      {children}
    </div>
  );
}

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

export function DesignSystemPage() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-14">
      <PageTitle subtitle={t("design.intro")}>{t("design.title")}</PageTitle>
      <Foundations />
      <Controls />
      <StudyKit />
      <LiveDemo />
    </div>
  );
}

function Foundations() {
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
      </Chapter>
    </>
  );
}

function Controls() {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<"es" | "fr" | "it">("es");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [shuffle, setShuffle] = useState(true);
  const [modal, setModal] = useState(false);

  return (
    <>
      <Chapter title={t("design.buttons")}>
        <Section
          title="Button · ButtonLink · IconButton"
          code={`<Button onClick={save}>Save</Button>                 // the ONE main action
<Button variant="secondary" icon="plus">Add</Button>
<Button variant="ghost">Cancel</Button>
<Button variant="danger" icon="trash">Delete</Button>
<Button loading={busy}>Saving</Button>   <Button size="sm">Small</Button>
<ButtonLink to="/settings">Go somewhere</ButtonLink>
<IconButton icon="edit" label="Edit" />`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary" icon="plus">
              Secondary
            </Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger" icon="trash">
              Danger
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <Button size="lg">Large</Button>
            <IconButton icon="edit" label="Edit" />
            <IconButton icon="star" label="Favourite" variant="secondary" />
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.fields")}>
        <Section
          title="TextField · SearchField"
          code={`<TextField label="Set title" value={title} onChange={setTitle} hint="Shown in your library" />
<TextField label="Description" multiline value={d} onChange={setD} />
<TextField label="Title" value={v} onChange={setV} error="Too short" />
<SearchField label="Search" clearLabel="Clear" value={q} onChange={setQ} />`}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label="Set title"
              value={name}
              onChange={setName}
              placeholder="e.g. Spanish animals"
              hint="Shown in your library"
            />
            <TextField label="With an error" value="ab" onChange={() => {}} error="Too short" />
            <TextField
              label="Description"
              multiline
              value={notes}
              onChange={setNotes}
              placeholder="What is this set about?"
            />
            <div className="flex flex-col gap-5">
              <SearchField
                label={t("search.placeholder")}
                clearLabel={t("common.clear")}
                value={query}
                onChange={setQuery}
              />
              <TextField label="Disabled" value="Can't touch this" onChange={() => {}} disabled />
            </div>
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.choices")}>
        <Section
          title="Select · SegmentedControl · Checkbox"
          code={`<Select label="Language" value={lang} onChange={setLang}
  options={[{ value: "es", label: "Spanish" }, { value: "fr", label: "French" }]} />
<SegmentedControl label="View" value={view} onChange={setView}
  options={[{ value: "cards", label: "Cards" }, { value: "list", label: "List" }]} />
<Checkbox label="Shuffle cards" checked={shuffle} onChange={setShuffle} />`}
        >
          <div className="grid items-start gap-5 md:grid-cols-3">
            <Select
              label="Language"
              value={lang}
              onChange={setLang}
              options={[
                { value: "es", label: "Spanish" },
                { value: "fr", label: "French" },
                { value: "it", label: "Italian" },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-soft">View</span>
              <SegmentedControl
                label="View"
                value={view}
                onChange={setView}
                options={[
                  { value: "cards", label: "Cards" },
                  { value: "list", label: "List" },
                ]}
              />
            </div>
            <div className="pt-7">
              <Checkbox label="Shuffle cards" hint="Random order every round" checked={shuffle} onChange={setShuffle} />
            </div>
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.layout")}>
        <Section
          title="Card · Tag · EmptyState"
          code={`<Card>Anything</Card>   <Card onClick={open}>Clickable</Card>
<Tag>Spanish</Tag>   <Tag tone="accent">New</Tag>   <Tag tone="correct" icon="check">Done</Tag>
<EmptyState icon="folder" title="No sets yet" text="Create your first set." action={<Button>Create</Button>} />`}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <Heading level={3}>A card</Heading>
              <Text variant="muted" className="mt-1">
                The surface everything sits on.
              </Text>
              <div className="mt-4 flex flex-wrap gap-2">
                <Tag>Spanish</Tag>
                <Tag tone="accent">New</Tag>
                <Tag tone="neutral">Draft</Tag>
                <Tag tone="correct" icon="check">
                  Learned
                </Tag>
                <Tag tone="wrong">Hard</Tag>
              </div>
            </Card>
            <EmptyState
              icon="folderPlus"
              title="No sets yet"
              text="Create your first set."
              action={<Button icon="plus">Create</Button>}
            />
          </div>
        </Section>
      </Chapter>

      <Chapter title={t("design.feedback")}>
        <Section
          title="useToast · Modal · Spinner"
          code={`const toast = useToast();
toast(t("common.saved"), "success");        // "info" | "success" | "error"

<Modal open={open} onClose={() => setOpen(false)} title="Delete this set?"
  actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger">Delete</Button></>}>
  This cannot be undone.
</Modal>
<Spinner />`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => toast(t("design.toastText"), "info")}>
              {t("design.showToast")}
            </Button>
            <Button variant="secondary" onClick={() => toast(t("common.saved"), "success")}>
              Success toast
            </Button>
            <Button variant="secondary" onClick={() => toast(t("errors.server"), "error")}>
              Error toast
            </Button>
            <Button variant="ghost" onClick={() => setModal(true)}>
              {t("design.openModal")}
            </Button>
            <Spinner className="text-accent" />
          </div>
          <Modal
            open={modal}
            onClose={() => setModal(false)}
            title={t("design.modalTitle")}
            actions={
              <>
                <Button variant="ghost" onClick={() => setModal(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="trash" onClick={() => setModal(false)}>
                  {t("common.delete")}
                </Button>
              </>
            }
          >
            {t("design.modalText")}
          </Modal>
        </Section>
      </Chapter>
    </>
  );
}

function StudyKit() {
  const { t } = useT();
  const [mode, setMode] = useState<StudyMode>("flashcards");
  const [card, setCard] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(2);
  const [learning, setLearning] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedState, setTypedState] = useState<"idle" | "correct" | "wrong">("idle");
  const [rows, setRows] = useState(ANIMALS.slice(0, 2));
  const rowRefs = useRef<(TermEditorHandle | null)[]>([]);

  const go = (i: number) => {
    setCard(i);
    setFlipped(false);
  };

  // Multiple choice demo: option 2 ("the dog") is right.
  const choices = ["the cat", "the dog", "the horse", "the fish"];
  const choiceState = (i: number): AnswerState =>
    picked === null ? "idle" : i === 1 ? "correct" : i === picked ? "wrong" : "idle";

  return (
    <Chapter title={t("design.study")} intro={t("design.studyIntro")}>
      <Section
        title="StudySetCard · StreakBadge"
        code={`<StudySetCard title="Spanish animals" termCount={6} owner="anna" tag="Spanish" onClick={open} />
<StreakBadge days={5} />`}
      >
        <div className="mb-4">
          <StreakBadge days={5} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StudySetCard title="Spanish animals" termCount={6} owner="anna" tag="Spanish" />
          <StudySetCard title="Capitals of Europe" termCount={1} owner="ben" />
          <StudySetCard title="Photosynthesis" termCount={24} tag="Biology" />
        </div>
      </Section>

      <Section
        title="StudyModeTile"
        code={`<StudyModeTile mode="flashcards" onClick={() => start("flashcards")} />   // flashcards | learn | test | match`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["flashcards", "learn", "test", "match"] as const).map((m) => (
            <StudyModeTile key={m} mode={m} active={mode === m} onClick={() => setMode(m)} />
          ))}
        </div>
      </Section>

      <Section
        title="FlipCard · CardNav · KnowItButtons · ProgressBar"
        code={`<ProgressBar value={known} learning={learning} max={terms.length} />
<FlipCard front={card.term} back={card.definition} flipped={flipped} onFlip={setFlipped} />
<CardNav index={i} total={terms.length} onPrev={prev} onNext={next} onShuffle={shuffle} />
<KnowItButtons onKnowIt={...} onStillLearning={...} />`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <ProgressBar value={known} learning={learning} max={ANIMALS.length} />
          <FlipCard front={ANIMALS[card].term} back={ANIMALS[card].definition} flipped={flipped} onFlip={setFlipped} />
          <CardNav
            index={card}
            total={ANIMALS.length}
            onPrev={() => go(Math.max(0, card - 1))}
            onNext={() => go(Math.min(ANIMALS.length - 1, card + 1))}
            onShuffle={() => go(Math.floor(Math.random() * ANIMALS.length))}
          />
          <KnowItButtons
            onStillLearning={() => setLearning((n) => Math.min(ANIMALS.length - known, n + 1))}
            onKnowIt={() => setKnown((n) => Math.min(ANIMALS.length - learning, n + 1))}
          />
          <ProgressBar value={card + 1} max={ANIMALS.length} />
        </div>
      </Section>

      <Section
        title="AnswerOption · FeedbackBanner"
        code={`<AnswerOption label="the dog" shortcut={2} state={state} onSelect={() => pick(1)} />
// state: "idle" | "selected" | "correct" | "wrong"
<FeedbackBanner state="wrong" correctAnswer="the dog" onContinue={next} />`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <Card padding="sm" className="mb-2 text-center">
            <span className="font-serif text-2xl">el perro</span>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {choices.map((c, i) => (
              <AnswerOption
                key={c}
                label={c}
                shortcut={i + 1}
                state={choiceState(i)}
                disabled={picked !== null}
                onSelect={() => setPicked(i)}
              />
            ))}
          </div>
          {picked !== null && (
            <FeedbackBanner
              state={picked === 1 ? "correct" : "wrong"}
              correctAnswer="the dog"
              onContinue={() => setPicked(null)}
            />
          )}
        </div>
      </Section>

      <Section
        title="AnswerInput"
        code={`<AnswerInput value={answer} onChange={setAnswer} onSubmit={check} state={state} />   // idle | correct | wrong`}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          <Text variant="muted">
            the dog → <span className="text-ink">?</span>
          </Text>
          <AnswerInput
            value={typed}
            onChange={setTyped}
            state={typedState}
            onSubmit={() => setTypedState(typed.trim().toLowerCase() === "el perro" ? "correct" : "wrong")}
          />
          {typedState !== "idle" && (
            <FeedbackBanner
              state={typedState}
              correctAnswer="el perro"
              onContinue={() => {
                setTyped("");
                setTypedState("idle");
              }}
            />
          )}
        </div>
      </Section>

      <Section
        title="MatchTile"
        code={`<MatchTile label="el gato" state={state} onClick={() => pick(tile)} />   // idle | selected | matched | mismatch`}
      >
        <MatchDemo />
      </Section>

      <Section
        title="TermEditorRow · TermList"
        code={`<TermEditorRow ref={(el) => (refs.current[i] = el)} index={i} term={row.term} definition={row.definition}
  onChange={(term, definition) => update(i, term, definition)}
  onNext={() => focusOrAddRow(i + 1)}   // Enter in "definition"
  onDelete={() => remove(i)} />
<TermList terms={terms} />`}
      >
        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <TermEditorRow
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              index={i}
              term={row.term}
              definition={row.definition}
              onChange={(term, definition) => setRows((r) => r.map((x, j) => (j === i ? { term, definition } : x)))}
              onNext={() => {
                if (rows[i + 1]) rowRefs.current[i + 1]?.focus();
                else {
                  setRows((r) => [...r, { term: "", definition: "" }]);
                  setTimeout(() => rowRefs.current[i + 1]?.focus());
                }
              }}
              onDelete={rows.length > 1 ? () => setRows((r) => r.filter((_, j) => j !== i)) : undefined}
            />
          ))}
          <Button variant="secondary" icon="plus" onClick={() => setRows((r) => [...r, { term: "", definition: "" }])}>
            {t("study.addTerm")}
          </Button>
        </div>
        <div className="mt-6">
          <TermList terms={ANIMALS} />
        </div>
      </Section>

      <Section
        title="ResultSummary"
        code={`<ResultSummary correct={5} total={6} onStudyAgain={restart} onDone={() => navigate("/")} />`}
      >
        <div className="mx-auto max-w-md">
          <ResultSummary correct={5} total={6} onStudyAgain={() => {}} onDone={() => {}} />
        </div>
      </Section>
    </Chapter>
  );
}

/** A tiny matching game, only to show the tile states. */
function MatchDemo() {
  const pairs = ANIMALS.slice(0, 3);
  const [tiles] = useState(() =>
    pairs
      .flatMap((p, i) => [
        { id: `t${i}`, pair: i, label: p.term },
        { id: `d${i}`, pair: i, label: p.definition },
      ])
      .sort(() => Math.random() - 0.5),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [mismatch, setMismatch] = useState<string[]>([]);

  const pick = (id: string) => {
    if (!selected) return setSelected(id);
    if (selected === id) return setSelected(null);
    const a = tiles.find((x) => x.id === selected)!;
    const b = tiles.find((x) => x.id === id)!;
    setSelected(null);
    if (a.pair === b.pair) setMatched((m) => [...m, a.pair]);
    else {
      setMismatch([a.id, b.id]);
      setTimeout(() => setMismatch([]), 450);
    }
  };
  const state = (tile: (typeof tiles)[number]): MatchState =>
    matched.includes(tile.pair)
      ? "matched"
      : mismatch.includes(tile.id)
        ? "mismatch"
        : selected === tile.id
          ? "selected"
          : "idle";

  if (matched.length === pairs.length) {
    return (
      <EmptyState
        icon="checkCircle"
        title="All matched!"
        action={
          <Button variant="secondary" icon="retry" onClick={() => setMatched([])}>
            Again
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <MatchTile key={tile.id} label={tile.label} state={state(tile)} onClick={() => pick(tile.id)} />
      ))}
    </div>
  );
}

function LiveDemo() {
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
