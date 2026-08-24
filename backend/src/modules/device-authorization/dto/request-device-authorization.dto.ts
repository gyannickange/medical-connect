import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class RequestDeviceAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  devicePublicKey: string;

  @IsString()
  @IsOptional()
  provisioningSecret?: string;
}
