import type { Response } from 'express';
import { FilmesController } from './filmes.controller';
import type { FilmesService } from './filmes.service';

describe('FilmesController', () => {
  it('mantém o corpo da listagem como array e expõe a paginação em headers', async () => {
    const findAll = jest.fn().mockResolvedValue({
      items: [
        {
          id: 1,
          titulo: 'O Auto da Compadecida',
          diretor: 'Guel Arraes',
          ano: 2000,
          genero: 'Comédia',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    const service = { findAll } as unknown as FilmesService;
    const controller = new FilmesController(service);
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;

    await expect(controller.findAll({ page: 1, limit: 100 }, response)).resolves.toEqual([
      {
        id: 1,
        titulo: 'O Auto da Compadecida',
        diretor: 'Guel Arraes',
        ano: 2000,
        genero: 'Comédia',
      },
    ]);
    expect(setHeader).toHaveBeenCalledWith('x-total-count', 1);
    expect(setHeader).toHaveBeenCalledWith('x-page', 1);
    expect(setHeader).toHaveBeenCalledWith('x-limit', 100);
  });
});
