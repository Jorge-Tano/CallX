// Lectura de la cédula en el navegador: imagen (JPG/PNG/...) o PDF.
//
// Todo se procesa localmente; la imagen no se envía a ningún servidor.
// Las librerías se cargan solo cuando alguien usa la función, y sus archivos
// auxiliares (wasm del lector, worker de PDF, datos del OCR) se descargan de
// jsDelivr con la versión fijada en package.json.

import { parseMrz, parsePdf417, type DatosCedula } from "./parse";

export type ResultadoLectura =
  | { ok: true; datos: DatosCedula }
  | { ok: false; motivo: string };

// Ancho al que se normaliza cada imagen: el código del reverso necesita
// ~350 px y el OCR de la zona MRZ funciona mejor con letras grandes.
const ANCHO_OBJETIVO = 2000;

function aCanvas(fuente: CanvasImageSource, ancho: number, alto: number): HTMLCanvasElement {
  const escala = ANCHO_OBJETIVO / ancho;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function paginasPdf(archivo: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const tarea = pdfjs.getDocument({ data: await archivo.arrayBuffer() });
  const pdf = await tarea.promise;
  const canvases: HTMLCanvasElement[] = [];
  // Una cédula escaneada ocupa 1 o 2 páginas; no vale la pena leer más.
  for (let n = 1; n <= Math.min(pdf.numPages, 4); n++) {
    const pagina = await pdf.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: ANCHO_OBJETIVO / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await pagina.render({ canvas, viewport }).promise;
    canvases.push(canvas);
  }
  await tarea.destroy();
  return canvases;
}

async function imagenes(archivo: File): Promise<HTMLCanvasElement[]> {
  if (archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name)) {
    return paginasPdf(archivo);
  }
  const bitmap = await createImageBitmap(archivo);
  try {
    return [aCanvas(bitmap, bitmap.width, bitmap.height)];
  } finally {
    bitmap.close();
  }
}

async function leerCodigo(canvas: HTMLCanvasElement): Promise<DatosCedula | null> {
  const { readBarcodes } = await import("zxing-wasm/reader");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const imagen = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const resultados = await readBarcodes(imagen, {
    formats: ["PDF417"],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });
  for (const r of resultados) {
    const datos = parsePdf417(r.bytes);
    if (datos) return datos;
  }
  return null;
}

export async function leerCedula(
  archivo: File,
  onEstado?: (mensaje: string) => void
): Promise<ResultadoLectura> {
  if (archivo.size > 15 * 1024 * 1024) {
    return { ok: false, motivo: "El archivo es demasiado grande (máximo 15 MB)." };
  }

  onEstado?.("Preparando imagen...");
  let canvases: HTMLCanvasElement[];
  try {
    canvases = await imagenes(archivo);
  } catch {
    return { ok: false, motivo: "No se pudo abrir el archivo. Usa una foto (JPG/PNG) o un PDF." };
  }

  // 1. Código de barras del reverso (cédula amarilla): exacto y rápido
  onEstado?.("Buscando código de barras...");
  for (const canvas of canvases) {
    try {
      const datos = await leerCodigo(canvas);
      if (datos) return { ok: true, datos };
    } catch {
      // seguimos con el OCR
    }
  }

  // 2. Zona MRZ del reverso (cédula digital), por OCR
  onEstado?.("Leyendo texto de la cédula (puede tardar unos segundos)...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
    });
    for (const canvas of canvases) {
      const { data } = await worker.recognize(canvas);
      const datos = parseMrz(data.text);
      if (datos) return { ok: true, datos };
    }
  } finally {
    await worker.terminate();
  }

  return {
    ok: false,
    motivo:
      "No se encontraron los datos. Sube el REVERSO de la cédula (código de barras o las 3 líneas con <<<), " +
      "con buena luz y sin recortar.",
  };
}
