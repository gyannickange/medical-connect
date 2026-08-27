import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn } from "class-validator";

export class AppendQueueEventDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsUUID() @IsNotEmpty() patientId: string;
  @IsIn(["arrived", "registered", "waiting", "called", "in_care", "in_consultation", "completed", "cancelled", "transferred", "priority_changed"])
  eventType: string;
  @IsOptional() payload?: { priority?: string; targetService?: string };
  @IsString() @IsNotEmpty() tenantId: string;
}
