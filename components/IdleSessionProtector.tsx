// components/IdleSessionProtector.tsx (VERSIÓN CORREGIDA)
'use client';

import { 
  useEffect, 
  useRef, 
  useCallback,
  ReactNode,
  useState
} from 'react';
import { useSession, signOut } from 'next-auth/react';

interface IdleSessionProtectorProps {
  children: ReactNode;
  timeoutMinutes?: number;
}

export default function IdleSessionProtector({ 
  children, 
  timeoutMinutes = 15
}: IdleSessionProtectorProps) {
  const { data: session, status } = useSession();
  const [sessionReady, setSessionReady] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cerrar sesión
  const logout = useCallback(async (expiredByInactivity: boolean = false): Promise<void> => {
    
    
    if (expiredByInactivity) {
      localStorage.setItem('sessionExpiredByInactivity', 'true');
    }
    
    clearTimer();
    
    // Limpiar localStorage
    localStorage.removeItem('lastActivity');
    
    // Limpiar cookies
    const cookiesToClear: string[] = [
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
    
    // Cerrar sesión con NextAuth
    try {
      await signOut({ 
        redirect: false,
        callbackUrl: '/'
      });
    } catch (error) {
      console.error('Error en signOut:', error);
    }
    
    // Redirigir a login
    const redirectUrl = expiredByInactivity ? '/?expired=true' : '/';
    
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 500);
    
  }, [clearTimer]);

  const resetTimer = useCallback((): void => {
    // Solo resetear si hay sesión activa
    if (!session || status !== 'authenticated') {
      return;
    }
    
    
    clearTimer();

    const now = Date.now();
    localStorage.setItem('lastActivity', now.toString());
    
    timerRef.current = setTimeout(() => {
      
      logout(true);
    }, timeoutMinutes * 60 * 1000);

  }, [session, status, timeoutMinutes, logout, clearTimer]);

  const setupActivityListeners = useCallback(() => {
    const events = [
      'mousedown', 'mousemove', 'keydown',
      'scroll', 'touchstart', 'click',
      'wheel', 'resize', 'focus'
    ] as const;

    const handleActivity = (): void => {
      // Solo resetear si hay sesión activa
      if (session) {
        resetTimer();
      }
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return (): void => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [session, resetTimer]);

  // Inicializar cuando la sesión esté lista
  useEffect(() => {
    if (status === 'loading') {
      
      return;
    }

    if (status === 'unauthenticated') {
      
      clearTimer();
      setSessionReady(false);
      return;
    }

    if (session && status === 'authenticated') {
      
      
      // Limpiar timer anterior
      clearTimer();
      
      // IMPORTANTE: AL HACER LOGIN, LIMPIAMOS lastActivity PARA EVITAR USAR DATOS VIEJOS
      localStorage.removeItem('lastActivity');
      
      // Establecer nueva actividad
      const now = Date.now();
      localStorage.setItem('lastActivity', now.toString());
      
      // Marcar sesión como lista
      setSessionReady(true);
      
      // Configurar listeners
      const cleanupListeners = setupActivityListeners();
      
      // Iniciar timer
      resetTimer();
      
      return () => {
        cleanupListeners();
        clearTimer();
      };
    }
    
    return () => {
      clearTimer();
    };
  }, [session, status, setupActivityListeners, resetTimer, clearTimer]);

  // Efecto secundario para manejar sesión recién cargada
  useEffect(() => {
    // Cuando la sesión se marca como lista, verificamos si hay lastActivity válido
    if (sessionReady && session) {
      const lastActivity = localStorage.getItem('lastActivity');
      
      if (!lastActivity) {
        // Si no hay lastActivity, establecer uno nuevo
        localStorage.setItem('lastActivity', Date.now().toString());
        resetTimer();
      } else {
        // Verificar si el lastActivity es muy viejo (sesión anterior)
        const lastActivityTime = parseInt(lastActivity, 10);
        const now = Date.now();
        const elapsedMinutes = (now - lastActivityTime) / (1000 * 60);
        
        if (elapsedMinutes > timeoutMinutes) {
          // Si el lastActivity es más viejo que el timeout, es de una sesión anterior
          
          localStorage.setItem('lastActivity', now.toString());
          resetTimer();
        } else {
          // Usar el lastActivity existente
          
          resetTimer();
        }
      }
    }
  }, [sessionReady, session, timeoutMinutes, resetTimer]);

  return <>{children}</>;
}