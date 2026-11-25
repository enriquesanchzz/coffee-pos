import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import sharp from "sharp";

// Almacenamiento propio de fotos (productos, logo del ticket y, más
// adelante, mascotas). Antes solo se aceptaban links https:// externos —
// un link de Google Drive "compartido" no es una imagen y se veía roto.
//
// Las fotos viven en una carpeta de la Mac fuera del repo (UPLOAD_DIR, por
// default ~/.coffee-pos-data/uploads) para que un deploy o un `git clean`
// no las toque, y se respaldan junto con la base de datos
// (~/.coffee-pos-scripts/backup-db.sh). Se sirven en /media/<archivo>.
//
// Cada subida se reduce a máx. 1200px y se guarda como WebP (~100-200 KB):
// la Mac tiene poco disco libre y una foto de celular pesa 3-5 MB.

export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 1200;
export const MEDIA_PREFIX = "/media/";
const FILE_PATTERN = /^[0-9a-f-]{36}\.webp$/;

export function uploadDir() {
  return process.env.UPLOAD_DIR || path.join(homedir(), ".coffee-pos-data", "uploads");
}

export function isStoredFileName(name: string) {
  return FILE_PATTERN.test(name);
}

export async function storeImage(input: Buffer): Promise<string> {
  let output: Buffer;
  try {
    output = await sharp(input, { failOn: "error" })
      .rotate() // respeta la orientación EXIF de fotos de celular
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new Error("No se pudo leer la imagen. Usa una foto JPG, PNG o WebP.");
  }
  const name = `${randomUUID()}.webp`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), output);
  return `${MEDIA_PREFIX}${name}`;
}

export async function readStoredImage(name: string): Promise<Buffer | null> {
  if (!isStoredFileName(name)) return null;
  try {
    return await readFile(path.join(uploadDir(), name));
  } catch {
    return null;
  }
}
