CREATE TABLE "filmes" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "diretor" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "genero" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filmes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "filmes_ano_check" CHECK ("ano" BETWEEN 1888 AND 2100)
);

CREATE INDEX "filmes_titulo_idx" ON "filmes"("titulo");
CREATE INDEX "filmes_ano_idx" ON "filmes"("ano");
