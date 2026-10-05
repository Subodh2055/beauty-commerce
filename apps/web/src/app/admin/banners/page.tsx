"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useAdminApi, type Banner, type BannerWrite } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { useCan } from "@/lib/permissions";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, RequirePermission, fmtDateTime } from "@/components/admin/ui";
import { ImageUpload } from "@/components/admin/image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EditIcon, ImageIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";

const PLACEMENTS = [
  { value: "home_hero", label: "Home hero" },
  { value: "home_promo", label: "Home promo strip" },
  { value: "category_top", label: "Top of category pages" },
];

function live(b: Banner): { label: string; tone: "success" | "neutral" | "warning" | "danger" } {
  const now = Date.now();
  if (!b.is_active) return { label: "Off", tone: "neutral" };
  if (b.starts_at && Date.parse(b.starts_at) > now) return { label: "Scheduled", tone: "warning" };
  if (b.ends_at && Date.parse(b.ends_at) <= now) return { label: "Ended", tone: "danger" };
  return { label: "Live", tone: "success" };
}

export default function BannersPage() {
  const api = useAdminApi();
  const { can } = useCan();
  const { data, error, reload, update } = useLoad("banners", () => api.banners());
  const [editing, setEditing] = useState<Banner | "new" | null>(null);

  async function toggle(b: Banner) {
    try {
      const next = await api.saveBanner(b.id, { ...strip(b), is_active: !b.is_active });
      update((list) => list.map((x) => (x.id === b.id ? next : x)));
      toast.success(next.is_active ? "Banner on" : "Banner off");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function remove(b: Banner) {
    const ok = await confirmDialog({
      title: `Delete “${b.title}”?`,
      description: "It disappears from the storefront immediately. Turning it off keeps it for later instead.",
      confirmLabel: "Delete banner",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteBanner(b.id);
      update((list) => list.filter((x) => x.id !== b.id));
      toast.success("Banner deleted");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const groups = PLACEMENTS.map((p) => ({ ...p, items: (data ?? []).filter((b) => b.placement === p.value) }));
  const other = (data ?? []).filter((b) => !PLACEMENTS.some((p) => p.value === b.placement));
  if (other.length) groups.push({ value: "other", label: "Other placements", items: other });

  return (
    <RequirePermission code="cms.view">
      <PageHeader
        title="Banners"
        description="Storefront banners by placement. Scheduled banners go live and end on their own; the storefront cache refreshes on every save."
        actions={
          can("cms.create") && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon width={16} height={16} aria-hidden /> New banner
            </Button>
          )
        }
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data ? (
        <Skeleton className="h-96" />
      ) : data.length === 0 ? (
        <EmptyState icon={<ImageIcon width={26} height={26} />} title="No banners yet" description="Add one to feature a collection or promotion." />
      ) : (
        <div className="space-y-8">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <section key={g.value} aria-labelledby={`pl-${g.value}`}>
                <h2 id={`pl-${g.value}`} className="eyebrow mb-3">
                  {g.label}
                </h2>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((b) => {
                    const s = live(b);
                    return (
                      <li key={b.id}>
                        <Card padding="none" className="overflow-hidden">
                          <div className="relative aspect-[16/7] bg-surface-2">
                            <Image src={b.image_url} alt="" fill sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                            <Badge tone={s.tone} className="absolute top-2 left-2">
                              {s.label}
                            </Badge>
                          </div>
                          <div className="space-y-2 p-4">
                            <p className="font-medium">{b.title}</p>
                            {b.subtitle && <p className="line-clamp-2 text-sm text-muted">{b.subtitle}</p>}
                            <p className="text-xs text-muted">
                              Order {b.sort_order}
                              {b.starts_at || b.ends_at ? ` · ${fmtDateTime(b.starts_at)} → ${fmtDateTime(b.ends_at)}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {can("cms.edit") && (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => toggle(b)}>
                                    {b.is_active ? "Turn off" : "Turn on"}
                                  </Button>
                                  <Button variant="ghost" size="sm" aria-label={`Edit ${b.title}`} onClick={() => setEditing(b)}>
                                    <EditIcon width={16} height={16} />
                                  </Button>
                                </>
                              )}
                              {can("cms.delete") && (
                                <Button variant="ghost" size="sm" aria-label={`Delete ${b.title}`} onClick={() => remove(b)}>
                                  <TrashIcon width={16} height={16} />
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}
      <BannerModal
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(b) => {
          update((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]));
          setEditing(null);
        }}
      />
    </RequirePermission>
  );
}

function strip(b: Banner): BannerWrite {
  return {
    placement: b.placement,
    title: b.title,
    subtitle: b.subtitle,
    image_url: b.image_url,
    mobile_image_url: b.mobile_image_url,
    link_url: b.link_url,
    cta_label: b.cta_label,
    sort_order: b.sort_order,
    is_active: b.is_active,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
  };
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function BannerModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Banner | "new" | null;
  onClose: () => void;
  onSaved: (b: Banner) => void;
}) {
  const api = useAdminApi();
  const existing = editing && editing !== "new" ? editing : null;
  const [form, setForm] = useState<BannerWrite>(
    existing
      ? strip(existing)
      : {
          placement: "home_hero",
          title: "",
          subtitle: null,
          image_url: "",
          mobile_image_url: null,
          link_url: null,
          cta_label: null,
          sort_order: 0,
          is_active: true,
          starts_at: null,
          ends_at: null,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setField = <K extends keyof BannerWrite>(k: K, v: BannerWrite[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the banner a title");
    if (!form.image_url) return setError("Upload an image");
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) return setError("The end must be after the start");
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveBanner(existing?.id ?? null, {
        ...form,
        title: form.title.trim(),
        subtitle: form.subtitle?.trim() || null,
        link_url: form.link_url?.trim() || null,
        cta_label: form.cta_label?.trim() || null,
      });
      toast.success(existing ? "Banner saved" : "Banner created");
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={existing ? "Edit banner" : "New banner"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="banner-form" loading={busy}>
            {existing ? "Save banner" : "Create banner"}
          </Button>
        </>
      }
    >
      <form id="banner-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        {error && (
          <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <ImageUpload label="Banner image (wide, ~2400×1050)" aspect="aspect-[16/7]" value={form.image_url} onChange={(url) => setField("image_url", url)} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Placement</legend>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => (
              <label key={p.value} className="flex cursor-pointer items-center gap-2 rounded-pill border border-border-strong px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-surface-2">
                <input type="radio" name="placement" value={p.value} checked={form.placement === p.value} onChange={() => setField("placement", p.value)} className="accent-accent" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Input label="Title" required value={form.title} maxLength={120} onChange={(e) => setField("title", e.target.value)} />
        <Input label="Subtitle" value={form.subtitle ?? ""} maxLength={255} onChange={(e) => setField("subtitle", e.target.value)} />
        <Input label="Link" placeholder="/categories/attar" value={form.link_url ?? ""} onChange={(e) => setField("link_url", e.target.value)} />
        <Input label="Button label" placeholder="Shop the edit" value={form.cta_label ?? ""} maxLength={40} onChange={(e) => setField("cta_label", e.target.value)} />
        <Input label="Starts" type="datetime-local" value={toLocalInput(form.starts_at)} onChange={(e) => setField("starts_at", fromLocalInput(e.target.value))} hint="Empty: live as soon as it's on." />
        <Input label="Ends" type="datetime-local" value={toLocalInput(form.ends_at)} onChange={(e) => setField("ends_at", fromLocalInput(e.target.value))} hint="Empty: runs until turned off." />
        <Input label="Order" type="number" step="1" value={form.sort_order} onChange={(e) => setField("sort_order", Number(e.target.value) || 0)} hint="Lower shows first." />
        <label className="flex cursor-pointer items-center gap-2.5 self-center text-sm">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setField("is_active", e.target.checked)} className="h-4 w-4 accent-accent" />
          On (shown when within its dates)
        </label>
      </form>
    </Modal>
  );
}
