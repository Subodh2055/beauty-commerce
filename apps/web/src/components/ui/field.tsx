/**
 * Form controls. Every control gets a real <label for>, and hint/error text is
 * wired up with aria-describedby (+ aria-invalid on error), so screen readers
 * announce it with the field. Borders use `border-strong` (3:1 against the
 * surface) — hairline `border` is reserved for decoration.
 */

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDownIcon } from "@/components/ui/icons";

export const controlClass =
  "focus-ring w-full rounded-control border border-border-strong bg-surface text-sm text-foreground " +
  "placeholder:text-muted transition-colors duration-(--duration-fast) " +
  "hover:border-foreground/60 disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger";

interface ShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  required?: boolean;
  className?: string;
}

interface Ids {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

function useFieldIds(id: string | undefined, name: string | undefined, p: ShellProps): Ids {
  const auto = useId();
  const base = id ?? (name ? `${name}-${auto}` : auto);
  const describedBy =
    [p.hint ? `${base}-hint` : null, p.error ? `${base}-error` : null].filter(Boolean).join(" ") ||
    undefined;
  return { id: base, describedBy, invalid: Boolean(p.error) };
}

function Shell({
  ids,
  label,
  hint,
  error,
  hideLabel,
  required,
  className = "",
  children,
}: ShellProps & { ids: Ids; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={ids.id}
          className={hideLabel ? "sr-only" : "block text-sm font-medium text-foreground"}
        >
          {label}
          {required && (
            <span className="text-danger" aria-hidden>
              {" "}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && !error && (
        <p id={`${ids.id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${ids.id}-error`} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// `ref` is a plain prop in React 19; spreading it reaches the control (react-hook-form's register).
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> &
  ShellProps & { inputClassName?: string; ref?: Ref<HTMLInputElement> };

export function Input({
  label,
  hint,
  error,
  hideLabel,
  className,
  inputClassName = "",
  id,
  ...props
}: InputProps) {
  const ids = useFieldIds(id, props.name, { hint, error });
  return (
    <Shell {...{ ids, label, hint, error, hideLabel, className }} required={props.required}>
      <input
        id={ids.id}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.invalid || undefined}
        className={`${controlClass} h-11 px-3.5 ${inputClassName}`}
        {...props}
      />
    </Shell>
  );
}

/** Original name, kept so existing forms don't change. */
export function Field(props: InputProps & { label: string }) {
  return <Input {...props} />;
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> &
  ShellProps & { inputClassName?: string; ref?: Ref<HTMLTextAreaElement> };

export function Textarea({
  label,
  hint,
  error,
  hideLabel,
  className,
  inputClassName = "",
  id,
  rows = 4,
  ...props
}: TextareaProps) {
  const ids = useFieldIds(id, props.name, { hint, error });
  return (
    <Shell {...{ ids, label, hint, error, hideLabel, className }} required={props.required}>
      <textarea
        id={ids.id}
        rows={rows}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.invalid || undefined}
        className={`${controlClass} px-3.5 py-2.5 leading-relaxed ${inputClassName}`}
        {...props}
      />
    </Shell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> &
  ShellProps & {
    options: SelectOption[];
    /** First, empty-valued option ("Any brand", "Select…"). */
    placeholder?: string;
    controlSize?: "sm" | "md";
    selectClassName?: string;
    ref?: Ref<HTMLSelectElement>;
  };

/** Native <select> (keyboard + mobile pickers for free), styled to match. */
export function Select({
  label,
  hint,
  error,
  hideLabel,
  className,
  selectClassName = "",
  id,
  options,
  placeholder,
  controlSize = "md",
  ...props
}: SelectProps) {
  const ids = useFieldIds(id, props.name, { hint, error });
  const height = controlSize === "sm" ? "h-9 text-sm" : "h-11";
  return (
    <Shell {...{ ids, label, hint, error, hideLabel, className }} required={props.required}>
      <div className="relative">
        <select
          id={ids.id}
          aria-describedby={ids.describedBy}
          aria-invalid={ids.invalid || undefined}
          className={`${controlClass} ${height} cursor-pointer appearance-none pl-3.5 pr-10 ${selectClassName}`}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          width={16}
          height={16}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </Shell>
  );
}
