import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UpdateConsultationDto } from "./update-consultation.dto";

describe("UpdateConsultationDto — carePlan", () => {
  it("rejects a carePlan whose fields don't match its declared orientation", async () => {
    const dto = plainToInstance(UpdateConsultationDto, {
      carePlan: { orientation: "retour_domicile", appointmentDate: "2026-11-10" },
    });
    const errors = await validate(dto);
    const carePlanError = errors.find((e) => e.property === "carePlan");
    expect(carePlanError).toBeDefined();
  });

  it("accepts a carePlan whose fields match its declared orientation", async () => {
    const dto = plainToInstance(UpdateConsultationDto, {
      carePlan: { orientation: "retour_domicile", medicalRecommendations: "Repos 48h", patientInstructions: "Consulter si fièvre" },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "carePlan")).toBeUndefined();
  });
});
