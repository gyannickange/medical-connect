import { describe, expect, it } from "vitest";
import { patientFormSections } from "./patientFormFields";

describe("patientFormSections", () => {
  it("has 6 sections matching the Medical Connect patient intake form", () => {
    expect(patientFormSections.map((s) => s.key)).toEqual([
      "identification",
      "contact",
      "emergencyContact",
      "medical",
      "administrative",
      "pediatric",
    ]);
  });

  it("marks the fields required on the maquette as required", () => {
    const identification = patientFormSections.find((s) => s.key === "identification")!;
    const required = identification.fields.filter((f) => f.required).map((f) => f.name);
    expect(required).toEqual(
      expect.arrayContaining(["lastName", "firstName", "dateOfBirth", "sex", "primaryPhone", "residenceAddress"])
    );
  });
});
