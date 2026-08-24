import {
  IsString,
  IsOptional,
  IsEmail,
} from "class-validator";
import { Transform } from "class-transformer";

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @Transform(({ value }) => (value === "" || value == null ? undefined : value))
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
