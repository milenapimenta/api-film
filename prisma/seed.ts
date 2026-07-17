import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed(): Promise<void> {
  const filmeExistente = await prisma.filme.findFirst({
    where: { titulo: 'Cidade de Deus', ano: 2002 },
    select: { id: true },
  });

  if (!filmeExistente) {
    await prisma.filme.create({
      data: {
        titulo: 'Cidade de Deus',
        diretor: 'Fernando Meirelles e Kátia Lund',
        ano: 2002,
        genero: 'Drama',
      },
    });
  }
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error('Falha ao executar o seed.', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
