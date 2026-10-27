import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { Language } from "../../worker/languages";
import type { Folder } from "../../worker/folders";
import type { AnswerWith } from "../../worker/sets";
import { useT, type TKey } from "../i18n";
import { api, fieldErrors } from "../lib/api";
import { answerWithOptions, languageOptions } from "../lib/choices";
import { checkSetForm, saveImageChanges, termsError, useTermRows } from "../lib/setForm";
import { ImportTerms } from "./setForm/ImportTerms";
import {
  Button,
  ButtonLink,
  Card,
  FormError,
  Heading,
  PageTitle,
  Select,
  PageLoadFailed,
  PageLoading,
  SegmentedControl,
  TermEditorRow,
  Text,
  TextField,
  useToast,
} from "../ui";

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
  const [answerWith, setAnswerWith] = useState<AnswerWith>("both");
  const [folders, setFolders] = useState<Folder[]>([]);
  // "" = no folder, "new" = make one called newFolder, else a folder id.
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const { rows, setRows, rowRefs, update, setKind, updateImage, next, remove, add, append } = useTermRows();
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<Record<string, TKey>>({});
  const [formError, setFormError] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);

  const [loadFailed, setLoadFailed] = useState(false);

  // Only a set that is gone leaves; any other failure offers to try again.
  const load = useCallback(
    () =>
      Promise.all([api.sets[":id"].$get({ param: { id } }), api.sets[":id"].images.$get({ param: { id } })]).then(
        async ([setRes, imagesRes]) => {
          if (!setRes.ok) {
            if (setRes.status === 404) navigate("/");
            else setLoadFailed(true);
            return;
          }
          const set = await setRes.json();
          // Pictures that fail to load just leave their rows without one.
          const images = imagesRes.ok ? (await imagesRes.json()).images : {};
          setTitle(set.title);
          setDescription(set.description);
          setTermLang(set.termLang ?? "");
          setDefLang(set.defLang ?? "");
          setAnswerWith(set.answerWith);
          setFolder(set.folderId === null ? "" : String(set.folderId));
          setRows(
            set.terms.map((term) => ({
              id: term.id,
              kind: term.kind,
              term: term.term,
              definition: term.definition,
              image: images[term.id] ?? null,
            })),
          );
          setLoading(false);
        },
      ),
    [id, navigate, setRows],
  );

  useEffect(() => {
    if (editing) void load();
  }, [editing, load]);

  // The folders to pick from; without them the form simply offers a new one.
  useEffect(() => {
    void api.folders.$get().then(async (res) => {
      if (res.ok) setFolders(await res.json());
    });
  }, []);

  /** The folder id to send: a new folder is made first. False when that failed (shown on its field). */
  async function folderId(): Promise<number | null | false> {
    if (folder === "") return null;
    if (folder !== "new") return Number(folder);
    const res = await api.folders.$post({ json: { name: newFolder.trim() } });
    if (res.ok) {
      const made = await res.json();
      setFolders((list) => [...list, made]);
      setFolder(String(made.id));
      return made.id;
    }
    setErrors({ folderName: (await fieldErrors(res)).name ?? "validation.invalid" });
    return false;
  }

  function retry() {
    setLoadFailed(false);
    void load();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { kept, titleError, formError } = checkSetForm(title, rows);
    setErrors(titleError ? { title: titleError } : {});
    setFormError(formError);
    if (titleError || formError) return;
    if (folder === "new" && !newFolder.trim()) {
      setErrors({ folderName: "validation.too_small" });
      return;
    }
    setBusy(true);
    try {
      const pickedFolder = await folderId();
      if (pickedFolder === false) return;
      const json = {
        title: title.trim(),
        description: description.trim(),
        termLang: termLang || null,
        defLang: defLang || null,
        answerWith,
        folderId: pickedFolder,
        terms: kept.map((row) => {
          const term = {
            kind: row.kind ?? ("pair" as const),
            term: row.term.trim(),
            definition: row.definition.trim(),
          };
          return row.id === undefined ? term : { ...term, id: row.id };
        }),
      };
      const res = editing ? await api.sets[":id"].$patch({ param: { id }, json }) : await api.sets.$post({ json });
      if (res.ok) {
        const saved = await res.json();
        // The text is saved; now the rows' pictures follow, one call each.
        const failed = await saveImageChanges(kept, saved.terms);
        toast(t(failed > 0 ? "sets.imagesFailed" : "common.saved"), failed > 0 ? "error" : "success");
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

  if (loadFailed) {
    return <PageLoadFailed title={t("sets.loadFailed")} onRetry={retry} />;
  }
  if (loading) {
    return <PageLoading />;
  }

  const languages = languageOptions(t);

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
          <Select
            label={t("folders.label")}
            value={folder}
            onChange={setFolder}
            error={errors.folderId && t(errors.folderId)}
            options={[
              { value: "", label: t("folders.none") },
              ...folders.map((item) => ({ value: String(item.id), label: item.name })),
              { value: "new", label: t("folders.new") },
            ]}
          />
          {folder === "new" && (
            <TextField
              label={t("folders.newName")}
              value={newFolder}
              onChange={setNewFolder}
              error={errors.folderName && t(errors.folderName)}
              maxLength={60}
              autoFocus
            />
          )}
        </Card>

        <Card>
          <Heading level={3} className="mb-4">
            {t("sets.languages")}
          </Heading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t("sets.langTerms")} value={termLang} onChange={setTermLang} options={languages} />
            <Select label={t("sets.langDefs")} value={defLang} onChange={setDefLang} options={languages} />
          </div>
          <Text variant="small" className="mt-3">
            {t("sets.langHint")}
          </Text>
        </Card>

        <Card>
          <Heading level={3} className="mb-3">
            {t("sets.answerWith")}
          </Heading>
          <SegmentedControl<AnswerWith>
            label={t("sets.answerWith")}
            value={answerWith}
            onChange={setAnswerWith}
            options={answerWithOptions(t)}
          />
          <Text variant="small" className="mt-3">
            {t("sets.answerWithHint")}
          </Text>
        </Card>

        <section>
          <Heading className="mb-3">{t("sets.termsHeading")}</Heading>
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => (
              <TermEditorRow
                key={row.uid}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                index={i}
                kind={row.kind}
                onKind={(kind) => setKind(i, kind)}
                term={row.term}
                definition={row.definition}
                image={row.image}
                onChange={(term, definition) => update(i, term, definition)}
                onNext={() => next(i)}
                onDelete={rows.length > 1 ? () => remove(i) : undefined}
                onImage={(image) => updateImage(row.uid, image)}
              />
            ))}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" icon="plus" onClick={add}>
                {t("study.addTerm")}
              </Button>
              <Button variant="secondary" icon="upload" onClick={() => setImporting(true)}>
                {t("sets.import")}
              </Button>
            </div>
          </div>
          {formError && <FormError className="mt-3">{t(formError)}</FormError>}
          <ImportTerms open={importing} onClose={() => setImporting(false)} onImport={append} />
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
