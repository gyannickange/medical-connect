import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsEmail, IsBoolean, ValidateNested, ValidateIf } from "class-validator";
import { Type } from "class-transformer";

class EmergencyContactDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() relation: string;
  @IsString() @IsOptional() relationOther?: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsOptional() address?: string;
  @IsBoolean() @IsOptional() isPriority?: boolean;
}

class PediatricInfoDto {
  @IsString() @IsOptional() fatherName?: string;
  @IsString() @IsOptional() motherName?: string;
  @IsString() @IsOptional() legalGuardian?: string;
  @IsString() @IsOptional() guardianPhone?: string;
  @IsString() @IsOptional() guardianRelation?: string;
  @IsString() @IsOptional() guardianRelationOther?: string;
  @IsString() @IsOptional() weightKg?: string;
  @IsString() @IsOptional() heightCm?: string;
  @IsString() @IsOptional() birthInfo?: string;
  @IsString() @IsOptional() vaccinations?: string;
}

export class CreatePatientDto {
  @IsUUID() @IsOptional() id?: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() dateOfBirth: string;
  @IsIn(["M", "F"]) sex: "M" | "F";
  @IsString() @IsNotEmpty() primaryPhone: string;
  @IsString() @IsNotEmpty() residenceAddress: string;
  @IsString() @IsOptional() usualName?: string;
  @IsString() @IsOptional() birthPlace?: string;
  @IsString() @IsOptional() nationality?: string;
  @IsString() @IsOptional() profession?: string;
  @IsString() @IsOptional() maritalStatus?: string;
  @IsIn(["cni", "passeport", "permis", "anip", "autre"]) @IsOptional() idDocumentType?: string;
  @IsString() @IsOptional() idDocumentTypeOther?: string;
  @IsString() @IsOptional() idDocumentNumber?: string;
  @IsString() @IsOptional() idDocumentExpiry?: string;
  @ValidateIf((o) => !!o.email) @IsEmail() email?: string;
  @IsString() @IsOptional() secondaryPhone?: string;
  @IsString() @IsOptional() residenceZone?: string;
  @IsString() @IsOptional() fullAddress?: string;
  @ValidateNested() @Type(() => EmergencyContactDto) @IsOptional() emergencyContact?: EmergencyContactDto;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsIn(["aucune_connue", "allergies_connues", "non_renseigne"]) @IsOptional() allergyKnowledge?: string;
  @IsString() @IsOptional() allergyDetails?: string;
  @IsString() @IsOptional() medicalHistory?: string;
  @IsString() @IsOptional() surgicalHistory?: string;
  @IsString() @IsOptional() chronicDiseases?: string;
  @IsString() @IsOptional() currentTreatments?: string;
  @IsString() @IsOptional() disabilities?: string;
  @IsString() @IsOptional() facilityService?: string;
  @IsString() @IsOptional() referringDoctorId?: string;
  @IsIn(["externe", "hospitalise", "urgence"]) @IsOptional() patientType?: string;
  @IsIn(["assurance", "mutuelle", "tiers_payant", "comptant"]) @IsOptional() paymentMode?: string;
  @IsString() @IsOptional() insuranceName?: string;
  @IsString() @IsOptional() insuranceNumber?: string;
  @IsString() @IsOptional() financiallyResponsible?: string;
  @ValidateNested() @Type(() => PediatricInfoDto) @IsOptional() pediatricInfo?: PediatricInfoDto;
  @IsString() @IsNotEmpty() tenantId: string;
}
