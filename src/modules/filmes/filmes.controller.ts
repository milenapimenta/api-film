import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ParseFilmeIdPipe } from '../../common/pipes/parse-filme-id.pipe';
import { CreateFilmeDto } from './dto/create-filme.dto';
import { ListFilmesQueryDto } from './dto/list-filmes-query.dto';
import { UpdateFilmeDto } from './dto/update-filme.dto';
import type { FilmeEntity } from './entities/filme.entity';
import { FilmesService } from './filmes.service';

@Controller('filmes')
export class FilmesController {
  constructor(private readonly filmesService: FilmesService) {}

  @Get()
  async findAll(
    @Query() query: ListFilmesQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FilmeEntity[]> {
    const result = await this.filmesService.findAll(query);
    response.setHeader('x-total-count', result.total);
    response.setHeader('x-page', result.page);
    response.setHeader('x-limit', result.limit);
    return result.items;
  }

  @Get(':id')
  findOne(@Param('id', ParseFilmeIdPipe) id: number): Promise<FilmeEntity> {
    return this.filmesService.findOne(id);
  }

  @Post()
  create(@Body() input: CreateFilmeDto): Promise<FilmeEntity> {
    return this.filmesService.create(input);
  }

  @Put(':id')
  update(
    @Param('id', ParseFilmeIdPipe) id: number,
    @Body() input: UpdateFilmeDto,
  ): Promise<FilmeEntity> {
    return this.filmesService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseFilmeIdPipe) id: number): Promise<void> {
    return this.filmesService.remove(id);
  }
}
