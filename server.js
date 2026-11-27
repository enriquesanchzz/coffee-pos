// Servidor de producción (pm2 → npm start). Es `next start` con un solo
// cambio: X-Forwarded-For / X-Real-IP se reemplazan por la IP real de la
// conexión. La app se sirve directo en la red del café (sin proxy), así
// que esos headers los escribe el cliente — con ellos cualquiera podía
// cambiar de "IP" en cada intento y saltarse el límite de intentos de PIN
// (lib/rate-limit.ts). Si algún día se pone un proxy (Caddy/nginx) enfrente,
// TRUST_PROXY=1 respeta el header que ese proxy ponga.
const { createServer } = require("node:http");
const next = require("next");

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const trustProxy = process.env.TRUST_PROXY === "1";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    if (!trustProxy) {
      req.headers["x-forwarded-for"] = req.socket.remoteAddress || "unknown";
      delete req.headers["x-real-ip"];
    }
    handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`> Listo en http://${hostname}:${port}`);
  });
});
