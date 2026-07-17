import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const filmesMockados = [
  {
    titulo: 'Cidade de Deus',
    diretor: 'Fernando Meirelles e Kátia Lund',
    ano: 2002,
    genero: 'Drama',
  },
  {
    titulo: 'Central do Brasil',
    diretor: 'Walter Salles',
    ano: 1998,
    genero: 'Drama',
  },
  {
    titulo: 'O Auto da Compadecida',
    diretor: 'Guel Arraes',
    ano: 2000,
    genero: 'Comédia',
  },
  {
    titulo: 'Bacurau',
    diretor: 'Kleber Mendonça Filho e Juliano Dornelles',
    ano: 2019,
    genero: 'Drama e ficção científica',
  },
  {
    titulo: 'Tropa de Elite',
    diretor: 'José Padilha',
    ano: 2007,
    genero: 'Ação e drama',
  },
  {
    titulo: 'Aquarius',
    diretor: 'Kleber Mendonça Filho',
    ano: 2016,
    genero: 'Drama',
  },
  {
    titulo: 'Que Horas Ela Volta?',
    diretor: 'Anna Muylaert',
    ano: 2015,
    genero: 'Drama',
  },
  {
    titulo: 'Carandiru',
    diretor: 'Hector Babenco',
    ano: 2003,
    genero: 'Drama',
  },
  {
    titulo: 'Lisbela e o Prisioneiro',
    diretor: 'Guel Arraes',
    ano: 2003,
    genero: 'Comédia romântica',
  },
  {
    titulo: 'Minha Mãe é uma Peça',
    diretor: 'André Pellenz',
    ano: 2013,
    genero: 'Comédia',
  },
  {
    titulo: 'Estômago',
    diretor: 'Marcos Jorge',
    ano: 2007,
    genero: 'Comédia dramática',
  },
  {
    titulo: 'O Homem que Copiava',
    diretor: 'Jorge Furtado',
    ano: 2003,
    genero: 'Comédia dramática',
  },
] satisfies Prisma.FilmeCreateManyInput[];

function chaveDoFilme(filme: Pick<Prisma.FilmeCreateManyInput, 'titulo' | 'ano'>): string {
  return `${filme.titulo}:${filme.ano}`;
}

async function seed(): Promise<void> {
  const filmesExistentes = await prisma.filme.findMany({
    where: {
      OR: filmesMockados.map(({ titulo, ano }) => ({ titulo, ano })),
    },
    select: { titulo: true, ano: true },
  });
  const chavesExistentes = new Set(filmesExistentes.map(chaveDoFilme));
  const filmesNovos = filmesMockados.filter((filme) => !chavesExistentes.has(chaveDoFilme(filme)));

  if (filmesNovos.length === 0) {
    console.log('Seed concluído: os 12 filmes mockados já existem.');
    return;
  }

  const resultado = await prisma.filme.createMany({ data: filmesNovos });
  console.log(`Seed concluído: ${resultado.count} filme(s) mockado(s) criado(s).`);
}

async function main(): Promise<void> {
  try {
    await seed();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`Falha ao executar o seed: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
