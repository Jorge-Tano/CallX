"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useHideFrom } from "@/lib/hooks/useRole";

export default function Navbar() {
  const { shouldHide } = useHideFrom();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [userInfo, setUserInfo] = useState<{
    nombre?: string;
    username?: string;
    role?: string;
    documento?: string;
  } | null>(null);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const router = useRouter();

  // Verificar sesión al cargar
  useEffect(() => {
    const checkSession = async () => {
      try {
        // PRIMERO: Usar NextAuth session si está disponible
        if (status === "authenticated" && session?.user) {
          const user = session.user as any; // Cast temporal
          
          const userData = {
            nombre: user.nombre || user.username || user.email?.split('@')[0] || "Usuario", // Usar 'nombre' no 'name'
            username: user.username || user.email || user.nombre || "usuario",
            role: user.role || 'Usuario', // 'role' existe en tu configuración
            documento: user.documento || '',
            campana: user.campana || null // Si necesitas campana
          };
          
          setUserInfo(userData);
          localStorage.setItem('currentUser', JSON.stringify(userData));
          setSessionChecked(true);
          return;
        }
        
        // SEGUNDO: Intentar con localStorage
        const storedUser = localStorage.getItem('currentUser') || 
                          localStorage.getItem('auth-user');
        
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            setUserInfo({
              nombre: parsedUser.nombre || parsedUser.name || parsedUser.username,
              username: parsedUser.username,
              role: parsedUser.rol || parsedUser.role || 'Usuario',
              documento: parsedUser.documento
            });
          } catch (e) {
            console.log("Error parseando usuario de storage:", e);
          }
        }
      } catch (error) {
        clearLocalAuthData();
      } finally {
        setSessionChecked(true);
      }
    };

    if (status !== "loading") {
      checkSession();
    }
    
    // Escuchar eventos de storage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentUser' || e.key === 'auth-user') {
        if (!e.newValue) {
          setUserInfo(null);
        } else {
          try {
            setUserInfo(JSON.parse(e.newValue));
          } catch (parseError) {
            console.log("Error parseando usuario en storage change");
          }
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [status, session]);

  // Función para limpiar datos locales
  const clearLocalAuthData = () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth-user');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('auth-user');
    localStorage.removeItem('lastActivity'); // También limpia esto
    setUserInfo(null);
  };

  // Función mejorada para cerrar sesión - REDIRIGE PRIMERO
  const handleLogout = async () => {
    setLoadingLogout(true);
    setOpen(false);
    
    try {
      
      
      // PASO 1: Redirigir inmediatamente a login (usuario ya no ve la página)
      window.location.href = '/';
      
      // PASO 2: Limpiar datos locales inmediatamente (pero después de redirigir)
      // Usamos setTimeout para que se ejecute después de la redirección
      setTimeout(() => {
        try {
          clearLocalAuthData();
          
          // PASO 3: Limpiar cookies en segundo plano
          const cookiesToClear = [
            'next-auth.session-token',
            '__Secure-next-auth.session-token',
            'next-auth.csrf-token',
            '__Host-next-auth.csrf-token',
            'auth-token',
            'session'
          ];
          
          cookiesToClear.forEach(cookieName => {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          });
          
          // PASO 4: Cerrar sesión de NextAuth en segundo plano
          const logoutInBackground = async () => {
            try {
              const { signOut } = await import("next-auth/react");
              await signOut({ 
                redirect: false,
                callbackUrl: '/' 
              });
            } catch (signOutError) {
              console.log("Error en signOut de fondo:", signOutError);
            }
          };
          
          logoutInBackground();
          
          console.log("✅ Logout completado en segundo plano");
          
        } catch (backgroundError) {
          console.error("Error en limpieza de fondo:", backgroundError);
        }
      }, 100); // Pequeño delay para asegurar que la redirección ocurra primero
      
    } catch (error) {
      console.error("❌ Error durante logout:", error);
      // Fallback: redirigir de todas formas
      window.location.href = '/';
    } finally {
      // No cambiamos loadingLogout porque ya redirigimos
    }
  };

  // Versión alternativa más simple y efectiva:
  const handleLogoutSimple = async () => {
    setLoadingLogout(true);
    setOpen(false);
    
    try {
      
      
      // 1. Limpiar datos locales VISIBLES (los esenciales)
      clearLocalAuthData();
      
      // 2. Redirigir inmediatamente SIN esperar
      window.location.replace('/');
      
      // 3. Limpieza en segundo plano (opcional, no bloquea)
      setTimeout(async () => {
        try {
          // Limpiar cookies
          const cookiesToClear = [
            'next-auth.session-token',
            '__Secure-next-auth.session-token',
            'next-auth.csrf-token',
            '__Host-next-auth.csrf-token',
            'auth-token',
            'session'
          ];
          
          cookiesToClear.forEach(cookieName => {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
          });
          
          // NextAuth signOut
          const { signOut } = await import("next-auth/react");
          await signOut({ redirect: false });
          
        } catch (bgError) {
          // Ignorar errores de fondo
        }
      }, 0);
      
    } catch (error) {
      console.error("Error en logout:", error);
      // Forzar redirección de todas formas
      window.location.href = '/';
    }
  };

  // Mostrar loading mientras se verifica la sesión
  if (status === "loading" || !sessionChecked) {
    return (
      <nav className="fixed top-0 left-0 w-full z-50 bg-white shadow-md border-b border-gray-100 flex text-black items-center h-16 justify-between px-4 md:px-6">
        <div className="flex items-center gap-4 h-full">
          <div className="relative h-10 w-10 md:h-12 md:w-12">
            <Image 
              src="/Logo.png" 
              alt="Logo CallX" 
              fill 
              className="object-contain" 
              priority
            />
          </div>
          <div className="text-sm text-gray-500">Cargando...</div>
        </div>
      </nav>
    );
  }

  // Determinar si hay sesión activa
  const isLoggedIn = !!userInfo || status === "authenticated";
  const userRole = userInfo?.role || (session?.user as any)?.role || 'Invitado';
  
  const userName = userInfo?.nombre ||
                  (session?.user as any)?.nombre ||
                  session?.user?.email?.split('@')[0] ||
                  'Invitado';

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-white shadow-md border-b border-gray-100 flex text-black items-center h-16 justify-between px-4 md:px-6">
      
      {/* LADO IZQUIERDO - Logo y Menú */}
      <div className="flex items-center gap-4 h-full">
        {/* Logo */}
        <div className="relative h-10 w-10 md:h-12 md:w-12">
          <Image 
            src="/Logo.png" 
            alt="Logo CallX" 
            fill 
            className="object-contain" 
            priority
          />
        </div>

        {/* Menú principal - SOLO si está logueado */}
        {isLoggedIn && (
          <div className="hidden md:flex ml-2 gap-1 h-full">
            <div className="h-full flex items-center hover:bg-green-50 hover:text-green-700 transition rounded-lg px-4">
              <Link href="/users" className="flex items-center gap-2">
                <i className="bi bi-people-fill"></i>
                <span className="font-medium">Personas</span>
              </Link>
            </div>

            <div className="h-full flex items-center hover:bg-green-50 hover:text-green-700 transition rounded-lg px-4">
              <Link href="/eventos" className="flex items-center gap-2">
                <i className="bi bi-calendar-check-fill"></i>
                <span className="font-medium">Asistencias</span>
              </Link>
            </div>
            <div className="h-full flex items-center hover:bg-green-50 hover:text-green-700 transition rounded-lg px-4">
              <Link href="/faltas" className="flex items-center gap-2">
                <i className="bi bi-clock-fill"></i>
                <span className="font-medium">Faltas</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* LADO DERECHO - Info de Usuario y Menú */}
      <div className="flex items-center gap-4">
        
        {/* TARJETA DE USUARIO - SIEMPRE mostrar, con estado apropiado */}
        <div className="flex items-center gap-3 p-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100 shadow-sm">
          {/* Avatar */}
          <div className="relative">
            <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white font-bold">
              {isLoggedIn ? (userName?.charAt(0).toUpperCase() || "U") : "?"}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
              isLoggedIn ? 'bg-green-500' : 'bg-gray-400'
            }`}></div>
          </div>
          
          {/* Información */}
          <div className="hidden lg:block">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm">
                {userName}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                userRole === 'Administrador' 
                  ? 'bg-red-100 text-red-800' 
                  : userRole === 'TI'
                  ? 'bg-purple-100 text-purple-800'
                  : userRole === 'Team Leader'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {userRole}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isLoggedIn ? "Sesión activa" : "No autenticado"}
            </p>
          </div>
        </div>

        {/* Separador y menú - SOLO si está logueado */}
        {isLoggedIn && (
          <>
            <div className="h-6 w-px bg-gray-300"></div>

            {/* Botón del menú */}
            <button
              onClick={() => setOpen(!open)}
              className="group relative p-2 rounded-xl bg-gradient-to-br from-green-600 to-green-400 
                        text-white overflow-hidden transition-all duration-300 
                        hover:shadow-lg hover:shadow-green-500/25 
                        active:scale-95 focus:outline-none focus:ring-2 focus:ring-green-500/50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-green-400 
                              opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              </div>
              
              <div className="relative z-10 flex flex-col items-center justify-center w-5 h-5">
                <div className={`w-4 h-0.5 bg-white mb-1 transition-all duration-300 
                                ${open ? 'rotate-45 translate-y-1.5' : ''}`}></div>
                <div className={`w-4 h-0.5 bg-white transition-all duration-300 
                                ${open ? 'opacity-0' : ''}`}></div>
                <div className={`w-4 h-0.5 bg-white mt-1 transition-all duration-300 
                                ${open ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
              </div>
            </button>

            {/* Menú desplegable */}
            <div
              className={`
                absolute right-4 top-16 w-56 bg-white shadow-xl rounded-xl py-2 z-50 border border-gray-200
                transition-all duration-300 transform
                ${open ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95 pointer-events-none"}
              `}
            >
              <div className="px-4 py-3 border-b">
                <p className="font-medium text-gray-900">Opciones</p>
              </div>

              <div className="py-2">
                {/* Opción de Registrar Usuarios - SOLO para ciertos roles */}
                {isLoggedIn && !shouldHide(['TI', 'Team Leader']) && (
                  <Link
                    href="/auth/registrar"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition"
                    onClick={() => setOpen(false)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                      <i className="bi bi-person-plus text-green-600"></i>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Registrar Usuarios</p>
                    </div>
                  </Link>
                )}

                {/* BOTÓN DE LOGOUT - USAR LA VERSIÓN SIMPLE */}
                <button
                  onClick={handleLogoutSimple} 
                  disabled={loadingLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    {loadingLogout ? (
                      <div className="h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <i className="bi bi-box-arrow-right text-red-600"></i>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-red-700">
                      {loadingLogout ? "Saliendo..." : "Cerrar Sesión"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Salir del sistema
                    </p> 
                  </div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bootstrap Icons */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" />
    </nav>
  );
}