const express = require('express');

const app = express();

app.use(express.json());

let proximoId = 1;
const filmes = [];

function validarFilme({ titulo, diretor, ano, genero }) {
  const erros = [];

  if (typeof titulo !== 'string' || !titulo.trim()) {
    erros.push('O título é obrigatório.');
  }

  if (typeof diretor !== 'string' || !diretor.trim()) {
    erros.push('O diretor é obrigatório.');
  }

  if (!Number.isInteger(ano) || ano < 1888 || ano > 2100) {
    erros.push('O ano deve ser um número inteiro entre 1888 e 2100.');
  }

  if (typeof genero !== 'string' || !genero.trim()) {
    erros.push('O gênero é obrigatório.');
  }

  return erros;
}

app.get('/', (_req, res) => {
  res.json({ mensagem: 'API de filmes funcionando!' });
});

app.get('/filmes', (_req, res) => {
  res.json(filmes);
});

app.get('/filmes/:id', (req, res) => {
  const filme = filmes.find((item) => item.id === Number(req.params.id));

  if (!filme) {
    return res.status(404).json({ erro: 'Filme não encontrado.' });
  }

  return res.json(filme);
});

app.post('/filmes', (req, res) => {
  const erros = validarFilme(req.body);

  if (erros.length > 0) {
    return res.status(400).json({ erros });
  }

  const filme = {
    id: proximoId++,
    titulo: req.body.titulo.trim(),
    diretor: req.body.diretor.trim(),
    ano: req.body.ano,
    genero: req.body.genero.trim(),
  };

  filmes.push(filme);
  return res.status(201).json(filme);
});

app.put('/filmes/:id', (req, res) => {
  const indice = filmes.findIndex((item) => item.id === Number(req.params.id));

  if (indice === -1) {
    return res.status(404).json({ erro: 'Filme não encontrado.' });
  }

  const erros = validarFilme(req.body);

  if (erros.length > 0) {
    return res.status(400).json({ erros });
  }

  filmes[indice] = {
    id: filmes[indice].id,
    titulo: req.body.titulo.trim(),
    diretor: req.body.diretor.trim(),
    ano: req.body.ano,
    genero: req.body.genero.trim(),
  };

  return res.json(filmes[indice]);
});

app.delete('/filmes/:id', (req, res) => {
  const indice = filmes.findIndex((item) => item.id === Number(req.params.id));

  if (indice === -1) {
    return res.status(404).json({ erro: 'Filme não encontrado.' });
  }

  filmes.splice(indice, 1);
  return res.status(204).send();
});

app.use((_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

module.exports = app;
