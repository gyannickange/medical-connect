import { Transform, Type } from "class-transformer";
import { IsDate, IsNumber, IsOptional, IsString, Min } from "class-validator";

const optionalDate = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined
    ? undefined
    : new Date(value as string | number | Date);

export class CreateSellingPriceDto {
  @IsOptional()
  @IsString()
  id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsString()
  variantId?: string | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  effectiveAt?: Date;
}
