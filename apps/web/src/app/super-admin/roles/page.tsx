"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useAdminApi, type MatrixModule, type PermissionMatrix, type Role } from "@/lib/admin";
import { useLoad } from "@/lib/use-load";
import { errorText } from "@/lib/http";
import { toast } from "@/lib/toast";
import { LoadError, PageHeader, SuperAdminBadge } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { LockIcon, PlusIcon, ShieldIcon, TrashIcon } from "@/components/ui/icons";

type Action = "view" | "create" | "edit" | "delete";
const ACTION_LABEL: Record<Action, string> = { view: "View", create: "Create", edit: "Edit", delete: "Delete" };

export default function RolesPage() {
  const api = useAdminApi();
  const { data, error, reload, update } = useLoad("roles-matrix", () => Promise.all([api.matrix(), api.roles()]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-[32rem]" />;
  const [matrix, roles] = data;
  const editable = roles.filter((r) => r.name !== "CUSTOMER" && r.name !== "VENDOR");
  const selected = editable.find((r) => r.id === selectedId) ?? editable.find((r) => r.name === "ADMIN") ?? editable[0];

  const replaceRole = (role: Role) =>
    update(([m, list]) => [m, list.some((r) => r.id === role.id) ? list.map((r) => (r.id === role.id ? role : r)) : [...list, role]]);

  async function remove(role: Role) {
    const ok = await confirmDialog({
      title: `Delete the ${role.name} role?`,
      description: "Nobody holds it, so no one loses access. This can't be undone.",
      confirmLabel: "Delete role",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteRole(role.id);
      update(([m, list]) => [m, list.filter((r) => r.id !== role.id)]);
      setSelectedId(null);
      toast.success("Role deleted");
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role may do, module by module. The API checks these codes on every request; violet rows are reserved for the super admin and can't be granted."
        actions={
          <Button variant="platform" onClick={() => setCreating(true)}>
            <PlusIcon width={16} height={16} aria-hidden /> New role
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Roles">
          <ul className="space-y-1">
            {editable.map((r) => {
              const on = r.id === selected?.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-current={on || undefined}
                    onClick={() => setSelectedId(r.id)}
                    className={`focus-ring flex w-full cursor-pointer items-center justify-between gap-2 rounded-control px-3.5 py-2.5 text-left text-sm transition-colors duration-(--duration-fast) ${
                      on ? "bg-platform text-platform-foreground" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {r.locked && <LockIcon width={13} height={13} aria-hidden />}
                        <span className="truncate">{r.name.replaceAll("_", " ")}</span>
                      </span>
                      <span className={`block text-xs ${on ? "opacity-80" : "text-muted"}`}>
                        {r.user_count} {r.user_count === 1 ? "person" : "people"} · {r.built_in ? "built-in" : "custom"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        {selected && (
          <RoleMatrix
            key={selected.id + selected.permissions.join()}
            role={selected}
            matrix={matrix}
            onSaved={replaceRole}
            onDelete={() => remove(selected)}
          />
        )}
      </div>
      <CreateRoleModal
        open={creating}
        roles={editable}
        onClose={() => setCreating(false)}
        onCreated={(r) => {
          replaceRole(r);
          setSelectedId(r.id);
          setCreating(false);
        }}
      />
    </>
  );
}

function RoleMatrix({
  role,
  matrix,
  onSaved,
  onDelete,
}: {
  role: Role;
  matrix: PermissionMatrix;
  onSaved: (r: Role) => void;
  onDelete: () => void;
}) {
  const api = useAdminApi();
  const [granted, setGranted] = useState<Set<string>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);
  const isSuper = role.name === "SUPER_ADMIN";
  const readOnly = role.locked;
  const before = new Set(role.permissions);
  const added = [...granted].filter((c) => !before.has(c));
  const removed = [...before].filter((c) => !granted.has(c));
  const dirty = added.length + removed.length > 0;

  // View is implied by any other action; dropping view drops the rest.
  function toggle(m: MatrixModule, action: Action, on: boolean) {
    setGranted((g) => {
      const next = new Set(g);
      const code = m.actions[action];
      if (!code) return g;
      if (on) {
        next.add(code);
        if (action !== "view" && m.actions.view) next.add(m.actions.view);
      } else {
        next.delete(code);
        if (action === "view") for (const c of Object.values(m.actions)) if (c) next.delete(c);
      }
      return next;
    });
  }

  function toggleRow(m: MatrixModule) {
    const codes = Object.values(m.actions).filter(Boolean) as string[];
    const all = codes.every((c) => granted.has(c));
    setGranted((g) => {
      const next = new Set(g);
      for (const c of codes) {
        if (all) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  }

  async function save() {
    const ok = await confirmDialog({
      title: `Save changes to ${role.name}?`,
      description: [
        added.length ? `Grant: ${added.join(", ")}.` : "",
        removed.length ? `Revoke: ${removed.join(", ")}.` : "",
        `Applies to ${role.user_count} ${role.user_count === 1 ? "person" : "people"} on their next request.`,
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: "Save permissions",
    });
    if (!ok) return;
    setBusy(true);
    try {
      onSaved(await api.updateRole(role.id, { permissions: [...granted] }));
      toast.success("Permissions saved");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const groups = [...new Set(matrix.modules.map((m) => m.group))];
  return (
    <section aria-labelledby="matrix-h" className="min-w-0 rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
        <div>
          <h2 id="matrix-h" className="flex items-center gap-2 font-display text-2xl font-semibold">
            {role.name.replaceAll("_", " ")}
            {isSuper && <SuperAdminBadge label="All access" />}
          </h2>
          <p className="text-sm text-muted">
            {isSuper
              ? "Holds every permission, always — including ones added later. It can't be edited."
              : readOnly
                ? "This role isn't a staff role and can't be edited here."
                : role.description || "Tick what this role may do."}
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {!role.built_in && (
              <Button variant="ghost" size="sm" onClick={onDelete} disabled={role.user_count > 0} title={role.user_count > 0 ? "Remove it from everyone first" : undefined}>
                <TrashIcon width={15} height={15} aria-hidden /> Delete role
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={!dirty || busy} onClick={() => setGranted(new Set(role.permissions))}>
              Discard
            </Button>
            <Button variant="platform" size="sm" disabled={!dirty} loading={busy} onClick={save}>
              <ShieldIcon width={15} height={15} aria-hidden /> Save{dirty ? ` (${added.length + removed.length})` : ""}
            </Button>
          </div>
        )}
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Permissions for {role.name}: modules by action</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-2xs font-semibold tracking-eyebrow text-muted uppercase">
                Module
              </th>
              {matrix.actions.map((a) => (
                <th key={a} scope="col" className="w-20 px-2 py-2.5 text-center text-2xs font-semibold tracking-eyebrow text-muted uppercase">
                  {ACTION_LABEL[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr>
                  <th colSpan={1 + matrix.actions.length} scope="colgroup" className="bg-background px-4 pt-4 pb-1 text-left text-xs font-semibold text-muted">
                    {group}
                  </th>
                </tr>
                {matrix.modules
                  .filter((m) => m.group === group)
                  .map((m) => {
                    const locked = m.super_admin_only;
                    return (
                      <tr key={m.key} className={`border-t border-border ${locked ? "bg-platform-soft/60" : ""}`}>
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          {locked || readOnly ? (
                            <span className="flex items-center gap-2">
                              {m.label}
                              {locked && (
                                <Badge tone="platform">
                                  <LockIcon width={11} height={11} aria-hidden /> Super admin only
                                </Badge>
                              )}
                            </span>
                          ) : (
                            <button type="button" onClick={() => toggleRow(m)} className="focus-ring cursor-pointer rounded-sm text-left hover:text-accent" title="Toggle every action for this module">
                              {m.label}
                            </button>
                          )}
                        </th>
                        {matrix.actions.map((a) => {
                          const code = m.actions[a];
                          if (!code)
                            return (
                              <td key={a} className="px-2 py-2 text-center text-muted" aria-label="Not applicable">
                                —
                              </td>
                            );
                          const checked = isSuper || granted.has(code);
                          const changed = !isSuper && before.has(code) !== granted.has(code);
                          return (
                            <td key={a} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={readOnly || locked}
                                onChange={(e) => toggle(m, a, e.target.checked)}
                                aria-label={`${m.label}: ${ACTION_LABEL[a]}`}
                                title={matrix.descriptions[code] ?? code}
                                className={`h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed ${
                                  changed ? "outline-2 outline-offset-2 outline-platform" : ""
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {dirty && (
        <p className="border-t border-border px-4 py-3 text-xs text-muted" aria-live="polite">
          Unsaved: {added.length} to grant, {removed.length} to revoke (outlined).
        </p>
      )}
    </section>
  );
}

function CreateRoleModal({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  onCreated: (r: Role) => void;
}) {
  const api = useAdminApi();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (n.length < 2) return setError("Use at least 2 letters");
    const source = roles.find((r) => r.id === copyFrom);
    setBusy(true);
    setError(null);
    try {
      const permissions = source && source.name !== "SUPER_ADMIN" ? source.permissions : [];
      const role = await api.createRole({ name: n, description: description.trim() || undefined, permissions });
      toast.success(`${role.name} created`);
      setName("");
      setDescription("");
      setCopyFrom("");
      onCreated(role);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New role"
      description="Create it here, then tick its permissions in the matrix."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="role-form" variant="platform" loading={busy}>
            Create role
          </Button>
        </>
      }
    >
      <form id="role-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          hint="Saved in capitals, e.g. CONTENT_EDITOR."
          error={error ?? undefined}
          data-autofocus
        />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
        <Select
          label="Start from"
          value={copyFrom}
          onChange={(e) => setCopyFrom(e.target.value)}
          placeholder="Nothing (no permissions)"
          options={roles.filter((r) => r.name !== "SUPER_ADMIN").map((r) => ({ value: r.id, label: `Copy of ${r.name}` }))}
        />
      </form>
    </Modal>
  );
}
