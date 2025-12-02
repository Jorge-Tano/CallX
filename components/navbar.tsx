"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-white shadow-sm flex text-black items-center h-16 justify-between px-4">

      <div className="flex items-center gap-2 h-full">

        {/* Logo */}
        <div className="relative h-12 w-12 m-4">
          <Image src="/Logo.png" alt="Mi imagen" fill className="object-contain" />
        </div>

        {/* Menú principal */}
        <div className="flex ml-2 gap-2 h-full">

          <div className="h-full flex items-center hover:bg-green-600 hover:text-white transition">
            <Link href="#" className="flex items-center gap-2 px-4 h-full">
              <i className="bi bi-people-fill"></i>
              <span>Personas</span>
            </Link>
          </div>

          <div className="h-full flex items-center hover:bg-green-600 hover:text-white transition">
            <Link href="/eventos" className="flex items-center gap-2 px-4 h-full">
              <i className="bi bi-calendar-check-fill"></i>
              <span>Asistencias</span>
            </Link>
          </div>

          <div className="h-full flex items-center hover:bg-green-600 hover:text-white transition">
            <Link href="#" className="flex items-center gap-2 px-4 h-full">
              <i className="bi bi-shield-lock-fill"></i>
              <span>Control de Accesos</span>
            </Link>
          </div>

        </div>
      </div>

      {/* DERECHA */}
      <div className="relative flex items-center">

        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition"
        >
          <i className="bi bi-list text-2xl"></i>
        </button>

        <div
          className={`
            absolute right-0 top-16 w-48 bg-white shadow-lg rounded-lg py-2 z-50
            transition-all duration-300 transform

            ${open
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
            }
          `}
        >

          <Link
            href="#"
            className="block px-4 py-2 hover:bg-gray-100 transition"
            onClick={() => setOpen(false)}
          >
            Registrar Usuarios
          </Link>

          <Link
            href="#"
            className="block px-4 py-2 hover:bg-gray-100 transition"
            onClick={() => setOpen(false)}
          >
            Cambiar Contraseña
          </Link>

          <Link
            href="#"
            className="block px-4 py-2 hover:bg-red-100 text-red-600 transition"
            onClick={() => setOpen(false)}
          >
            Cerrar Sesión
          </Link>

        </div>

      </div>
    </nav>
  );
}
