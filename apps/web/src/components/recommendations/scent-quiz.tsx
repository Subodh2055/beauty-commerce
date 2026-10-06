"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  submitQuiz,
  type FragranceNote,
  type QuizAnswers,
  type QuizMood,
  type QuizOccasion,
  type QuizResults,
  type QuizSeason,
} from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { BanIcon, CheckIcon, HeartIcon, SparkleIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { MatchBadge } from "./match-badge";

type Option<T extends string> = { value: T; label: string; text: string; swatch: string };

// Swatches are decorative tints from the palette tokens; every option has words.
const MOODS: Option<QuizMood>[] = [
  { value: "fresh", label: "Fresh & energising", text: "Zesty citrus, sea air, green leaves", swatch: "bg-chart-3/25" },
  { value: "romantic", label: "Romantic & soft", text: "Petals, powder, tender florals", swatch: "bg-blush" },
  { value: "cozy", label: "Warm & cosy", text: "Vanilla, tonka, soft woods", swatch: "bg-gold-soft" },
  { value: "bold", label: "Bold & confident", text: "Oud, leather, a statement trail", swatch: "bg-accent-soft" },
  { value: "clean", label: "Clean & minimal", text: "Lavender, sage, fresh linen", swatch: "bg-surface-2" },
  { value: "mysterious", label: "Dark & mysterious", text: "Resins, moss, smoky depths", swatch: "bg-nude" },
];
const OCCASIONS: Option<QuizOccasion>[] = [
  { value: "everyday", label: "Everyday", text: "Easy to wear, morning to night", swatch: "bg-surface-2" },
  { value: "office", label: "Work", text: "Polished and close to the skin", swatch: "bg-surface-2" },
  { value: "date", label: "Date night", text: "Sensual, made to be noticed up close", swatch: "bg-blush" },
  { value: "evening", label: "Evening out", text: "Rich, long-lasting, a little louder", swatch: "bg-accent-soft" },
  { value: "special", label: "Special occasion", text: "Weddings, celebrations, memories", swatch: "bg-gold-soft" },
];
const SEASONS: Option<QuizSeason>[] = [
  { value: "spring", label: "Spring", text: "Blossoms and green buds", swatch: "bg-chart-3/20" },
  { value: "summer", label: "Summer", text: "Heat, light, bright air", swatch: "bg-gold-soft" },
  { value: "autumn", label: "Autumn", text: "Woods, spice, falling leaves", swatch: "bg-nude" },
  { value: "winter", label: "Winter", text: "Cold nights, warm layers", swatch: "bg-surface-2" },
  { value: "all", label: "All year", text: "One signature for every season", swatch: "bg-accent-soft" },
];
const STEPS = ["mood", "occasion", "season", "notes"] as const;
const TITLES = ["How do you want to feel?", "Where will you wear it?", "Which season?", "Any notes you love — or avoid?"];

type Pref = "like" | "avoid";

export function ScentQuiz({ notes }: { notes: FragranceNote[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const reduce = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);

  // Answers come from the URL, so results are shareable and Back works.
  const fromUrl = useMemo(() => readAnswers(sp), [sp]);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [mood, setMood] = useState<QuizMood | undefined>(fromUrl.mood);
  const [occasion, setOccasion] = useState<QuizOccasion | undefined>(fromUrl.occasion);
  const [season, setSeason] = useState<QuizSeason | undefined>(fromUrl.season);
  const [prefs, setPrefs] = useState<Record<string, Pref>>(fromUrl.prefs);
  const [result, setResult] = useState<{ key: string; data: QuizResults | null; error?: string } | null>(null);
  const complete = fromUrl.complete;
  const resultKey = sp.toString();

  useEffect(() => {
    if (!complete) return;
    let active = true;
    submitQuiz(fromUrl.answers!)
      .then((data) => active && setResult({ key: resultKey, data }))
      .catch(() => active && setResult({ key: resultKey, data: null, error: "We couldn't load your matches." }));
    return () => {
      active = false;
    };
  }, [complete, fromUrl, resultKey]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step, complete]);

  const canNext = [mood, occasion, season, true][step];

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  function finish() {
    const like = Object.keys(prefs).filter((k) => prefs[k] === "like");
    const avoid = Object.keys(prefs).filter((k) => prefs[k] === "avoid");
    const params = new URLSearchParams({ mood: mood!, occasion: occasion!, season: season! });
    if (like.length) params.set("like", like.join(","));
    if (avoid.length) params.set("avoid", avoid.join(","));
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  function cycle(slug: string) {
    setPrefs((p) => {
      const next = { ...p };
      if (!p[slug]) next[slug] = "like";
      else if (p[slug] === "like") next[slug] = "avoid";
      else delete next[slug];
      return next;
    });
  }

  if (complete) {
    const current = result?.key === resultKey ? result : null;
    return (
      <Results
        headingRef={heading}
        result={current?.data ?? null}
        error={current?.error}
        onRefine={() => {
          setStep(3);
          router.push(pathname, { scroll: false });
        }}
        onRestart={() => {
          setMood(undefined);
          setOccasion(undefined);
          setSeason(undefined);
          setPrefs({});
          setStep(0);
          router.push(pathname, { scroll: false });
        }}
      />
    );
  }

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * 48 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { opacity: 0, x: d * -48 }),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-muted">{["Mood", "Occasion", "Season", "Notes"][step]}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="h-1.5 overflow-hidden rounded-pill bg-surface-2"
        >
          <div
            className="h-full rounded-pill bg-accent transition-[width] duration-(--duration-slow) ease-luxe"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.section
          key={step}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          aria-labelledby="quiz-step-h"
        >
          <h2 id="quiz-step-h" ref={heading} tabIndex={-1} className="mb-6 font-display text-3xl font-semibold tracking-display outline-none sm:text-4xl">
            {TITLES[step]}
          </h2>
          {step === 0 && <Choices name="mood" options={MOODS} value={mood} onChange={setMood} />}
          {step === 1 && <Choices name="occasion" options={OCCASIONS} value={occasion} onChange={setOccasion} />}
          {step === 2 && <Choices name="season" options={SEASONS} value={season} onChange={setSeason} />}
          {step === 3 && <NotePicker notes={notes} prefs={prefs} onCycle={cycle} />}
        </motion.section>
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => go(step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)} disabled={!canNext}>
            Continue
          </Button>
        ) : (
          <Button onClick={finish} disabled={!mood || !occasion || !season}>
            <SparkleIcon width={16} height={16} aria-hidden /> Show my matches
          </Button>
        )}
      </div>
    </div>
  );
}

