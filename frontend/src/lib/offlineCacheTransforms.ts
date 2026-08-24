export function removeEntityFromValue(
  value: unknown,
  entityId: string
): { value: unknown; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const filtered = value.filter((item) => {
      const shouldRemove =
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        String(item.id) === entityId;
      if (shouldRemove) changed = true;
      return !shouldRemove;
    });

    return {
      value: filtered.map((item) => {
        const nested = removeEntityFromValue(item, entityId);
        changed ||= nested.changed;
        return nested.value;
      }),
      changed,
    };
  }

  if (typeof value === "object" && value !== null) {
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nested = removeEntityFromValue(nestedValue, entityId);
      result[key] = nested.value;
      changed ||= nested.changed;
    }
    return { value: result, changed };
  }

  return { value, changed: false };
}

export function upsertEntityInValue(
  value: unknown,
  entity: Record<string, unknown>,
  appendIfMissing = true
): { value: unknown; changed: boolean } {
  const entityId = String(entity.id ?? "");
  if (!entityId) return { value, changed: false };

  if (Array.isArray(value)) {
    const index = value.findIndex(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        String(item.id) === entityId
    );
    if (index >= 0) {
      const next = [...value];
      next[index] = { ...(next[index] as Record<string, unknown>), ...entity };
      return { value: next, changed: true };
    }
    return appendIfMissing
      ? { value: [...value, entity], changed: true }
      : { value, changed: false };
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (String(record.id ?? "") === entityId) {
      return { value: { ...record, ...entity }, changed: true };
    }
    if (Array.isArray(record.data)) {
      const nested = upsertEntityInValue(record.data, entity, appendIfMissing);
      return nested.changed
        ? { value: { ...record, data: nested.value }, changed: true }
        : { value, changed: false };
    }
  }

  return { value, changed: false };
}
