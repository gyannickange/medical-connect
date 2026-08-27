import { IsString, IsOptional, IsIn, IsUUID, IsDateString } from "class-validator";

export class UpdateConsultationDto {
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @IsOptional() specialty?: string;
  @IsUUID() @IsOptional() assignedDoctorId?: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsOptional() clinicalObservations?: string;
  @IsString() @IsOptional() diagnosis?: string;
  @IsIn(["planifiee", "en_attente", "en_cours", "terminee", "annulee"]) @IsOptional() status?: string;
}
