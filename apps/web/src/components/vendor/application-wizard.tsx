"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { useVendorApi, VendorApiError, type Vendor } from "@/lib/vendor";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const schema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(120),
  description: z.string().trim().min(30, "Tell us a little more — at least 30 characters").max(5000),
  contact_email: z.email("Enter a valid email"),
  contact_phone: z.string().trim().min(5, "Enter a phone number").max(30),
  business_registration_no: z.string().trim().max(60),
  tax_id: z.string().trim().max(60),
  payout_details: z.string().trim().max(2000),
  agree: z.literal(true, { error: "Please accept the seller terms" }),
});
type Values = z.input<typeof schema>;

const STEPS = [
  { id: "store", label: "Store", fields: ["name", "description"] },
  { id: "contact", label: "Contact", fields: ["contact_email", "contact_phone"] },
  { id: "business", label: "Business", fields: ["business_registration_no", "tax_id", "payout_details"] },
  { id: "review", label: "Review", fields: ["agree"] },
] as const;

/**
 * Seller application in four short steps. Each step validates only its own
 * fields before moving on; the last step reviews everything and submits. A
 * rejected applicant re-applies with their previous answers pre-filled.
 */
export function ApplicationWizard() {
  const { user, ready } = useAuth();
  const api = useVendorApi();
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [previous, setPrevious] = useState<Vendor | null | undefined>(undefined);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      description: "",
      contact_email: user?.email ?? "",
      contact_phone: user?.phone ?? "",
      business_registration_no: "",
      tax_id: "",
      payout_details: "",
      agree: false as unknown as true,
    },
  });
  const { register, trigger, handleSubmit, getValues, setError, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  // Already applied? Pending/approved go to the status page; rejected re-apply here.
  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    api
      .me()
      .then((v) => {
        if (!active) return;
        if (v.status !== "REJECTED") {
          router.replace("/vendor/status");
          return;
        }
        setPrevious(v);
        reset({
          name: v.name,
          description: v.description ?? "",
          contact_email: v.contact_email,
          contact_phone: v.contact_phone ?? "",
          business_registration_no: v.business_registration_no ?? "",
          tax_id: v.tax_id ?? "",
          payout_details: v.payout_details ?? "",
          agree: false as unknown as true,
        });
      })
      .catch(() => {
        if (!active) return;
        setPrevious(null);
        // First application: start from the account's contact details (the form
        // initialised before auth had hydrated, so they weren't known then).
        reset({ ...getValues(), contact_email: user.email, contact_phone: user.phone ?? "" });
      });
    return () => {
      active = false;
    };
  }, [ready, user, api, router, reset, getValues]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  async function next() {
    const ok = await trigger(STEPS[step].fields as unknown as Path<Values>[], { shouldFocus: true });
    if (!ok) return;
    const to = step + 1;
    setStep(to);
    setReached((r) => Math.max(r, to));
  }

  async function submit(values: Values) {
    try {
      await api.apply({
        name: values.name,
        description: values.description,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone || null,
        business_registration_no: values.business_registration_no || null,
        tax_id: values.tax_id || null,
        payout_details: values.payout_details || null,
      });
      toast.success("Application sent");
      router.replace("/vendor/status?submitted=1");
    } catch (err) {
      if (err instanceof VendorApiError && Object.keys(err.fields).length) {
        for (const [k, m] of Object.entries(err.fields)) setError(k as Path<Values>, { message: m });
        const first = STEPS.findIndex((s) => s.fields.some((f) => f in err.fields));
        if (first >= 0) setStep(first);
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't send your application");
      }
    }
  }

  if (!ready || previous === undefined) return <Skeleton className="h-96 rounded-panel" />;

  const v = getValues();

  return (
    <Card padding="lg">
      {previous?.status === "REJECTED" && (
        <p className="mb-6 rounded-card bg-danger-soft p-4 text-sm text-danger" role="status">
          Your last application wasn&apos;t approved{previous.status_reason ? `: ${previous.status_reason}` : "."} Update
          your details and send it again.
        </p>
      )}
      <LabelledSteps current={step} reached={reached} labels={STEPS.map((s) => s.label)} onGo={setStep} />

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <h2 ref={heading} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
          {["About your store", "How we reach you", "Business & payouts", "Check and send"][step]}
        </h2>

        <div hidden={step !== 0} className="space-y-4">
          <Input label="Store name" required {...register("name")} error={errors.name?.message} hint="Shown to shoppers on every product you sell." />
          <Textarea
            label="What do you sell?"
            required
            rows={5}
            {...register("description")}
            error={errors.description?.message}
            hint="Your products, where they're made or sourced, and since when."
          />
        </div>

        <div hidden={step !== 1} className="grid gap-4 sm:grid-cols-2">
          <Input label="Contact email" type="email" required {...register("contact_email")} error={errors.contact_email?.message} />
          <Input label="Phone" type="tel" required {...register("contact_phone")} error={errors.contact_phone?.message} />
        </div>

        <div hidden={step !== 2} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Company registration no." {...register("business_registration_no")} error={errors.business_registration_no?.message} hint="Optional for individuals." />
            <Input label="PAN / VAT number" {...register("tax_id")} error={errors.tax_id?.message} hint="Needed before your first payout." />
          </div>
          <Textarea label="Bank or wallet details" rows={3} {...register("payout_details")} error={errors.payout_details?.message} hint="You can add these later in store settings." />
        </div>

        <div hidden={step !== 3} className="space-y-4">
          <dl className="divide-y divide-border rounded-card border border-border text-sm">
            {[
              ["Store", v.name],
              ["About", v.description],
              ["Email", v.contact_email],
              ["Phone", v.contact_phone],
              ["Registration", v.business_registration_no || "—"],
              ["PAN / VAT", v.tax_id || "—"],
              ["Payouts", v.payout_details || "Add later"],
            ].map(([k, val]) => (
              <div key={k} className="grid gap-1 p-3 sm:grid-cols-[140px_1fr]">
                <dt className="text-muted">{k}</dt>
                <dd className="line-clamp-3 whitespace-pre-line">{val}</dd>
              </div>
            ))}
          </dl>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" {...register("agree")} aria-invalid={!!errors.agree || undefined} className="mt-0.5 h-4 w-4 accent-accent" />
            <span>
              I confirm my products are authentic and agree to the seller terms, including commission on each sale and
              review of every product before it goes live.
            </span>
          </label>
          {errors.agree && (
            <p className="text-xs font-medium text-danger" role="alert">
              {errors.agree.message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              ← Back
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="submit" loading={isSubmitting}>
              Send application
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

/** Same visual language as the checkout progress, with our own labels. */
function LabelledSteps({
  current,
  reached,
  labels,
  onGo,
}: {
  current: number;
  reached: number;
  labels: string[];
  onGo: (i: number) => void;
}) {
  return (
    <nav aria-label="Application progress" className="mb-8">
      <ol className="grid grid-cols-4 gap-2">
        {labels.map((l, i) => {
          const done = i < current;
          const active = i === current;
          const dot = (
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-pill border-2 text-xs font-semibold ${
                done ? "border-accent bg-accent text-accent-foreground" : active ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              {i + 1}
            </span>
          );
          return (
            <li key={l} className="flex flex-col items-center gap-1.5 text-xs">
              {i <= reached && !active ? (
                <button type="button" onClick={() => onGo(i)} className="focus-ring flex cursor-pointer flex-col items-center gap-1.5 rounded-card px-2 py-1">
                  {dot}
                  <span>{l}</span>
                  <span className="sr-only">, completed — edit</span>
                </button>
              ) : (
                <span className="flex flex-col items-center gap-1.5 px-2 py-1" aria-current={active ? "step" : undefined}>
                  {dot}
                  <span className={active ? "font-semibold" : "text-muted"}>{l}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
