
"use client";
import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import SessionExpiredModal from '@/components/SessionExpiredModal'; // CAMBIA A ESTA IMPORTACIÓN

export default function LoginPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = useState("/users");
  const [usuario, setUsuario] = useState("");
  const [passward, setPassward] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Obtener searchParams en el cliente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") || "/users");
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        usuario: usuario,
        password: passward,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes("Usuario no encontrado")) {
          setError("Usuario no encontrado en el sistema");
        } else if (result.error.includes("Contraseña incorrecta")) {
          setError("Contraseña incorrecta");
        } else {
          setError("Error al iniciar sesión. Verifica tus credenciales.");
        }
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* MODAL ELEGANTE DE SESIÓN EXPIRADA - Aparece automáticamente si es necesario */}
      <SessionExpiredModal />
      
      <div className="min-h-screen flex bg-gradient-to-br from-gray-900 to-green-900">
        {/* SECCIÓN IZQUIERDA (igual a registro) */}
        <div className="hidden lg:flex lg:w-1/2 relative">
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <img 
              src="/Logo.png" 
              alt="Logo CallX" 
              className="max-w-full max-h-full object-contain "
              style={{
                width: "100%",
                height: "100%",
                maxWidth: "100%",
                maxHeight: "100%"
              }}
            />
            <div className="absolute inset-0 bg-black/50"></div>
          </div>
          <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
            <h1 className="text-5xl font-bold mb-6 text-center">
              <span className="text-green-400">CallX</span>
            </h1>
            <p className="text-xl text-gray-300 text-center max-w-lg mb-12">
              Gestión de usuarios, eventos y operaciones en tiempo real
            </p>

            <div className="space-y-3 max-w-md">
              {[
                { icon: "bi-person-check", title: "Acceso Seguro", text: "Autenticación confiable" },
                { icon: "bi-clock-history", title: "Disponibilidad", text: "Sistema activo 24/7" },
                { icon: "bi-bar-chart", title: "Administración", text: "Control total del sistema" },
              ].map((item, i) => ( 
                <div key={i} className="flex items-center gap-4 p-4 bg-white/1 rounded-xl backdrop-blur-sm">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500/5 to-emerald-500/10 flex items-center justify-center">
        <i className={`bi ${item.icon} text-2xl text-green-300`}></i>
      </div>
                  <div>
                    <h3 className="font-semibold text-lg">{item.title}</h3>
                    <p className="text-gray-300">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* LOGIN FORM */}
        <div className="flex w-full lg:w-1/2 items-center justify-center p-6 lg:p-12">
          <div className="bg-white/95 backdrop-blur-sm w-full max-w-xl p-8 lg:p-12 rounded-2xl shadow-2xl border border-white/20">
            
            {/* HEADER */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 flex items-center justify-center">
                <i className="bi bi-box-arrow-in-right text-white text-2xl"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Iniciar Sesión</h1>
                <p className="text-gray-600">Acceso al sistema CallX</p>
              </div>
            </div>

            

            {/* ERROR DEL LOGIN */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                <div className="flex items-start">
                  <i className="bi bi-exclamation-triangle-fill text-red-500 mt-0.5 mr-3"></i>
                  <div>
                    <p className="text-red-700 font-medium">Error de Autenticación</p>
                    <p className="text-red-600 text-sm mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* FORM */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Usuario */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-person-circle mr-2"></i> Usuario
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="bi bi-person text-gray-400"></i>
                  </div>
                  <input
                    type="text"
                    className="block w-full pl-10 pr-3 py-3 text-black border border-gray-300 rounded-lg bg-white/50 focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                    placeholder="Usuario"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  <i className="bi bi-lock mr-2"></i> Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="bi bi-shield-lock text-gray-400"></i>
                  </div>
                  <input
                    type={showPass ? "text" : "password"}
                    className="block w-full pl-10 pr-12 py-3 border text-black border-gray-300 rounded-lg bg-white/50 focus:ring-2 focus:ring-green-500"
                    placeholder="••••••••"
                    value={passward}
                    onChange={(e) => setPassward(e.target.value)}
                    disabled={loading}
                  />

                  {/* Show password */}
                  <button
                    type="button"
                    className="absolute inset-y-0 right-3 flex items-center text-gray-500"
                    onClick={() => setShowPass(!showPass)}
                  >
                    <i className={`bi ${showPass ? "bi-eye-slash" : "bi-eye"}`}></i>
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-lg transition disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Iniciando Sesión...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <i className="bi bi-box-arrow-in-right"></i> Entrar
                  </span>
                )}
              </button>
            </form>

            
          </div>
        </div>

        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css"
        />
      </div>
    </>
  );
}