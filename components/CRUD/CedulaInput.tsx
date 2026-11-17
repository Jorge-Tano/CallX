"use client";

import { useRef, useState } from "react";
import type { DatosCedula } from "@/lib/cedula/parse";
import CamaraModal from "./CamaraModal";

// Botón "Cargar desde cédula": lee una foto o PDF de la cédula en el navegador
// y entrega los datos al formulario. La imagen no se guarda ni se envía.

interface CedulaInputProps {
  onDatos: (datos: DatosCedula) => void;
  disabled?: boolean;
}

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "leyendo"; mensaje: string }
  | { tipo: "ok"; datos: DatosCedula }
  | { tipo: "error"; mensaje: string };

export default function CedulaInput({ onDatos, disabled }: CedulaInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const [camaraAbierta, setCamaraAbierta] = useState(false);

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (archivo) await procesar(archivo);
  };

  const handleCaptura = (canvas: HTMLCanvasElement) => {
    setCamaraAbierta(false);
    canvas.toBlob(blob => {
      if (blob) procesar(new File([blob], "cedula.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.95);
  };

  const procesar = async (archivo: File) => {
    setEstado({ tipo: "leyendo", mensaje: "Preparando..." });
    try {
      // Carga diferida: las librerías solo se descargan al usar el botón
      const { leerCedula } = await import("@/lib/cedula/leer");
      const resultado = await leerCedula(archivo, mensaje =>
        setEstado({ tipo: "leyendo", mensaje })
      );
      if (resultado.ok) {
        onDatos(resultado.datos);
        setEstado({ tipo: "ok", datos: resultado.datos });
      } else {
        setEstado({ tipo: "error", mensaje: resultado.motivo });
      }
    } catch (err) {
      console.error("Error leyendo cédula:", err);
      setEstado({
        tipo: "error",
        mensaje: "No se pudo leer la cédula. Revisa la conexión a internet e inténtalo de nuevo.",
      });
    }
  };

  const leyendo = estado.tipo === "leyendo";

  return (
    <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/50 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || leyendo}
        className="shrink-0 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
      >
        {leyendo ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></span>
            Leyendo...
          </span>
        ) : (
          <>
            <i className="bi bi-person-vcard mr-2"></i>Cargar desde cédula
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => setCamaraAbierta(true)}
        disabled={disabled || leyendo}
        title="Tomar foto de la cédula con la cámara"
        className="shrink-0 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-md text-sm disabled:opacity-50"
      >
        <i className="bi bi-camera-fill mr-1"></i>Cámara
      </button>
      <CamaraModal
        abierto={camaraAbierta}
        titulo="Foto de la cédula (reverso)"
        guia="cedula"
        onCaptura={handleCaptura}
        onCerrar={() => setCamaraAbierta(false)}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleArchivo}
        className="hidden"
      />

      <div className="text-xs">
        {estado.tipo === "inactivo" && (
          <p className="text-gray-600">
            Foto o PDF del <strong>reverso</strong> de la cédula (código de barras o líneas con &lt;&lt;&lt;).
            Completa número, nombre y género. La imagen no se guarda.
          </p>
        )}
        {estado.tipo === "leyendo" && <p className="text-gray-600">{estado.mensaje}</p>}
        {estado.tipo === "ok" && (
          <p className={estado.datos.revisar.length ? "text-amber-700" : "text-emerald-700"}>
            <i className={`bi ${estado.datos.revisar.length ? "bi-exclamation-triangle" : "bi-check-circle"} mr-1`}></i>
            {estado.datos.revisar.length
              ? "Datos cargados. Revisa los campos marcados en amarillo antes de crear."
              : "Datos cargados desde el código de barras."}
          </p>
        )}
        {estado.tipo === "error" && <p className="text-red-600">{estado.mensaje}</p>}
      </div>
    </div>
  );
}
