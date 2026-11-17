// Servidor de producción de CallX.
//
// Hace lo mismo que "next start" (HTTP en PORT, por defecto 3600) y, si hay un
// certificado configurado, atiende además por HTTPS (HTTPS_PORT, por defecto
// 3643). HTTPS es necesario para que el navegador permita usar la cámara
// desde otros equipos de la red.
//
// Variables (.env):
//   HTTPS_PFX_FILE        ruta al certificado .pfx (ver scripts/crear-certificado.ps1)
//   HTTPS_PFX_PASSPHRASE  clave del .pfx
//   HTTPS_PORT            puerto HTTPS (3643)
//   HTTPS_REDIRECT=true   redirige todo el tráfico HTTP a HTTPS
import { createServer as crearHttp } from 'node:http';
import { createServer as crearHttps } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3600);

const app = next({ dev: false, dir });
const handle = app.getRequestHandler();
await app.prepare(); // aquí Next ya cargó el .env

const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3643);
const pfxFile = process.env.HTTPS_PFX_FILE;
let httpsActivo = false;

if (pfxFile) {
  if (!existsSync(pfxFile)) {
    console.error(`⚠️ HTTPS_PFX_FILE no existe (${pfxFile}); se sigue solo con HTTP.`);
  } else {
    try {
      crearHttps(
        { pfx: readFileSync(pfxFile), passphrase: process.env.HTTPS_PFX_PASSPHRASE || '' },
        (req, res) => handle(req, res)
      ).listen(HTTPS_PORT, () => console.log(`🔒 CallX HTTPS en https://0.0.0.0:${HTTPS_PORT}`));
      httpsActivo = true;
    } catch (e) {
      console.error('⚠️ No se pudo iniciar HTTPS:', e.message);
    }
  }
}

const redirigir = httpsActivo && process.env.HTTPS_REDIRECT === 'true';
crearHttp((req, res) => {
  if (redirigir) {
    const host = (req.headers.host || 'localhost').replace(/:\d+$/, '');
    res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
    res.end();
    return;
  }
  handle(req, res);
}).listen(PORT, () => console.log(`🌐 CallX HTTP en http://0.0.0.0:${PORT}${redirigir ? ' (redirige a HTTPS)' : ''}`));
