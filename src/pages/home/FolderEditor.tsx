import { useState, type FormEvent } from "react";
import type { Folder } from "../../../worker/folders";
import { useT, type TKey } from "../../i18n";
import { api, fieldErrors } from "../../lib/api";
import { Button, Modal, Text, TextField, useToast } from "../../ui";

/** Rename or delete a folder. Deleting keeps its sets: they are in no folder afterwards. */
export function FolderEditor({
  folder,
  onClose,
  onDeleted,
}: {
  folder: Folder | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useT();
  return (
    <Modal open={folder !== null} onClose={onClose} title={t("folders.editTitle")}>
      {/* Keyed: each folder opens with its own name and no old error. */}
      {folder && <FolderForm key={folder.id} folder={folder} onClose={onClose} onDeleted={onDeleted} />}
    </Modal>
  );
}

function FolderForm({ folder, onClose, onDeleted }: { folder: Folder; onClose: () => void; onDeleted: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState(folder.name);
  const [error, setError] = useState<TKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function rename(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.folders[":id"].$patch({ param: { id: String(folder.id) }, json: { name: name.trim() } });
      if (res.ok) {
        toast(t("folders.renamed"), "success");
        onClose();
      } else setError((await fieldErrors(res)).name ?? "validation.invalid");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await api.folders[":id"].$delete({ param: { id: String(folder.id) } });
      if (res.ok) {
        toast(t("folders.deleted"), "success");
        onDeleted();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void rename(e)} className="flex flex-col gap-4">
      <TextField
        label={t("folders.name")}
        value={name}
        onChange={setName}
        error={error && t(error)}
        maxLength={60}
        required
      />
      <Button type="submit" loading={busy} disabled={!name.trim()}>
        {t("common.save")}
      </Button>
      <div className="border-t border-line pt-4">
        <Button variant="danger" icon="trash" onClick={() => void remove()} disabled={busy}>
          {t("folders.delete")}
        </Button>
        <Text variant="small" className="mt-2">
          {t("folders.deleteHint")}
        </Text>
      </div>
    </form>
  );
}
