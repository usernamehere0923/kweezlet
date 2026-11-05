import { useState } from "react";
import { useT, type TKey } from "../../i18n";
import { api } from "../../lib/api";
import { Button, useToast } from "../../ui";

/** The category folders offered with one tap; hidden once the name is taken. */
const SUGGESTIONS: TKey[] = [
  "folders.suggest.languages",
  "folders.suggest.school",
  "folders.suggest.education",
  "folders.suggest.personal",
];

/** The suggested names the user has no folder for yet (like the API: no case). */
export function folderIdeas(t: (key: TKey) => string, folders: { name: string }[]): string[] {
  const taken = new Set(folders.map((folder) => folder.name.toLowerCase()));
  return SUGGESTIONS.map((key) => t(key)).filter((name) => !taken.has(name.toLowerCase()));
}

/** One-tap creation of the common category folders (worker/folders.ts). */
export function FolderSuggestions({ names, onCreated }: { names: string[]; onCreated: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function create(name: string) {
    setBusy(true);
    try {
      const res = await api.folders.$post({ json: { name } });
      // A name taken on another device just refreshes the list around it.
      if (res.ok) toast(t("folders.created"), "success");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  if (names.length === 0) return null;
  return (
    <div role="group" aria-label={t("folders.suggestions")} className="flex flex-wrap gap-2">
      {names.map((name) => (
        <Button
          key={name}
          variant="secondary"
          size="sm"
          icon="plus"
          aria-label={t("folders.createNamed", { name })}
          disabled={busy}
          onClick={() => void create(name)}
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
