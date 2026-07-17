import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { IsNonBlankString } from '../../../common/decorators/is-non-blank-string.decorator';

export class CreateFilmeDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNonBlankString('O título é obrigatório.')
  titulo!: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNonBlankString('O diretor é obrigatório.')
  diretor!: string;

  @IsInt({ message: 'O ano deve ser um número inteiro entre 1888 e 2100.' })
  @Min(1888, { message: 'O ano deve ser um número inteiro entre 1888 e 2100.' })
  @Max(2100, { message: 'O ano deve ser um número inteiro entre 1888 e 2100.' })
  ano!: number;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNonBlankString('O gênero é obrigatório.')
  genero!: string;
}
