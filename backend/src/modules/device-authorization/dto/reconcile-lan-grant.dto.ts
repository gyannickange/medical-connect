import { IsISO8601, IsString, IsNotEmpty } from "class-validator";

export class ReconcileLanGrantDto {
  @IsString()
  @IsNotEmpty()
  grantedDeviceId: string;

  @IsString()
  @IsNotEmpty()
  grantedByDeviceId: string;

  @IsString()
  @IsNotEmpty()
  grantedByCertificate: string;

  @IsString()
  @IsNotEmpty()
  approvalCapability: string;

  @IsString()
  @IsNotEmpty()
  tenantFingerprint: string;

  @IsISO8601()
  decidedAt: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
