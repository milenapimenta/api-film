import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseFilmeIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new NotFoundException({ erro: 'Filme não encontrado.' });
    }

    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new NotFoundException({ erro: 'Filme não encontrado.' });
    }

    return id;
  }
}
