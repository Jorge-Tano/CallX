// hooks/useCurrentUser.ts
import { useState, useEffect } from 'react';

interface CurrentUser {
  id: string;
  nombre: string;
  users: string;
  rol: string;
  campana?: string;
  documento: string;
}

export function useCurrentUser() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        // Si ya tienes un endpoint para obtener el usuario actual
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          setCurrentUser(data.user);
        } else {
          // Si no hay endpoint, intenta obtener de localStorage/sessionStorage
          const storedUser = localStorage.getItem('currentUser');
          if (storedUser) {
            setCurrentUser(JSON.parse(storedUser));
          }
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  return { currentUser, loading };
}