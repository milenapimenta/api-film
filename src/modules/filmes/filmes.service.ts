import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateFilmeDto } from './dto/create-filme.dto';
import type { ListFilmesQueryDto } from './dto/list-filmes-query.dto';
import type { UpdateFilmeDto } from './dto/update-filme.dto';
import { FilmeEntity } from './entities/filme.entity';

const filmeSelect = {
  id: true,
  titulo: true,
  diretor: true,
  ano: true,
  genero: true,
} satisfies Prisma.FilmeSelect;

export interface FilmesPage {
  items: FilmeEntity[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class FilmesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListFilmesQueryDto): Promise<FilmesPage> {
    const [total, filmes] = await this.prisma.$transaction([
      this.prisma.filme.count(),
      this.prisma.filme.findMany({
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: filmeSelect,
      }),
    ]);

    return {
      items: filmes.map((filme) => FilmeEntity.fromPrisma(filme)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: number): Promise<FilmeEntity> {
    const filme = await this.prisma.filme.findUnique({ where: { id }, select: filmeSelect });

    if (!filme) {
      throw new NotFoundException({ erro: 'Filme não encontrado.' });
    }

    return FilmeEntity.fromPrisma(filme);
  }

  async create(input: CreateFilmeDto): Promise<FilmeEntity> {
    const filme = await this.prisma.filme.create({ data: input, select: filmeSelect });
    return FilmeEntity.fromPrisma(filme);
  }

  async update(id: number, input: UpdateFilmeDto): Promise<FilmeEntity> {
    const filme = await this.prisma.filme.update({
      where: { id },
      data: input,
      select: filmeSelect,
    });
    return FilmeEntity.fromPrisma(filme);
  }

  async remove(id: number): Promise<void> {
    await this.prisma.filme.delete({ where: { id }, select: { id: true } });
  }
}
