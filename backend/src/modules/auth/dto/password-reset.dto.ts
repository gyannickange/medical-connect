import { IsString, IsNotEmpty, MinLength } from "class-validator";

export class RequestPasswordResetDto {
  @IsString()
  @IsNotEmpty()
  username: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  oldPassword: string;
}
