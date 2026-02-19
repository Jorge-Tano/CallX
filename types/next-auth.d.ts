// types/next-auth.d.ts
import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    documento: string;
    nombre: string;
    username: string;
    role: string; // ← Agregamos el rol
    email: string;
  }
  
  interface Session {
    user: {
      id: string;
      documento: string;
      nombre: string;
      username: string;
      role: string; // ← Agregamos el rol
      email: string;
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    documento: string;
    nombre: string;
    username: string;
    role: string; // ← Agregamos el rol
    email: string;
  }
}