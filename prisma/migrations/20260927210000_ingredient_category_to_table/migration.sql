-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_name_key" ON "ingredient_categories"("name");

-- Semilla de las 5 categorías que hoy son valores fijos del enum
-- IngredientCategory — se usa el texto del enum como id determinístico
-- para poder hacer el backfill de abajo con un join trivial, sin tabla de
-- mapeo aparte.
INSERT INTO "ingredient_categories" ("id", "name") VALUES
  ('CAFE', 'Café'),
  ('JARABES', 'Jarabes'),
  ('LECHE', 'Leche'),
  ('TOPPINGS', 'Toppings'),
  ('INSUMOS', 'Insumos');

-- AlterTable: agregar categoryId nullable, rellenar desde el enum
-- existente, y solo entonces exigir NOT NULL — así no se pierde el dato de
-- los 27 insumos ya sembrados.
ALTER TABLE "ingredients" ADD COLUMN "categoryId" TEXT;
UPDATE "ingredients" SET "categoryId" = "category"::text;
ALTER TABLE "ingredients" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "ingredients" DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropEnum
DROP TYPE "IngredientCategory";
