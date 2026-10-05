"use client";

import { motion, useReducedMotion } from "motion/react";
import { CheckIcon } from "@/components/ui/icons";

export const STEPS = [
  { id: "address", label: "Address" },
  { id: "delivery", label: "Delivery" },
  { id: "payment", label: "Payment" },
  { id: "review", label: "Review" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

/**
 * Progress indicator. Completed steps are buttons (jump back to edit); the
 * current one is marked aria-current="step"; later ones are inert text. The
 * connecting line fills with a transform, not a width change.
 */
export function CheckoutSteps({
  current,
  reached,
  onGo,
}: {
  current: StepId;
  /** Furthest step the shopper has unlocked. */
  reached: number;
  onGo: (id: StepId) => void;
}) {
  const reduce = useReducedMotion();
  const index = STEPS.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      <p className="mb-3 text-sm text-muted sm:hidden">
        Step {index + 1} of {STEPS.length}: <span className="font-medium text-foreground">{STEPS[index].label}</span>
      </p>
      <div className="relative">
        <div aria-hidden className="absolute inset-x-[12.5%] top-4 h-0.5 rounded-pill bg-border">
          <motion.div
            className="h-full origin-left rounded-pill bg-accent"
            initial={false}
            animate={{ scaleX: index / (STEPS.length - 1) }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <ol className="relative grid grid-cols-4">
          {STEPS.map((s, i) => {
            const done = i < index;
            const active = i === index;
            const reachable = i <= reached && !active;
            const dot = (
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-pill border-2 text-xs font-semibold transition-colors duration-(--duration-base) ${
                  done
                    ? "border-accent bg-accent text-accent-foreground"
                    : active
                      ? "border-accent bg-background text-accent"
                      : "border-border bg-background text-muted"
                }`}
              >
                {done ? <CheckIcon width={14} height={14} /> : i + 1}
              </span>
            );
            const text = (
              <span aria-hidden className={`hidden text-xs sm:block ${active ? "font-semibold" : done ? "" : "text-muted"}`}>
                {s.label}
              </span>
            );
            return (
              <li key={s.id} className="flex justify-center">
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onGo(s.id)}
                    className="focus-ring flex cursor-pointer flex-col items-center gap-1.5 rounded-card px-2 py-1"
                    aria-label={`${s.label}${done ? ", completed" : ""}. Go back to this step`}
                  >
                    {dot}
                    {text}
                  </button>
                ) : (
                  <span
                    className="flex flex-col items-center gap-1.5 px-2 py-1"
                    aria-current={active ? "step" : undefined}
                  >
                    {dot}
                    {text}
                    <span className="sr-only">
                      {s.label}
                      {active ? ", current step" : ", not yet available"}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
