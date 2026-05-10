"use client";

import { useMemo } from "react";
import {
  ACTION_LABELS,
  PERMISSION_GROUPS,
  type Action,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Renders the bilingual permission checklist used by both the Add User
 * and Edit User dialogs.
 *
 * Controlled component — the parent owns the Set of selected actions
 * and wires onChange to mutate it. Per group, a header checkbox
 * reflects "all/some/none" state and toggles the whole group.
 *
 * `disabled` blocks toggling individual items (used by EditUserDialog
 * when the actor doesn't have user.editPermissions — they see the
 * current state but can't change it).
 *
 * `lockedActions` greys out specific items the actor lacks the
 * authority to grant. Currently used to grey user.disable and
 * user.editPermissions for non-OWNER actors. Locked items still show
 * their current value but can't be ticked or unticked.
 */
export function PermissionsChecklist({
  selected,
  onChange,
  disabled = false,
  lockedActions,
}: {
  selected: Set<Action>;
  onChange: (next: Set<Action>) => void;
  disabled?: boolean;
  lockedActions?: ReadonlySet<Action>;
}) {
  const totalSelected = selected.size;

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {totalSelected} рухсат танланган · {totalSelected} permissions
        selected
      </div>

      {PERMISSION_GROUPS.map((group) => (
        <Group
          key={group.key}
          label={group.label}
          actions={group.actions}
          selected={selected}
          onChange={onChange}
          disabled={disabled}
          lockedActions={lockedActions}
        />
      ))}
    </div>
  );
}

function Group({
  label,
  actions,
  selected,
  onChange,
  disabled,
  lockedActions,
}: {
  label: string;
  actions: Action[];
  selected: Set<Action>;
  onChange: (next: Set<Action>) => void;
  disabled: boolean;
  lockedActions?: ReadonlySet<Action>;
}) {
  const counts = useMemo(() => {
    let on = 0;
    for (const a of actions) {
      if (selected.has(a)) on++;
    }
    return { on, total: actions.length };
  }, [actions, selected]);

  const allOn = counts.on === counts.total;
  const someOn = counts.on > 0 && !allOn;

  // Toggling the group header flips every action in this group except
  // the locked ones (they keep their current value).
  function toggleGroup() {
    if (disabled) return;
    const next = new Set(selected);
    if (allOn) {
      for (const a of actions) {
        if (lockedActions?.has(a)) continue;
        next.delete(a);
      }
    } else {
      for (const a of actions) {
        if (lockedActions?.has(a)) continue;
        next.add(a);
      }
    }
    onChange(next);
  }

  function toggleOne(action: Action) {
    if (disabled || lockedActions?.has(action)) return;
    const next = new Set(selected);
    if (next.has(action)) next.delete(action);
    else next.add(action);
    onChange(next);
  }

  return (
    <div className="rounded-md border bg-card">
      <label
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b bg-muted/30",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={allOn}
          ref={(el) => {
            if (el) el.indeterminate = someOn;
          }}
          onChange={toggleGroup}
          disabled={disabled}
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {counts.on}/{counts.total}
        </span>
      </label>
      <div className="p-2 space-y-1">
        {actions.map((action) => {
          const locked = lockedActions?.has(action) ?? false;
          return (
            <label
              key={action}
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded text-sm",
                disabled || locked
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-accent",
              )}
              title={locked ? "Only OWNER can grant this permission" : undefined}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selected.has(action)}
                onChange={() => toggleOne(action)}
                disabled={disabled || locked}
              />
              <span>{ACTION_LABELS[action]}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
