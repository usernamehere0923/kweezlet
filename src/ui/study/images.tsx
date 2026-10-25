import { useRef, useState, type ChangeEvent } from "react";
import { useT } from "../../i18n";
import { fileToDataUrl } from "../../lib/images";
import { Button, IconButton } from "../Button";
import { cx } from "../cx";
import { FormError } from "../fields";
import { Spinner } from "../Spinner";

/**
 * A term's picture. `card` is the one under the word on a flashcard;
 * `thumb` is the small square in a list or a form row.
 * `alt` says what the picture shows; "" when the words on screen already say it.
 */
export function TermImage({ src, alt, variant = "card" }: { src: string; alt: string; variant?: "card" | "thumb" }) {
  return (
    <img
      src={src}
      alt={alt}
      className={cx(
        "shrink-0 border border-line bg-sunken",
        variant === "thumb"
          ? "size-12 rounded-md object-cover"
          : "max-h-56 w-auto max-w-full rounded-ui-lg object-contain",
      )}
    />
  );
}

/**
 * The image slot of a term row in the set form. A picture that is there shows
 * as a thumbnail with Replace and Remove; otherwise one Add button. Picking a
 * file hands `onChange` its data URL (shrunk, see src/lib/images.ts); Remove
 * hands it null.
 */
export function TermImagePicker({
  image,
  onChange,
}: {
  image: string | null;
  onChange: (image: string | null) => void;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!file) return;
    setBusy(true);
    setFailed(false);
    fileToDataUrl(file).then(
      (dataUrl) => {
        setBusy(false);
        onChange(dataUrl);
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {image && <TermImage src={image} alt={t("study.image")} variant="thumb" />}
      {/* The button opens this input; the input itself is not a tab stop. */}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabIndex={-1}
        aria-hidden
        onChange={pick}
        className="sr-only"
      />
      {busy ? (
        <Spinner size={18} label={t("study.pickingImage")} />
      ) : (
        <>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => input.current?.click()}>
            {t(image ? "study.replaceImage" : "study.addImage")}
          </Button>
          {image && <IconButton icon="trash" size="sm" label={t("study.removeImage")} onClick={() => onChange(null)} />}
        </>
      )}
      {failed && <FormError className="w-full">{t("study.imageFailed")}</FormError>}
    </div>
  );
}
