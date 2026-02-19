"use client";

import { useState, useRef } from "react";

export default function CameraInput({ onPhoto }: { onPhoto: (url: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const abrirCamara = async () => {
    setIsCameraOpen(true);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) videoRef.current.srcObject = stream;
  };

  const tomarFoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    onPhoto(dataUrl);

    // Detener cámara
    const stream = videoRef.current.srcObject as MediaStream;
    stream.getTracks().forEach((track) => track.stop());

    setIsCameraOpen(false);
  };

  const handleFile = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onPhoto(url);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Botón abrir cámara */}
      <button
        type="button"
        onClick={abrirCamara}
        className="w-10 h-10 flex items-center justify-center
             bg-green-600 hover:bg-green-700 
             text-white rounded-full shadow-md"
            >
            <i className="bi bi-camera-fill text-xl"></i>
        </button>



      {/* Vista Cámara */}
      {isCameraOpen && (
        <div className="flex flex-col gap-2 mt-2">
          <video ref={videoRef} autoPlay className="w-48 rounded-md border" />

          <button
            type="button"
            onClick={tomarFoto}
            className="bg-green-500 text-white px-3 py-2 rounded-md"
          >
            Tomar foto
          </button>
        </div>
      )}
    </div>
  );
}
