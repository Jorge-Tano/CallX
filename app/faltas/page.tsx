// app/faltas/page.tsx
"use client";

import Faltas from '@/components/Faltas';
import Navbar from '@/components/navbar';
import IdleSessionProtector from '@/components/IdleSessionProtector';

export default function FaltasPage() {
  return (
    <IdleSessionProtector timeoutMinutes={15}>
      <>
        <Navbar />
        <div className="p-4 pt-20">
          <Faltas 
            mostrarSoloHoy={true} // Cambia a false si quieres permitir seleccionar fecha
          />
        </div>
      </>
    </IdleSessionProtector>
  );
}