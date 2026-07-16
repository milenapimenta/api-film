const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');

let servidor;
let urlBase;

before(async () => {
  servidor = app.listen(0);
  await new Promise((resolve) => servidor.once('listening', resolve));
  urlBase = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
});

test('cadastra, consulta, atualiza e exclui um filme', async () => {
  const respostaCadastro = await fetch(`${urlBase}/filmes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      titulo: 'Cidade de Deus',
      diretor: 'Fernando Meirelles',
      ano: 2002,
      genero: 'Drama',
    }),
  });

  assert.equal(respostaCadastro.status, 201);
  const filmeCriado = await respostaCadastro.json();
  assert.equal(filmeCriado.id, 1);

  const respostaConsulta = await fetch(`${urlBase}/filmes/1`);
  assert.equal(respostaConsulta.status, 200);

  const respostaAtualizacao = await fetch(`${urlBase}/filmes/1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      titulo: 'Cidade de Deus',
      diretor: 'Fernando Meirelles e Kátia Lund',
      ano: 2002,
      genero: 'Drama',
    }),
  });
  assert.equal(respostaAtualizacao.status, 200);

  const respostaExclusao = await fetch(`${urlBase}/filmes/1`, {
    method: 'DELETE',
  });
  assert.equal(respostaExclusao.status, 204);
});

test('rejeita cadastro com dados inválidos', async () => {
  const resposta = await fetch(`${urlBase}/filmes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ titulo: '', diretor: '', ano: 1500 }),
  });

  assert.equal(resposta.status, 400);
  const corpo = await resposta.json();
  assert.equal(corpo.erros.length, 4);
});
