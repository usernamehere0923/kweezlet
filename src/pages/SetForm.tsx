import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { LANGUAGES, type Language } from "../../worker/languages";
import { useT, type TKey } from "../i18n";
import { api, fieldErrors } from "../lib/api";
import { checkSetForm, termsError, useTermRows } from "../lib/setForm";
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Heading,
  PageTitle,
  Select,
  PageLoading,
  TermEditorRow,
  Text,
  TextField,
  useToast,
  type Option,
} from "../ui";

const LANG_KEY: Record<Language, TKey> = {
  en: "lang.en",
  de: "lang.de",
  fr: "lang.fr",
  it: "lang.it",
  es: "lang.es",
};

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
  const { rows, setRows, rowRefs, update, next, remove, add } = useTermRows();
  const [errors, setErrors] = useState<Record<string, TKey>>({});
  const [formError, setFormError] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

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
  }, [editing, id, navigate, setRows]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { kept, titleError, formError } = checkSetForm(title, rows);
    setErrors(titleError ? { title: titleError } : {});
    setFormError(formError);
    if (titleError || formError) return;
    setBusy(true);
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
        setFormError(termsError(serverErrors));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageLoading />;
  }

  const languageOptions: Option<Language | "">[] = [
    { value: "", label: t("lang.none") },
    ...LANGUAGES.map((lang) => ({ value: lang, label: t(LANG_KEY[lang]) })),
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
            error={errors.title && t(errors.title)}
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
            <Select label={t("sets.langTerms")} value={termLang} onChange={setTermLang} options={languageOptions} />
            <Select label={t("sets.langDefs")} value={defLang} onChange={setDefLang} options={languageOptions} />
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
                onDelete={rows.length > 1 ? () => remove(i) : undefined}
              />
            ))}
            <Button variant="secondary" icon="plus" onClick={add}>
              {t("study.addTerm")}
            </Button>
          </div>
          {formError && <FormError className="mt-3">{t(formError)}</FormError>}
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
