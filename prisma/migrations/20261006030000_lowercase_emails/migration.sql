-- Emails en minúsculas (QA-010): el login ya compara sin distinguir
-- mayúsculas; esto solo normaliza lo guardado. No toca un registro si al
-- pasarlo a minúsculas chocaría con otro (columnas @unique).
UPDATE "employees" e SET "email" = lower(trim(e."email"))
WHERE e."email" IS NOT NULL
  AND e."email" <> lower(trim(e."email"))
  AND NOT EXISTS (SELECT 1 FROM "employees" o WHERE o."email" = lower(trim(e."email")) AND o."id" <> e."id");

UPDATE "customers" c SET "email" = lower(trim(c."email"))
WHERE c."email" IS NOT NULL
  AND c."email" <> lower(trim(c."email"))
  AND NOT EXISTS (SELECT 1 FROM "customers" o WHERE o."email" = lower(trim(c."email")) AND o."id" <> c."id");

UPDATE "suppliers" s SET "email" = lower(trim(s."email"))
WHERE s."email" IS NOT NULL AND s."email" <> lower(trim(s."email"));
