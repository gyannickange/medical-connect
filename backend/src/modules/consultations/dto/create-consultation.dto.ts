import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsDateString } from "class-validator";

export class CreateConsultationDto {
  @IsUUID() @IsOptional() id?: string;
  @IsUUID() @IsNotEmpty() patientId: string;
  @IsDateString() scheduledAt: string;
  @IsString() @IsNotEmpty() specialty: string;
  @IsUUID() @IsNotEmpty() assignedDoctorId: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsNotEmpty() reason: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsNotEmpty() tenantId: string;
}
