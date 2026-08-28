import { IsIn, IsString, IsOptional } from "class-validator";

export class RecordLabOrderFollowUpDto {
  @IsIn(["aucune_action", "contacter_patient", "modifier_traitement", "programmer_rdv", "nouvel_examen"])
  followUpAction: string;

  @IsString() @IsOptional() followUpNote?: string;
}
