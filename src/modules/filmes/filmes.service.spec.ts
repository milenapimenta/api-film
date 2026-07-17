import { NotFoundException } from '@nestjs/common';
import type { Filme } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { FilmesService } from './filmes.service';

const filme: Filme = {
  id: 7,
  titulo: 'Central do Brasil',
  diretor: 'Walter Salles',
  ano: 1998,
  genero: 'Drama',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('FilmesService', () => {
  const findUnique = jest.fn<Promise<Filme | null>, []>();
  const create = jest.fn<Promise<Filme>, []>();
  const update = jest.fn<Promise<Filme>, []>();
  const remove = jest.fn<Promise<{ id: number }>, []>();
  const count = jest.fn<Promise<number>, []>();
  const findMany = jest.fn<Promise<Filme[]>, []>();
  const transaction = jest.fn<Promise<[number, Filme[]]>, [unknown[]]>();
  const prisma = {
    filme: { findUnique, create, update, delete: remove, count, findMany },
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new FilmesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('remove os campos internos ao retornar um filme', async () => {
    create.mockResolvedValue(filme);

    await expect(
      service.create({
        titulo: filme.titulo,
        diretor: filme.diretor,
        ano: filme.ano,
        genero: filme.genero,
      }),
    ).resolves.toEqual({
      id: 7,
      titulo: 'Central do Brasil',
      diretor: 'Walter Salles',
      ano: 1998,
      genero: 'Drama',
    });
  });

  it('retorna 404 quando o filme não existe', async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toEqual(
      new NotFoundException({ erro: 'Filme não encontrado.' }),
    );
  });

  it('pagina com ordenação determinística e informa o total', async () => {
    transaction.mockResolvedValue([1, [filme]]);

    await expect(service.findAll({ page: 2, limit: 10 })).resolves.toEqual({
      items: [
        {
          id: 7,
          titulo: 'Central do Brasil',
          diretor: 'Walter Salles',
          ano: 1998,
          genero: 'Drama',
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
  });
});
