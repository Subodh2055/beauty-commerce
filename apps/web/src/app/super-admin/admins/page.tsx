"use client";

import { useState, type FormEvent } from "react";
import { useAdminApi, type AdminUser, type Role } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, SearchBox, relTime } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { promptDialog } from "@/components/ui/prompt";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PlusIcon, ShieldIcon, UsersIcon } from "@/components/ui/icons";

const NON_STAFF = new Set(["CUSTOMER", "VENDOR"]);

export default function AdminsPage() {
  const api = useAdminApi();
  const [q, setQ] = useState("");
  const admins = useLoad(`admins:${q}`, () => api.admins(q || undefined));
  const roles = useLoad("roles", () => api.roles());
  const staffRoles = (roles.data ?? []).filter((r) => !NON_STAFF.has(r.name));
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);

  async function toggleActive(a: AdminUser) {
    const deactivating = a.is_active;
    const reason = await promptDialog({
      title: deactivating ? `Deactivate ${a.email}?` : `Reactivate ${a.email}?`,
      description: deactivating
        ? "They're signed out everywhere and can't sign in at all until reactivated."
        : "They can sign in again with their existing roles.",
      label: "Reason",
      hint: "Recorded in the audit log.",
      required: deactivating,
      tone: deactivating ? "danger" : "platform",
      confirmLabel: deactivating ? "Deactivate" : "Reactivate",
    });
    if (reason === null) return;
    try {
      const next = await api.setAdminStatus(a.id, !deactivating, reason);
      admins.update((list) => list.map((x) => (x.id === a.id ? next : x)));
      toast.success(deactivating ? "Account deactivated" : "Account reactivated");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "who",
      header: "Person",
      cell: (a) => (
        <span className="block max-w-64">
          <span className="flex items-center gap-2 font-medium">
            <span className="truncate">{a.full_name || a.email}</span>
            {a.is_self && <Badge tone="neutral">You</Badge>}
          </span>
          <span className="block truncate text-xs text-muted">{a.email}</span>
        </span>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      cell: (a) => (
        <span className="flex flex-wrap gap-1">
          {a.roles.length === 0 ? (
            <span className="text-xs text-muted">No staff role</span>
          ) : (
            a.roles.map((r) =>
              r === "SUPER_ADMIN" ? (
                <Badge key={r} tone="platform">
                  <ShieldIcon width={12} height={12} aria-hidden /> Super admin
                </Badge>
              ) : (
                <Badge key={r} tone="neutral">
                  {r.replaceAll("_", " ")}
                </Badge>
              ),
            )
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => <Badge tone={a.is_active ? "success" : "danger"}>{a.is_active ? "Active" : "Deactivated"}</Badge>,
    },
    { key: "seen", header: "Last sign-in", cell: (a) => relTime(a.last_login_at), responsive: "hidden md:table-cell" },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (a) =>
        a.is_self ? (
          <span className="text-xs text-muted">Can&apos;t edit yourself</span>
        ) : (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
              Roles
            </Button>
            <Button size="sm" variant="ghost" onClick={() => toggleActive(a)}>
              {a.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Admins"
        description="Staff accounts and their roles. Removing a role signs that person out so it takes effect at once."
        actions={
          <Button variant="platform" onClick={() => setEditing("new")}>
            <PlusIcon width={16} height={16} aria-hidden /> Add admin
          </Button>
        }
      />
      <div className="mb-4 flex justify-end">
        <SearchBox label="Search admins" placeholder="Name or email" value={q} onChange={setQ} />
      </div>
      {admins.error ? (
        <LoadError error={admins.error} onRetry={admins.reload} />
      ) : (
        <DataTable
          caption="Admin users"
          columns={columns}
          rows={admins.data ?? []}
          rowKey={(a) => a.id}
          loading={!admins.data}
          rowClassName={(a) => (a.is_active ? "" : "opacity-70")}
          empty={<EmptyState compact icon={<UsersIcon width={22} height={22} />} title="No admins match" />}
        />
      )}
      <RolesModal
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        editing={editing}
        roles={staffRoles}
        onClose={() => setEditing(null)}
        onSaved={(a) => {
          admins.update((list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a]));
          setEditing(null);
        }}
      />
    </>
  );
}

function RolesModal({
  editing,
  roles,
  onClose,
  onSaved,
}: {
  editing: AdminUser | "new" | null;
  roles: Role[];
  onClose: () => void;
  onSaved: (a: AdminUser) => void;
}) {
  const api = useAdminApi();
  const existing = editing && editing !== "new" ? editing : null;
  const [email, setEmail] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set(existing?.roles ?? ["STAFF"]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!existing && !email.trim()) return setError("Enter their account email");
    if (!existing && chosen.size === 0) return setError("Pick at least one role");
    setBusy(true);
    setError(null);
    try {
      const saved = existing
        ? await api.setAdminRoles(existing.id, [...chosen])
        : await api.grantAdmin(email.trim(), [...chosen]);
      toast.success(existing ? "Roles updated" : `${saved.email} is now staff`);
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const removingAll = existing && chosen.size === 0;
  return (
    <Modal
      open={editing !== null}
      onClose={onClose}
      title={existing ? `Roles for ${existing.email}` : "Add an admin"}
      description={existing ? undefined : "They need an account first: ask them to sign up, then add their email here."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="roles-form" variant={removingAll ? "danger" : "platform"} loading={busy}>
            {removingAll ? "Remove admin access" : existing ? "Save roles" : "Grant access"}
          </Button>
        </>
      }
    >
      <form id="roles-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}
        {!existing && (
          <Input label="Account email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus />
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Roles</legend>
          <ul className="space-y-2">
            {roles.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3 has-checked:border-platform has-checked:bg-platform-soft">
                  <input
                    type="checkbox"
                    checked={chosen.has(r.name)}
                    onChange={(e) =>
                      setChosen((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.name);
                        else n.delete(r.name);
                        return n;
                      })
                    }
                    className="mt-0.5 h-4 w-4 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {r.name.replaceAll("_", " ")}
                      {r.name === "SUPER_ADMIN" && <ShieldIcon width={14} height={14} className="text-platform" aria-hidden />}
                    </span>
                    <span className="block text-xs text-muted">
                      {r.name === "SUPER_ADMIN"
                        ? "Everything, including this area. Grant sparingly."
                        : r.description || `${r.permissions.length} permissions`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {removingAll && (
          <p className="text-sm text-danger">With no staff role they lose admin access entirely (they keep their shopper account).</p>
        )}
      </form>
    </Modal>
  );
}
