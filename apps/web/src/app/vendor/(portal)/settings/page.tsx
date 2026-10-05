"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRef, useState } from "react";
import { useForm, useWatch, type Path } from "react-hook-form";
import { z } from "zod";
import { useVendorApi, VendorApiError } from "@/lib/vendor";
import { toast } from "@/lib/toast";
import { useVendor } from "@/components/vendor/vendor-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { UploadIcon } from "@/components/ui/icons";

const schema = z.object({
  description: z.string().trim().max(5000),
  logo_url: z.string().max(500),
  contact_email: z.email("Enter a valid email"),
  contact_phone: z
    .string()
    .trim()
    .refine((v) => v === "" || (v.length >= 5 && v.length <= 30), "5–30 characters"),
  payout_details: z.string().trim().max(2000),
});
type Values = z.input<typeof schema>;

export default function VendorSettingsPage() {
  const api = useVendorApi();
  const { summary, readOnly, refresh } = useVendor();
  const v = summary.vendor;
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: {
      description: v.description ?? "",
      logo_url: v.logo_url ?? "",
      contact_email: v.contact_email,
      contact_phone: v.contact_phone ?? "",
      payout_details: v.payout_details ?? "",
    },
  });
  const [logo, description] = useWatch({ control, name: ["logo_url", "description"] });

  async function onSubmit(values: Values) {
    try {
      const saved = await api.updateMe({
        description: values.description || null,
        logo_url: values.logo_url || null,
        contact_email: values.contact_email,
        contact_phone: values.contact_phone || null,
        payout_details: values.payout_details || null,
      });
      reset({
        description: saved.description ?? "",
        logo_url: saved.logo_url ?? "",
        contact_email: saved.contact_email,
        contact_phone: saved.contact_phone ?? "",
        payout_details: saved.payout_details ?? "",
      });
      await refresh();
      toast.success("Store settings saved");
    } catch (err) {
      if (err instanceof VendorApiError && Object.keys(err.fields).length) {
        for (const [k, m] of Object.entries(err.fields)) setError(k as Path<Values>, { message: m });
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't save");
      }
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await api.upload(file);
      setValue("logo_url", asset.url, { shouldDirty: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Store settings</h1>
        <p className="text-sm text-muted">How your store appears to shoppers, and how we reach and pay you.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <Card as="section">
            <CardHeader title="Storefront" />
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-pill border border-border bg-surface-2">
                  {logo ? (
                    <Image src={logo} alt={`${v.name} logo`} fill sizes="80px" className="object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center font-display text-2xl text-muted" aria-hidden>
                      {v.name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void uploadLogo(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
                    <UploadIcon width={15} height={15} /> {logo ? "Replace logo" : "Upload logo"}
                  </Button>
                  {logo && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setValue("logo_url", "", { shouldDirty: true })}>
                      Remove
                    </Button>
                  )}
                  <p className="text-xs text-muted">Square, at least 400 × 400 px.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Store name" value={v.name} readOnly disabled hint="Contact support to rename your store." />
                <Input label="Store address" value={`/products?vendor=${v.slug}`} readOnly disabled />
              </div>
              <Textarea
                label="About your store"
                rows={5}
                {...register("description")}
                error={errors.description?.message}
                hint={`${description.length}/5000 · what you make or curate, and why.`}
              />
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Contact" description="Where we send order and payout notifications." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Contact email" type="email" required {...register("contact_email")} error={errors.contact_email?.message} />
              <Input label="Phone" type="tel" {...register("contact_phone")} error={errors.contact_phone?.message} />
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Payouts" description="Commission and tax details are set during review." />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Commission" value={v.commission_rate ? `${Number(v.commission_rate)}%` : "Platform default"} readOnly disabled />
                <Input label="PAN / VAT number" value={v.tax_id ?? "Not provided"} readOnly disabled />
              </div>
              <Textarea
                label="Bank or wallet details"
                rows={3}
                {...register("payout_details")}
                error={errors.payout_details?.message}
                hint="Account name, bank, branch and number — or your eSewa/Khalti ID. Only finance staff see this."
              />
            </div>
          </Card>
        </fieldset>

        {!readOnly && (
          <div className="flex items-center justify-end gap-3">
            <p className="mr-auto text-sm text-muted" aria-live="polite">
              {isDirty ? "Unsaved changes" : ""}
            </p>
            <Button type="button" variant="ghost" disabled={!isDirty || isSubmitting} onClick={() => reset()}>
              Discard
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save settings
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