function Choices<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: Option<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby="quiz-step-h" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            className={`group relative flex cursor-pointer flex-col gap-2 rounded-card border p-4 transition-[border-color,box-shadow,transform] duration-(--duration-fast) ease-standard has-focus-visible:ring-2 has-focus-visible:ring-ring hover:-translate-y-0.5 hover:shadow-soft ${
              on ? "border-accent shadow-soft" : "border-border"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className={`h-12 w-full rounded-control ${o.swatch}`} aria-hidden />
            <span className="flex items-center justify-between gap-2 font-medium">
              {o.label}
              {on && (
                <span className="flex h-5 w-5 items-center justify-center rounded-pill bg-accent text-accent-foreground" aria-hidden>
                  <CheckIcon width={13} height={13} />
                </span>
              )}
            </span>
            <span className="text-sm text-muted">{o.text}</span>
          </label>
        );
      })}
    </div>
  );
}

function NotePicker({
  notes,
  prefs,
  onCycle,
}: {
  notes: FragranceNote[];
  prefs: Record<string, Pref>;
  onCycle: (slug: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = notes.filter((n) => n.name.toLowerCase().includes(filter.toLowerCase()));
  const liked = notes.filter((n) => prefs[n.slug] === "like");
  const avoided = notes.filter((n) => prefs[n.slug] === "avoid");
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Optional. Tap once to <strong className="text-foreground">love</strong> a note, twice to{" "}
        <strong className="text-foreground">avoid</strong> it, a third time to clear. We never suggest a scent with a
        note you avoid.
      </p>
      {notes.length > 18 && (
        <label className="block max-w-xs">
          <span className="sr-only">Filter notes</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter notes"
            className="focus-ring h-10 w-full rounded-pill border border-border-strong bg-surface px-4 text-sm placeholder:text-muted"
          />
        </label>
      )}
      <ul className="flex flex-wrap gap-2" aria-label="Notes">
        {shown.map((n) => {
          const pref = prefs[n.slug];
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onCycle(n.slug)}
                aria-label={`${n.name}: ${pref === "like" ? "loved" : pref === "avoid" ? "avoided" : "no preference"}`}
                className={`focus-ring inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-pill border px-4 text-sm transition-colors duration-(--duration-fast) ${
                  pref === "like"
                    ? "border-gold bg-gold-soft text-gold-strong"
                    : pref === "avoid"
                      ? "border-danger bg-danger-soft text-danger line-through"
                      : "border-border-strong hover:bg-surface-2"
                }`}
              >
                {pref === "like" && <HeartIcon width={14} height={14} filled aria-hidden />}
                {pref === "avoid" && <BanIcon width={14} height={14} aria-hidden />}
                {n.name}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted" aria-live="polite">
        {liked.length || avoided.length
          ? `${liked.length ? `Loving ${liked.map((n) => n.name).join(", ")}` : ""}${liked.length && avoided.length ? " · " : ""}${avoided.length ? `avoiding ${avoided.map((n) => n.name).join(", ")}` : ""}.`
          : "No notes picked — we'll go by your mood."}
      </p>
    </div>
  );
}

function Results({
  headingRef,
  result,
  error,
  onRefine,
  onRestart,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  result: QuizResults | null;
  error?: string;
  onRefine: () => void;
  onRestart: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your matches</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-3xl font-semibold tracking-display outline-none sm:text-4xl">
            Scents picked for you
          </h2>
          {result && <p className="mt-1 text-sm text-muted">{result.summary}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefine}>
            Change answers
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart}>
            Start over
          </Button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : !result ? (
        <div className="space-y-3" role="status" aria-busy aria-label="Finding your matches">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : result.results.length === 0 ? (
        <p className="rounded-card bg-surface-2 px-5 py-6 text-sm">
          Nothing fits every answer. Try avoiding fewer notes, or pick “All year”.
        </p>
      ) : (
        <ol className="space-y-4" aria-label="Ranked matches">
          {result.results.map((s, i) => (
            <motion.li
              key={s.product.id}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : Math.min(i, 6) * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={`/products/${s.product.slug}`}
                className={`focus-ring group flex items-center gap-4 rounded-card border bg-surface p-3 shadow-hairline transition-shadow duration-(--duration-fast) hover:shadow-soft sm:gap-5 sm:p-4 ${
                  i === 0 ? "border-gold" : "border-border"
                }`}
              >
                <span className="w-6 shrink-0 text-center font-display text-xl font-semibold text-muted tabular-nums">
                  <span className="sr-only">Rank </span>
                  {i + 1}
                </span>
                <span className="relative h-24 w-20 shrink-0 overflow-hidden rounded-control bg-surface-2">
                  {s.product.primary_image && (
                    <Image src={s.product.primary_image.url} alt="" fill sizes="80px" className="object-cover transition-transform duration-(--duration-slower) group-hover:scale-105" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {i === 0 && <span className="eyebrow mb-1 block">Best match</span>}
                  <span className="block font-display text-xl font-semibold">{s.product.name}</span>
                  <span className="block text-sm text-muted">
                    {[s.product.brand?.name, s.product.fragrance_family?.name].filter(Boolean).join(" · ")}
                    {" · "}
                    {formatMoney(s.product.base_price, s.product.currency)}
                  </span>
                  {s.reasons.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {s.reasons.map((r) => (
                        <li key={r} className="flex items-center gap-1">
                          <CheckIcon width={12} height={12} className="text-success" aria-hidden />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
                <span className="hidden shrink-0 sm:block">
                  <MatchBadge match={s.match} size="lg" />
                </span>
                <span className="shrink-0 sm:hidden">
                  <MatchBadge match={s.match} />
                </span>
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
  );
}

function readAnswers(sp: URLSearchParams) {
  const pick = <T extends string>(key: string, allowed: Option<T>[]) =>
    allowed.find((o) => o.value === sp.get(key))?.value;
  const mood = pick("mood", MOODS);
  const occasion = pick("occasion", OCCASIONS);
  const season = pick("season", SEASONS);
  const list = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean).slice(0, 12);
  const like = list("like");
  const avoid = list("avoid");
  const prefs: Record<string, Pref> = {};
  for (const s of like) prefs[s] = "like";
  for (const s of avoid) prefs[s] = "avoid";
  const complete = !!(mood && occasion && season);
  const answers: QuizAnswers | null = complete
    ? { mood: mood!, occasion: occasion!, season: season!, liked_notes: like, disliked_notes: avoid }
    : null;
  return { mood, occasion, season, prefs, complete, answers };
}
