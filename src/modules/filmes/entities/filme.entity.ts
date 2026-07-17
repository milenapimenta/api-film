import type { Filme as PrismaFilme } from '@prisma/client';

type PublicFilme = Pick<PrismaFilme, 'id' | 'titulo' | 'diretor' | 'ano' | 'genero'>;

export class FilmeEntity {
  id!: number;
  titulo!: string;
  diretor!: string;
  ano!: number;
  genero!: string;

  static fromPrisma(filme: PublicFilme): FilmeEntity {
    return {
      id: filme.id,
      titulo: filme.titulo,
      diretor: filme.diretor,
      ano: filme.ano,
      genero: filme.genero,
    };
  }
}
