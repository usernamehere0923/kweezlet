import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { useT, type TKey } from "../i18n";
import { api, offline } from "../lib/api";
import { aiErrorMessage } from "../lib/cost";
import {
  fits,
  MAX_BODY_CHARS,
  MaterialError,
  pagesToSend,
  pickAll,
  readFile,
  readPhotos,
  totals,
  type Material,
  type MaterialErrorCode,
} from "../lib/material";
import {
  Button,
  Card,
  CostLine,
  FormError,
  Heading,
  PageTile,
  PageTitle,
  SegmentedControl,
  Select,
  Spinner,
  Text,
  TextField,
  type Option,
} from "../ui";

type Source = "file" | "text" | "photo";
type Kind = "auto" | "vocabulary" | "questions" | "terms";
type HowMany = "0" | "10" | "25" | "50";

const FILE_ERRORS: Record<MaterialErrorCode, TKey> = {
  old_format: "ai.source.error.oldFormat",
  unsupported: "ai.source.error.unsupported",
  unreadable: "ai.source.error.unreadable",
  photo: "ai.source.error.photo",
};

/** /create/ai: material in, a draft out. Pick the pages, say what to make, go. */
export function AiSourcePage() {
  const { t, tn } = useT();
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>("file");
  const [material, setMaterial] = useState<Material | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pasted, setPasted] = useState("");
  const [kind, setKind] = useState<Kind>("auto");
  const [howMany, setHowMany] = useState<HowMany>("0");
  const [instructions, setInstructions] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  // Pasted text is one page of its own; a file or photos are what was read.
  const pastedMaterial: Material | null = pasted.trim()
    ? { name: "pasted", pages: [{ n: 1, text: pasted.trim(), scan: false }], pickAll: true }
    : null;
  const current = source === "text" ? pastedMaterial : material;
  const chosen = source === "text" ? new Set(pastedMaterial ? [1] : []) : picked;
  const sum = current ? totals(current.pages, chosen) : null;

  // A replaced (or left) PDF frees its document and worker.
  useEffect(() => () => material?.close?.(), [material]);
  // Only the newest read may land: a slow PDF must not show up after the user moved on.
  const readCount = useRef(0);

  function switchSource(next: Source) {
    readCount.current++;
    setSource(next);
    setMaterial(null);
    setPicked(new Set());
    setReading(false);
    setError(null);
  }

  /** Reads material. `keep`: photos added to photos keep the earlier picks; pages after `after` are new. */
  async function read(load: () => Promise<Material>, keep?: { picked: Set<number>; after: number }) {
    const mine = ++readCount.current;
    setReading(true);
    setError(null);
    try {
      const read = await load();
      if (mine !== readCount.current) {
        read.close?.();
        return;
      }
      setMaterial(read);
      // One page, or photos: picked at once. Several pages of a PDF or Office file: unpicked at first.
      const all = read.pickAll ? pickAll(read.pages) : new Set<number>();
      setPicked(keep ? new Set([...keep.picked, ...[...all].filter((n) => n > keep.after)]) : all);
    } catch (err) {
      if (mine !== readCount.current) return;
      setError(t(err instanceof MaterialError ? FILE_ERRORS[err.code] : "ai.source.error.unreadable"));
    } finally {
      if (mine === readCount.current) setReading(false);
    }
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (file) void read(() => readFile(file));
  }

  // The phone's camera gives one shot at a time: each pick adds to the photos there.
  function pickPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const before = material?.pages ?? [];
    const keep = material ? { picked, after: before.length } : undefined;
    if (files.length > 0) void read(() => readPhotos(files, before), keep);
  }

  function toggle(n: number, on: boolean) {
    setPicked((now) => {
      const next = new Set(now);
      if (on) next.add(n);
      else next.delete(n);
      return next;
    });
  }

  async function create() {
    if (!current || !sum || sum.count === 0) {
      setError(t("ai.source.error.nothingPicked"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pages = await pagesToSend(current, chosen);
      const json = {
        sourceName: current.name.slice(0, 200),
        kind,
        maxCards: Number(howMany),
        instructions: instructions.trim(),
        pages,
      };
      if (JSON.stringify(json).length > MAX_BODY_CHARS) {
        setError(t("ai.source.error.tooLarge"));
        return;
      }
      const res = await api.ai.drafts.$post({ json });
      if (res.ok) {
        navigate(`/create/ai/${(await res.json()).id}`);
        return;
      }
      if (offline(res) || res.status >= 500) return; // api.ts already says why
      if ((res.status as number) === 413) {
        setError(t("ai.source.error.tooLarge"));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; capNanos?: number };
      setError(
        body.error === "validation"
          ? t("ai.source.error.invalid")
          : aiErrorMessage(t, body.error ?? null, body.capNanos),
      );
    } catch {
      // Drawing a scanned page failed.
      setError(t("ai.source.error.unreadable"));
    } finally {
      setBusy(false);
    }
  }

  const sources: Option<Source>[] = [
    { value: "file", label: t("ai.source.file") },
    { value: "text", label: t("ai.source.text") },
    { value: "photo", label: t("ai.source.photo") },
  ];
  const kinds: Option<Kind>[] = [
    { value: "auto", label: t("ai.kind.auto") },
    { value: "vocabulary", label: t("ai.kind.vocabulary") },
    { value: "questions", label: t("ai.kind.questions") },
    { value: "terms", label: t("ai.kind.terms") },
  ];
  const amounts: Option<HowMany>[] = [
    { value: "0", label: t("ai.source.howManyAuto") },
    { value: "10", label: "10" },
    { value: "25", label: "25" },
    { value: "50", label: "50" },
  ];
  // Pages to pick: a file with more than one, or photos (to drop a blurry one). One text file: nothing to pick.
  const showPicker = source !== "text" && material !== null && (material.pages.length > 1 || source === "photo");
  const limited =
    showPicker && material.pages.some((page) => !picked.has(page.n) && !fits(material.pages, picked, page));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle subtitle={t("ai.source.subtitle")}>{t("ai.source.title")}</PageTitle>

      <Card className="flex flex-col gap-4">
        <SegmentedControl label={t("ai.source.mode")} value={source} onChange={switchSource} options={sources} />
        {/* The buttons open these inputs; the inputs themselves are not tab stops. */}
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.pptx,.xlsx,.doc,.ppt,.xls,.txt,.md,application/pdf,text/plain"
          tabIndex={-1}
          aria-hidden
          onChange={pickFile}
          className="sr-only"
        />
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden
          onChange={pickPhotos}
          className="sr-only"
        />
        {source === "file" && (
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" icon="upload" onClick={() => fileInput.current?.click()}>
              {t("ai.source.chooseFile")}
            </Button>
            <Text variant="small">{material ? material.name : t("ai.source.fileHint")}</Text>
          </div>
        )}
        {source === "photo" && (
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" icon="plus" onClick={() => photoInput.current?.click()}>
              {t("ai.source.takePhoto")}
            </Button>
            <Text variant="small">{t("ai.source.photoHint")}</Text>
          </div>
        )}
        {source === "text" && (
          <TextField
            label={t("ai.source.paste")}
            hint={t("ai.source.pasteHint")}
            value={pasted}
            onChange={setPasted}
            multiline
            rows={8}
            maxLength={400_000}
          />
        )}
        {reading && <Spinner label={t("ai.source.reading")} />}
      </Card>

      {showPicker && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={3} className="mr-auto">
              {t("ai.source.pages")}
            </Heading>
            <Button variant="ghost" size="sm" onClick={() => setPicked(pickAll(material.pages))}>
              {t("ai.source.selectAll")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
              {t("common.clear")}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {material.pages.map((page) => (
              <PageTile
                key={page.n}
                n={page.n}
                label={page.label ?? page.text.slice(0, 160)}
                thumbnail={page.thumbnail}
                scan={page.scan}
                selected={picked.has(page.n)}
                disabled={!fits(material.pages, picked, page)}
                onToggle={(on) => toggle(page.n, on)}
              />
            ))}
          </div>
          {limited && <Text variant="small">{t("ai.source.limits")}</Text>}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <Select label={t("ai.source.kind")} value={kind} onChange={setKind} options={kinds} />
        <div className="flex flex-col gap-2">
          <Text variant="small" className="font-semibold text-ink-soft">
            {t("ai.source.howMany")}
          </Text>
          <SegmentedControl label={t("ai.source.howMany")} value={howMany} onChange={setHowMany} options={amounts} />
        </div>
        <TextField
          label={t("ai.source.instructions")}
          hint={t("ai.source.instructionsHint")}
          value={instructions}
          onChange={setInstructions}
          multiline
          maxLength={500}
        />
      </Card>

      <div className="flex flex-col items-start gap-2">
        {error && <FormError>{error}</FormError>}
        <Button onClick={() => void create()} loading={busy} disabled={busy || reading} icon="bulb">
          {t("ai.source.create")}
        </Button>
        {sum && sum.count > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-1 text-sm text-muted">
            <span>{tn("ai.source.picked", sum.count)} ·</span>
            <CostLine estimate nanos={sum.nanos} tokens={sum.tokens} />
          </div>
        )}
      </div>
    </div>
  );
}
