import { IsString, IsOptional, IsIn, IsUUID, IsDateString, IsNumber, IsBoolean, IsArray, IsNotEmpty, ValidateNested } from "class-validator";
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
  @IsIn(["planifiee", "en_attente", "en_cours", "terminee", "annulee"]) @IsOptional() status?: string;
}
