import { IsString, IsOptional, IsIn, IsUUID, IsDateString, IsNumber, IsBoolean, IsArray, IsNotEmpty, ValidateNested, ValidateIf } from "class-validator";
import { Type } from "class-transformer";

class VitalSignsDto {
  @IsNumber() @IsOptional() bloodPressureSystolic?: number | null;
  @IsNumber() @IsOptional() bloodPressureDiastolic?: number | null;
  @IsNumber() @IsOptional() heartRate?: number | null;
  @IsNumber() @IsOptional() temperature?: number | null;
  @IsNumber() @IsOptional() oxygenSaturation?: number | null;
  @IsNumber() @IsOptional() respiratoryRate?: number | null;
  @IsNumber() @IsOptional() weightKg?: number | null;
  @IsNumber() @IsOptional() heightCm?: number | null;
  @IsNumber() @IsOptional() bmi?: number | null;
  @IsNumber() @IsOptional() capillaryGlycemia?: number | null;
  @IsNumber() @IsOptional() painScoreEva?: number | null;
  @IsBoolean() @IsOptional() isPregnant?: boolean | null;
}

class SystemExamFindingDto {
  @IsIn(["cardiovasculaire", "respiratoire", "neurologique", "digestif", "orl", "dermatologique"]) system: string;
  @IsIn(["normal", "anormal", "non_examine"]) status: string;
  @IsString() @IsOptional() notes?: string | null;
}

class PhysicalExamDto {
  @IsString() @IsOptional() generalState?: string | null;
  @IsString() @IsOptional() consciousness?: string | null;
  @IsString() @IsOptional() hydration?: string | null;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SystemExamFindingDto) systemFindings: SystemExamFindingDto[];
}

class DiagnosisPrincipalDto {
  @IsString() @IsNotEmpty() label: string;
  @IsIn(["confirme", "suspecte"]) certainty: string;
}

class CarePlanDto {
  @IsIn(["retour_domicile", "controle_suivi", "hospitalisation", "orientation_specialiste", "transfert_urgent", "autre"])
  orientation: string;

  @ValidateIf((o) => o.orientation === "retour_domicile" || o.orientation === "controle_suivi")
  @IsString() @IsNotEmpty() medicalRecommendations?: string;
  @ValidateIf((o) => o.orientation === "retour_domicile" || o.orientation === "controle_suivi")
  @IsString() @IsNotEmpty() patientInstructions?: string;

  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() appointmentDate?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() specialty?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() doctor?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() followUpReason?: string;

  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() targetService?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() estimatedStayDuration?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() admissionReason?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsBoolean() bedUrgentlyRequired?: boolean;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsBoolean() familyNotified?: boolean;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() preAdmissionInstructions?: string;

  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() recommendedSpecialty?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() recommendedDoctorOrFacility?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() clinicalReason?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsIn(["routine", "semi_urgent", "urgent"]) urgencyLevel?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsBoolean() generateReferralLetter?: boolean;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsArray() @IsString({ each: true }) attachedDocuments?: string[];

  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() destinationFacility?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() vitalUrgencyLevel?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() medicalReason?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsIn(["ambulance_simple", "ambulance_medicalisee", "samu_smur"]) transportType?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsBoolean() onCallDoctorContacted?: boolean;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() estimatedDepartureTime?: string;

  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() decisionType?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() reevaluationFrequency?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() description?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsBoolean() followUpNeeded?: boolean;
  @ValidateIf((o) => o.orientation === "autre") @IsArray() @IsString({ each: true }) involvedParties?: string[];
}

export class UpdateConsultationDto {
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @IsOptional() specialty?: string;
  @IsUUID() @IsOptional() assignedDoctorId?: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsOptional() symptoms?: string;
  @ValidateNested() @Type(() => VitalSignsDto) @IsOptional() vitals?: VitalSignsDto;
  @IsArray() @IsString({ each: true }) @IsOptional() relevantHistory?: string[];
  @IsString() @IsOptional() presentIllnessHistory?: string;
  @ValidateNested() @Type(() => PhysicalExamDto) @IsOptional() physicalExam?: PhysicalExamDto;
  @ValidateNested() @Type(() => DiagnosisPrincipalDto) @IsOptional() diagnosisPrincipal?: DiagnosisPrincipalDto;
  @IsArray() @IsString({ each: true }) @IsOptional() diagnosisSecondary?: string[];
  @IsString() @IsOptional() diagnosisHypothesis?: string;
  @ValidateNested() @Type(() => CarePlanDto) @IsOptional() carePlan?: CarePlanDto;
  @IsIn(["planifiee", "en_attente", "en_cours", "terminee", "annulee"]) @IsOptional() status?: string;
  @IsString() @IsOptional() examInterpretation?: string | null;
  @IsString() @IsOptional() examDecision?: string | null;
  @IsDateString() @IsOptional() examsReviewedAt?: string;
}
