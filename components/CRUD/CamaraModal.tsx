"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Visor de cámara reutilizable (foto del rostro y foto de la cédula).
// Permite elegir entre varias cámaras (integrada, USB, trasera del celular).
//
// Los navegadores solo dan acceso a la cámara en HTTPS o en localhost.

interface CamaraModalProps {
  abierto: boolean;
  titulo: string;
  guia: "rostro" | "cedula";
  onCaptura: (canvas: HTMLCanvasElement) => void;
  onCerrar: () => void;
}

export const camaraDisponible = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

export default function CamaraModal({ abierto, titulo, guia, onCaptura, onCerrar }: CamaraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camaras, setCamaras] = useState<MediaDeviceInfo[]>([]);
  const [camaraId, setCamaraId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setListo(false);
  }, []);

  const iniciar = useCallback(async (deviceId?: string) => {
    detener();
    setError(null);
    if (!camaraDisponible()) {
      setError("La cámara solo funciona si la app se abre por HTTPS (o en este mismo equipo con localhost).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : {
              facingMode: guia === "cedula" ? "environment" : "user",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setListo(true);
      // Los nombres de las cámaras solo están disponibles después de dar permiso
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      const videos = dispositivos.filter(d => d.kind === "videoinput");
      setCamaras(videos);
      const actual = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (actual) setCamaraId(actual);
    } catch (e) {
      const nombre = e instanceof DOMException ? e.name : "";
      setError(
        nombre === "NotAllowedError"
          ? "Se negó el permiso de cámara. Habilítalo en el candado de la barra de direcciones."
          : nombre === "NotFoundError"
            ? "No se encontró ninguna cámara conectada."
            : nombre === "NotReadableError"
              ? "La cámara está siendo usada por otro programa."
              : "No se pudo abrir la cámara."
      );
    }
  }, [detener, guia]);

  // Sincroniza con un sistema externo (la cámara): abrirla al mostrar el visor
  // y liberarla al cerrarlo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (abierto) iniciar();
    return detener;
  }, [abierto, iniciar, detener]);

  if (!abierto) return null;

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    detener();
    onCaptura(canvas);
  };

  const cerrar = () => {
    detener();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={cerrar}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">{titulo}</h3>
          <button type="button" onClick={cerrar} className="text-gray-500 hover:text-black" aria-label="Cerrar cámara">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {camaras.length > 1 && (
          <select
            value={camaraId}
            onChange={e => { setCamaraId(e.target.value); iniciar(e.target.value); }}
            className="mb-3 w-full border border-gray-300 rounded-md p-2 text-sm text-black"
          >
            {camaras.map((c, i) => (
              <option key={c.deviceId} value={c.deviceId}>{c.label || `Cámara ${i + 1}`}</option>
            ))}
          </select>
        )}

        <div className="relative bg-black rounded-md overflow-hidden aspect-video flex items-center justify-center">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
          {listo && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {guia === "cedula" ? (
                <div className="w-[80%] aspect-[1.586] border-2 border-dashed border-white/80 rounded-lg" />
              ) : (
                <div className="h-[75%] aspect-[3/4] border-2 border-dashed border-white/80 rounded-[50%]" />
              )}
            </div>
          )}
          {error && <p className="absolute text-white text-sm text-center px-6">{error}</p>}
        </div>

        <p className="text-xs text-gray-500 mt-2">
          {guia === "cedula"
            ? "Encuadra el REVERSO de la cédula dentro del recuadro, con buena luz y sin reflejos."
            : "Rostro de frente dentro del óvalo, bien iluminado y sin lentes oscuros."}
        </p>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={capturar}
            disabled={!listo}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
          >
            <i className="bi bi-camera-fill mr-2"></i>Tomar foto
          </button>
          <button type="button" onClick={cerrar} className="px-4 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
