# Pruebas e2e

Suite de regresión con Playwright + axe-core. Corre contra un **build de
producción** y una base PostgreSQL de prueba (`nomada_pos_test` por
defecto), separada de la de desarrollo. Antes de cada corrida se le aplican
las migraciones y los seeds (ambos no destructivos); las pruebas usan
nombres únicos y comparan diferencias, así que la base no necesita estar
vacía.

```bash
npm run build
npm run test:e2e
```

Variables opcionales:

| Variable | Default | Para qué |
|---|---|---|
| `E2E_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/nomada_pos_test` | Base de prueba (nunca apuntarla a desarrollo/producción) |
| `E2E_PORT` | `3100` | Puerto del servidor de prueba |
| `PW_CHROMIUM_PATH` | — | Chromium ya instalado (si no se usa `npx playwright install`) |
