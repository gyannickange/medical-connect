import { z } from "zod";
import { t } from "./index";

/**
 * Zod's built-in issue messages ("String must contain at least 1
 * character(s)", "Invalid email") are English-only and get rendered
 * verbatim by every form (e.g. ProductModal.tsx's
 * `form.formState.errors.name.message`), regardless of the app's current
 * language - none of the schemas in shared/schema.ts pass a custom message
 * to .min()/.email()/etc. Rather than adding one to every field on every
 * schema, this replaces Zod's global error map once so every issue is
 * translated centrally, reading the current language fresh on each call
 * (via t(), which itself reads localStorage) so a language switch takes
 * effect immediately without re-registering anything.
 */
export const zodErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: t("zodFieldRequired") };
      }
      return { message: t("zodInvalidType") };

    case z.ZodIssueCode.too_small:
      if (issue.type === "string") {
        return {
          message:
            issue.minimum === 1
              ? t("zodFieldRequired")
              : t("zodStringTooShort").replace("{min}", String(issue.minimum)),
        };
      }
      if (issue.type === "number") {
        return {
          message: t("zodNumberTooSmall").replace("{min}", String(issue.minimum)),
        };
      }
      if (issue.type === "array") {
        return {
          message: t("zodArrayTooShort").replace("{min}", String(issue.minimum)),
        };
      }
      break;

    case z.ZodIssueCode.too_big:
      if (issue.type === "string") {
        return {
          message: t("zodStringTooLong").replace("{max}", String(issue.maximum)),
        };
      }
      if (issue.type === "number") {
        return {
          message: t("zodNumberTooLarge").replace("{max}", String(issue.maximum)),
        };
      }
      break;

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: t("zodInvalidEmail") };
      if (issue.validation === "url") return { message: t("zodInvalidUrl") };
      break;

    case z.ZodIssueCode.invalid_enum_value:
      return { message: t("zodInvalidSelection") };
  }

  return { message: ctx.defaultError };
};

export function installZodErrorMap(): void {
  z.setErrorMap(zodErrorMap);
}
