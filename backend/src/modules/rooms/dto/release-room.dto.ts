import { IsNotEmpty, IsString } from "class-validator";

export class ReleaseRoomDto {
  @IsString()
  @IsNotEmpty()
  consultationId: string;
}
