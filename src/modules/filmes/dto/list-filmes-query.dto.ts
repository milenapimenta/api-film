import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function toNumber(value: unknown): unknown {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
}

export class ListFilmesQueryDto {
  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt({ message: 'A página deve ser um número inteiro maior que zero.' })
  @Min(1, { message: 'A página deve ser um número inteiro maior que zero.' })
  page = 1;

  @Transform(({ value }: { value: unknown }) => toNumber(value))
  @IsInt({ message: 'O limite deve ser um número inteiro entre 1 e 100.' })
  @Min(1, { message: 'O limite deve ser um número inteiro entre 1 e 100.' })
  @Max(100, { message: 'O limite deve ser um número inteiro entre 1 e 100.' })
  limit = 100;
}
