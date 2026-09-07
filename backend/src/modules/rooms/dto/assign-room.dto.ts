import { IsNotEmpty, IsString } from "class-validator";

export class AssignRoomDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsNotEmpty()
  consultationId: string;
}
