export interface SettingRecord {
  id: string;
  tenantId: string;
  key: string;
  value: string;
  category: string;
  dataType: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function upsertSettingRecord(
  previous: SettingRecord[],
  next: SettingRecord,
): SettingRecord[] {
  const index = previous.findIndex((setting) => setting.key === next.key);
  if (index === -1) return [...previous, next];
  return previous.map((setting, current) =>
    current === index ? next : setting,
  );
}
