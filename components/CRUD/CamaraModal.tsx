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
  // Página abierta por HTTP: el navegador no da acceso a la cámara
  const [inseguro, setInseguro] = useState<{ disponible: boolean; httpsUrl: string } | null>(null);

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setListo(false);
  }, []);

  const iniciar = useCallback(async (deviceId?: string) => {
    detener();
    setError(null);
    if (!camaraDisponible()) {
      try {
        const res = await fetch("/api/certificado", { credentials: "include" });
        const info = await res.json();
        setInseguro({ disponible: !!info.disponible, httpsUrl: info.httpsUrl });
      } catch {
        setInseguro({ disponible: false, httpsUrl: "" });
      }
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

        {inseguro ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-gray-800">
            <p className="font-semibold text-amber-800 mb-2">
              <i className="bi bi-shield-exclamation mr-1"></i>
              Para usar la cámara hay que abrir la versión segura de CallX
            </p>
            {inseguro.disponible ? (
              <>
                <p className="mb-3 text-gray-700">
                  El navegador solo permite la cámara en conexiones seguras (HTTPS).
                  Esto se hace <strong>una sola vez</strong> en este equipo:
                </p>
                <ol className="list-decimal ml-5 space-y-2 mb-4">
                  <li>
                    Descarga el instalador y ábrelo (si el navegador pregunta, elige <em>Conservar</em>).
                    Cuando Windows pregunte si quieres instalar el certificado, responde <strong>Sí</strong>.
                  </li>
                  <li>Cierra el navegador por completo y vuelve a abrirlo.</li>
                  <li>Entra por la dirección segura (el instalador la abre solo al terminar).</li>
                </ol>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href="/api/certificado?formato=bat"
                    download
                    className="flex-1 text-center bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md font-medium"
                  >
                    <i className="bi bi-download mr-2"></i>Descargar instalador
                  </a>
                  <a
                    href={`${inseguro.httpsUrl}${typeof window !== "undefined" ? window.location.pathname : ""}`}
                    className="flex-1 text-center border border-emerald-600 text-emerald-700 hover:bg-emerald-50 py-2 rounded-md font-medium"
                  >
                    <i className="bi bi-lock-fill mr-2"></i>Ya lo instalé: abrir versión segura
                  </a>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Mientras tanto puedes usar <strong>Subir imagen</strong>. En Firefox el certificado se importa aparte
                  (Ajustes → Privacidad → Certificados).
                </p>
              </>
            ) : (
              <p className="text-gray-700">
                La versión segura (HTTPS) no está activada en el servidor. Pide a TI que la configure
                o usa <strong>Subir imagen</strong>.
              </p>
            )}
          </div>
        ) : (
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
        )}

        {!inseguro && (
          <p className="text-xs text-gray-500 mt-2">
            {guia === "cedula"
              ? "Encuadra el REVERSO de la cédula dentro del recuadro, con buena luz y sin reflejos."
              : "Rostro de frente dentro del óvalo, bien iluminado y sin lentes oscuros."}
          </p>
        )}

        <div className="flex gap-2 mt-3">
          {!inseguro && (
            <button
              type="button"
              onClick={capturar}
              disabled={!listo}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md font-medium disabled:opacity-50"
            >
              <i className="bi bi-camera-fill mr-2"></i>Tomar foto
            </button>
          )}
          <button type="button" onClick={cerrar} className={`px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 ${inseguro ? "ml-auto" : ""}`}>
            {inseguro ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
