import { Transform, Type } from "class-transformer";
import { IsDate, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

const optionalDate = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined
    ? undefined
    : new Date(value as string | number | Date);

export class CreatePurchaseDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  variantId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPurchasePrice: number;

  @IsString()
  purchaseCurrency: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  conversionRate: number;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  purchaseDate?: Date;
}
