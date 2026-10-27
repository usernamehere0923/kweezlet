import { useState } from "react";
import { useT } from "../../i18n";
import { parsePastedTerms, type PasteBetween, type PasteRows, type Row } from "../../lib/setForm";
import { Button, Modal, Select, Text, TextField } from "../../ui";

const BETWEEN: PasteBetween[] = ["auto", "tab", "comma", "dash"];
const ROWS: PasteRows[] = ["newline", "semicolon"];

/** Paste a list (Quizlet, Anki, a spreadsheet) and add its terms to the form. */
export function ImportTerms({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (terms: Row[]) => void;
}) {
  const { t, tn } = useT();
  const [text, setText] = useState("");
  const [between, setBetween] = useState<PasteBetween>("auto");
  const [rows, setRows] = useState<PasteRows>("newline");
  const { terms, skipped } = parsePastedTerms(text, between, rows);

  function add() {
    onImport(terms);
    setText("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("sets.importTitle")}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={add} disabled={terms.length === 0}>
            {tn("sets.importAdd", terms.length)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t("sets.importLabel")}
          value={text}
          onChange={setText}
          hint={t("sets.importHint")}
          multiline
          rows={5}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t("sets.importBetween")}
            value={between}
            onChange={setBetween}
            options={BETWEEN.map((value) => ({ value, label: t(`sets.importBetween.${value}`) }))}
          />
          <Select
            label={t("sets.importRows")}
            value={rows}
            onChange={setRows}
            options={ROWS.map((value) => ({ value, label: t(`sets.importRows.${value}`) }))}
          />
        </div>
        <div aria-live="polite">
          {terms.length === 0 && skipped === 0 ? (
            <Text variant="small">{t("sets.importEmpty")}</Text>
          ) : (
            <>
              <Text variant="small" className="font-medium text-ink">
                {tn("sets.importFound", terms.length)}
              </Text>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-soft">
                {terms.slice(0, 3).map((term, i) => (
                  <li key={i} className="truncate">
                    {term.term} → {term.definition}
                  </li>
                ))}
                {terms.length > 3 && <li aria-hidden>…</li>}
              </ul>
              {skipped > 0 && (
                <Text variant="small" className="mt-1">
                  {tn("sets.importSkipped", skipped)}
                </Text>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
