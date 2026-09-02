export interface PhysicalExamOption {
  value: string;
  labelKey: string;
}

export const GENERAL_STATE_OPTIONS: PhysicalExamOption[] = [
  { value: "good", labelKey: "generalStateOptionGood" },
  { value: "impaired", labelKey: "generalStateOptionImpaired" },
  { value: "feverish", labelKey: "generalStateOptionFeverish" },
  { value: "asthenic", labelKey: "generalStateOptionAsthenic" },
  { value: "emaciated", labelKey: "generalStateOptionEmaciated" },
];

export const CONSCIOUSNESS_OPTIONS: PhysicalExamOption[] = [
  { value: "oriented", labelKey: "consciousnessOptionOriented" },
  { value: "alert", labelKey: "consciousnessOptionAlert" },
  { value: "drowsy", labelKey: "consciousnessOptionDrowsy" },
  { value: "confused", labelKey: "consciousnessOptionConfused" },
  { value: "comatose", labelKey: "consciousnessOptionComatose" },
];

export const HYDRATION_OPTIONS: PhysicalExamOption[] = [
  { value: "adequate", labelKey: "hydrationOptionAdequate" },
  { value: "dryMucous", labelKey: "hydrationOptionDryMucous" },
  { value: "dehydrated", labelKey: "hydrationOptionDehydrated" },
];

/**
 * Resolves a stored physicalExam value (e.g. "impaired") back to its i18n key.
 * Falls back to the raw value for legacy free-text data entered before this field became a select.
 */
export function physicalExamLabel(
  options: PhysicalExamOption[],
  value: string | null | undefined,
  t: (key: string) => string
): string {
  if (!value) return "";
  const option = options.find((o) => o.value === value);
  return option ? t(option.labelKey) : value;
}
