import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { Language } from "../../worker/sets";
import { isTKey, useT, type TKey } from "../i18n";
import { api, fieldErrors } from "../lib/api";
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Heading,
  PageTitle,
  Select,
  Spinner,
  TermEditorRow,
  Text,
  TextField,
  useToast,
  type Option,
  type TermEditorHandle,
} from "../ui";

type Row = { id?: number; term: string; definition: string };

const LANG_KEY: Record<Language, TKey> = {
  en: "lang.en",
  de: "lang.de",
  fr: "lang.fr",
  it: "lang.it",
  es: "lang.es",
};
const LANG_OPTIONS: Language[] = ["en", "de", "fr", "it", "es"];

/** Create (no id) or edit (id in the URL) a study set. */
export function SetFormPage() {
  const { t } = useT();
  const { id = "" } = useParams();
  const editing = id !== "";
  const navigate = useNavigate();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [termLang, setTermLang] = useState<Language | "">("");
  const [defLang, setDefLang] = useState<Language | "">("");
  const [rows, setRows] = useState<Row[]>([{ term: "", definition: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const rowRefs = useRef<(TermEditorHandle | null)[]>([]);

  useEffect(() => {
    if (!editing) return;
    void api.sets[":id"].$get({ param: { id } }).then(async (res) => {
      if (!res.ok) {
        navigate("/");
        return;
      }
      const set = await res.json();
      setTitle(set.title);
      setDescription(set.description);
      setTermLang(set.termLang ?? "");
      setDefLang(set.defLang ?? "");
      setRows(set.terms.map((term) => ({ id: term.id, term: term.term, definition: term.definition })));
      setLoading(false);
    });
  }, [editing, id, navigate]);

  function update(i: number, term: string, definition: string) {
    setRows((list) => list.map((row, j) => (j === i ? { ...row, term, definition } : row)));
  }

  function next(i: number) {
    if (rows[i + 1]) rowRefs.current[i + 1]?.focus();
    else {
      setRows((list) => [...list, { term: "", definition: "" }]);
      setTimeout(() => rowRefs.current[i + 1]?.focus());
    }
  }

  function removeRow(i: number) {
    setRows((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Rows still completely empty simply disappear; half-filled ones are errors.
    const kept = rows.filter((row) => row.term.trim() || row.definition.trim());
    if (!title.trim()) {
      setErrors({ title: "validation.too_small" });
      return;
    }
    if (kept.length === 0) {
      setFormError(t("sets.termsNeeded"));
      return;
    }
    if (kept.some((row) => !row.term.trim() || !row.definition.trim())) {
      setFormError(t("sets.termsIncomplete"));
      return;
    }
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const json = {
        title: title.trim(),
        description: description.trim(),
        termLang: termLang || null,
        defLang: defLang || null,
        terms: kept.map((row) => {
          const term = { term: row.term.trim(), definition: row.definition.trim() };
          return row.id === undefined ? term : { ...term, id: row.id };
        }),
      };
      const res = editing ? await api.sets[":id"].$patch({ param: { id }, json }) : await api.sets.$post({ json });
      if (res.ok) {
        const saved = await res.json();
        toast(t("common.saved"), "success");
        navigate(`/sets/${saved.id}`);
      } else {
        const serverErrors = await fieldErrors(res);
        setErrors(serverErrors);
        if (Object.keys(serverErrors).some((field) => field.startsWith("terms"))) {
          // "invalid_value" means a term id went stale (changed on another
          // device); the other codes mean the row itself is not filled in.
          setFormError(
            t(serverErrors.terms === "validation.invalid_value" ? "sets.termsChanged" : "sets.termsIncomplete"),
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const err = (field: string) => {
    const key = errors[field];
    return key ? t(isTKey(key) ? key : "validation.invalid") : undefined;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-muted">
        <Spinner size={28} label={t("common.loading")} />
      </div>
    );
  }

  const languageOptions = (placeholder: string): Option<Language | "">[] => [
    { value: "", label: placeholder },
    ...LANG_OPTIONS.map((lang) => ({ value: lang, label: t(LANG_KEY[lang]) })),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>{editing ? t("sets.edit") : t("sets.new")}</PageTitle>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <TextField
            label={t("sets.fieldTitle")}
            value={title}
            onChange={setTitle}
            error={err("title")}
            maxLength={200}
            required
          />
          <TextField
            label={t("sets.fieldDescription")}
            value={description}
            onChange={setDescription}
            hint={t("sets.fieldDescriptionHint")}
            multiline
            maxLength={2000}
          />
        </Card>

        <Card>
          <Heading level={3} className="mb-4">
            {t("sets.languages")}
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("sets.langTerms")}
              value={termLang}
              onChange={setTermLang}
              options={languageOptions(t("lang.none"))}
            />
            <Select
              label={t("sets.langDefs")}
              value={defLang}
              onChange={setDefLang}
              options={languageOptions(t("lang.none"))}
            />
          </div>
          <Text variant="small" className="mt-3">
            {t("sets.langHint")}
          </Text>
        </Card>

        <section>
          <Heading className="mb-3">{t("sets.termsHeading")}</Heading>
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <TermEditorRow
                key={row.id ?? `new-${i}`}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                index={i}
                term={row.term}
                definition={row.definition}
                onChange={(term, definition) => update(i, term, definition)}
                onNext={() => next(i)}
                onDelete={rows.length > 1 ? () => removeRow(i) : undefined}
              />
            ))}
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => setRows((list) => [...list, { term: "", definition: "" }])}
            >
              {t("study.addTerm")}
            </Button>
          </div>
          {formError && <FormError className="mt-3">{formError}</FormError>}
        </section>

        <div className="flex items-center gap-2">
          <Button type="submit" loading={busy}>
            {t("common.save")}
          </Button>
          <ButtonLink to={editing ? `/sets/${id}` : "/"} variant="ghost">
            {t("common.cancel")}
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
