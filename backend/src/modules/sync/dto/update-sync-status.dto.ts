import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
} from "class-validator";

export class UpdateSyncStatusDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(["online", "offline", "syncing", "error"])
  status: "online" | "offline" | "syncing" | "error";

  @IsNumber()
  @IsOptional()
  pendingChanges?: number;
}
