"use client";

import { useState, useEffect } from 'react';

interface UserAvatarProps {
  employeeNo: string;
  nombre: string;
  fotoPath?: string;
  dispositivo?: string;
  className?: string;
}

export default function UserAvatar({ 
  employeeNo, 
  nombre, 
  fotoPath,
  dispositivo, 
  className = "" 
}: UserAvatarProps) {
  const [imgSrc, setImgSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const iniciales = nombre 
    ? nombre.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
    : '?';

  useEffect(() => {
    const loadImage = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        setDebugInfo('Cargando...');
        
        if (!employeeNo || employeeNo === 'N/A' || employeeNo === 'undefined') {
          console.log(`❌ EmployeeNo inválido: "${employeeNo}"`);
          setDebugInfo('ID inválido');
          setHasError(true);
          setIsLoading(false);
          return;
        }
        
        // Usar fotoPath si está disponible, de lo contrario usar employeeNo
        const pathToUse = fotoPath || employeeNo;
        
        // Construir la URL con parámetros
        let url = `/api/foto/${encodeURIComponent(pathToUse)}`;
        
        // Agregar parámetros de consulta si están disponibles
        const params = new URLSearchParams();
        if (dispositivo) {
          params.append('deviceIp', dispositivo);
        }
        
        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }
        
        console.log(`📡 Cargando foto: ${url}`);
        
        const response = await fetch(url);
        
        console.log(`📊 Response status: ${response.status} para ${employeeNo}`);
        
        if (response.ok) {
          console.log(`✅ Foto encontrada para: ${employeeNo}`);
          setDebugInfo('Foto encontrada');
          const blob = await response.blob();
          
          if (blob.size === 0) {
            throw new Error('Blob vacío');
          }
          
          // Verificar que sea una imagen
          if (blob.type.startsWith('image/')) {
            const imageUrl = URL.createObjectURL(blob);
            setImgSrc(imageUrl);
            setHasError(false);
          } else {
            // Si no es una imagen, verificar si es JSON con error
            const text = await blob.text();
            console.log(`⚠️ Respuesta no es imagen: ${text.substring(0, 100)}`);
            throw new Error('Respuesta no es una imagen');
          }
        } else if (response.status === 404) {
          console.log(`❌ Foto no existe para: ${employeeNo}`);
          setDebugInfo('Foto no encontrada');
          setHasError(true);
        } else if (response.status === 400) {
          console.log(`❌ Bad request para: ${employeeNo}`);
          setDebugInfo('Solicitud inválida');
          setHasError(true);
        } else {
          console.log(`⚠️ Error ${response.status} para: ${employeeNo}`);
          const errorText = await response.text();
          console.log(`🔍 Detalles: ${errorText.substring(0, 200)}`);
          setDebugInfo(`Error ${response.status}`);
          setHasError(true);
        }
      } catch (error) {
        console.error(`🚨 Error cargando foto para ${employeeNo}:`, error);
        setDebugInfo('Error de conexión');
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();

    // Cleanup
    return () => {
      if (imgSrc && imgSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imgSrc);
      }
    };
  }, [employeeNo, fotoPath, dispositivo]);

  if (isLoading) {
    return (
      <div 
        className={`w-[75px] h-[100px] rounded-lg bg-gray-200 flex items-center justify-center border ${className}`}
        title={`Cargando foto de ${nombre}...`}
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (hasError || !imgSrc) {
    return (
      <div 
        className={`w-[75px] h-[100px] rounded-lg bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white font-semibold text-lg border ${className}`}
        title={`${nombre} - ${debugInfo || 'Foto no disponible'}`}
      >
        <span className="text-center p-2">{iniciales}</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={`Foto de ${nombre}`}
      className={`w-[75px] h-[100px] rounded-lg object-cover border ${className}`}
      onError={() => {
        console.log(`🖼️ Error cargando imagen para: ${employeeNo}`);
        setDebugInfo('Error al mostrar imagen');
        setHasError(true);
      }}
      title={nombre}
    />
  );
}