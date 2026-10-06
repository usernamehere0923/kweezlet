import { useId, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

// iOS Safari zooms into any input below 16px, so every field uses text-base.
const fieldBox =
  "w-full rounded-ui border bg-surface px-3.5 text-base text-ink transition-colors outline-none " +
  "focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-50";

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-soft">
      {children}
    </label>
  );
}

function HelpText({ id, hint, error }: { id: string; hint?: ReactNode; error?: ReactNode }) {
  if (error)
    return (
      <p id={id} className="mt-1.5 flex items-center gap-1.5 text-sm text-wrong">
        <Icon name="alertCircle" size="0.95rem" />
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={id} className="mt-1.5 text-sm text-muted">
        {hint}
      </p>
    );
  return null;
}

type TextFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  /** Shown in red under the field, replaces the hint. */
  error?: ReactNode;
  /** A growing text area instead of one line. */
  multiline?: boolean;
  rows?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

/**
 *   <TextField label="Username" value={name} onChange={setName} />
 *   <TextField label="Notes" multiline value={notes} onChange={setNotes} hint="Optional" />
 */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  multiline,
  rows = 3,
  className,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const aria = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? helpId : undefined,
  };
  const border = error ? "border-wrong" : "border-line";
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          {...aria}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={rest.placeholder}
          disabled={rest.disabled}
          required={rest.required}
          maxLength={rest.maxLength}
          className={cx(fieldBox, border, "field-sizing-content min-h-24 resize-none py-2.5")}
        />
      ) : (
        <input
          {...rest}
          {...aria}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cx(fieldBox, border, "h-11")}
        />
      )}
      <HelpText id={helpId} hint={hint} error={error} />
    </div>
  );
}

/** Search box with an icon and a clear button. `label` is for screen readers only. */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  clearLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  clearLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cx("relative", className)}>
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        className={cx(fieldBox, "h-11 border-line pr-11 pl-11 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-ui text-faint hover:text-ink"
        >
          <Icon name="closeCircle" size="1.1rem" />
        </button>
      )}
    </div>
  );
}

export type Option<T extends string> = { value: T; label: ReactNode };

/** A dropdown. Native on purpose: on the iPhone it opens the system picker. */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  className,
  ...rest
}: {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  hint?: ReactNode;
  error?: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          {...rest}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          className={cx(fieldBox, error ? "border-wrong" : "border-line", "h-11 appearance-none pr-10")}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {typeof o.label === "string" ? o.label : o.value}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size="1rem"
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted"
        />
      </div>
      <HelpText id={`${id}-help`} hint={hint} error={error} />
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-accent-strong"
      />
      <label htmlFor={id} className="text-[15px] text-ink-soft select-none">
        {label}
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
    </div>
  );
}

/** A row of 2-4 options where exactly one is active (e.g. language). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  /** For screen readers. */
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-fit rounded-ui border border-line bg-sunken/60 p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-[7px] font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-sm" : "h-9 px-4 text-[15px]",
              active ? "bg-surface text-ink shadow-raised" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
