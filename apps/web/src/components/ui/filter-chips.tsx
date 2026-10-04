"use client";

export interface ChipOption {
  value: string;
  label: string;
}

/** Single-select filter chips: a labelled group of aria-pressed toggles. */
export function FilterChips({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`focus-ring h-9 cursor-pointer rounded-pill border px-4 text-xs font-medium transition-colors duration-(--duration-fast) ${
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-strong text-foreground hover:bg-surface-2"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
