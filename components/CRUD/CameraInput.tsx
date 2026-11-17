"use client";

import { useRef, useState } from "react";
import CamaraModal from "./CamaraModal";

// Captura o carga una foto de rostro y la entrega como data URL JPEG
// ("data:image/jpeg;base64,...") ya reducida para los terminales Hikvision,
// que rechazan imágenes grandes (límite típico ~200 KB).

const MAX_LADO = 640;           // px, lado mayor
const MAX_BYTES = 190 * 1024;   // margen bajo el límite del dispositivo

interface CameraInputProps {
  value: string | null;
  onPhoto: (dataUrl: string | null) => void;
  disabled?: boolean;
}

function bytesDeDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

// Dibuja la fuente en un canvas reducido y baja la calidad JPEG hasta
// quedar bajo MAX_BYTES.
function aJpegReducido(fuente: CanvasImageSource, ancho: number, alto: number): string {
  const escala = Math.min(1, MAX_LADO / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);

  let calidad = 0.9;
  let dataUrl = canvas.toDataURL("image/jpeg", calidad);
  while (bytesDeDataUrl(dataUrl) > MAX_BYTES && calidad > 0.3) {
    calidad -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", calidad);
  }
  return dataUrl;
}

export default function CameraInput({ value, onPhoto, disabled }: CameraInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCaptura = (canvas: HTMLCanvasElement) => {
    setCamaraAbierta(false);
    try {
      onPhoto(aJpegReducido(canvas, canvas.width, canvas.height));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al capturar la foto");
    }
  };

  const handleArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        onPhoto(aJpegReducido(img, img.naturalWidth, img.naturalHeight));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al procesar la imagen");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      setError("No se pudo leer la imagen");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start">
      {/* Vista previa */}
      <div className="w-[150px] h-[200px] rounded-lg border border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Foto del usuario" className="w-full h-full object-cover" />
        ) : (
          <i className="bi bi-person-bounding-box text-5xl text-gray-300"></i>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => { setError(null); setCamaraAbierta(true); }} disabled={disabled}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50">
          <i className="bi bi-camera-fill mr-2"></i>{value ? "Volver a tomar" : "Usar cámara"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50">
          <i className="bi bi-upload mr-2"></i>Subir imagen
        </button>
        {value && (
          <button type="button" onClick={() => onPhoto(null)} disabled={disabled}
            className="text-red-600 text-sm hover:underline text-left disabled:opacity-50">
            Quitar foto
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleArchivo} className="hidden" />
        <p className="text-xs text-gray-500 max-w-xs">
          Opcional. Rostro de frente, bien iluminado y sin lentes oscuros. Si un equipo rechaza
          la foto, el usuario no se crea en ninguno.
        </p>
        {error && <p className="text-xs text-red-600 max-w-xs">{error}</p>}
      </div>

      <CamaraModal
        abierto={camaraAbierta}
        titulo="Foto del rostro"
        guia="rostro"
        onCaptura={handleCaptura}
        onCerrar={() => setCamaraAbierta(false)}
      />
    </div>
  );
}
