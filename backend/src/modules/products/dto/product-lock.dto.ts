import { IsNotEmpty, IsString } from "class-validator";

export class AcquireProductLockDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  deviceName!: string;
}

export class ReleaseProductLockDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;
}
