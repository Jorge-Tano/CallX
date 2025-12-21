import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { pool } from '@/lib/db'
import { Client as PgClient } from 'pg'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.usuario) {
          return null
        }

        if (!credentials?.password) {
          return null
        }

        let client;
        let isPoolClient = false;

        try {
          client = new PgClient({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: false
          })

          await client.connect()
          isPoolClient = false

          const usuarioParam = credentials.usuario.trim()
          const queryText = `SELECT id, documento, nombre, rol, users, passward, campaña FROM auth WHERE users = $1`
          const result = await client.query(queryText, [usuarioParam])

          if (result.rows.length === 0) {
            return null
          }

          const user = result.rows[0]
          const inputPassword = credentials.password
          const storedPassword = user.passward

          if (inputPassword !== storedPassword) {
            return null
          }

          const authUser = {
            id: user.id.toString(),
            documento: user.documento,
            nombre: user.nombre,
            username: user.users,
            role: user.rol,
            campana: user.campaña || null,
            email: `${user.users}@calix.com`
          }

          return authUser

        } catch (error: any) {
          return null
        } finally {
          if (client) {
            if (isPoolClient) {
              (client as any).release()
            } else {
              await (client as PgClient).end()
            }
          }
        }
      }
    })
  ],

  pages: {
    signIn: '/login',
    error: '/auth/error',
    newUser: '/register'
  },

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const userData = user as any
        token.id = userData.id
        token.documento = userData.documento
        token.nombre = userData.nombre
        token.username = userData.username
        token.role = userData.role
        token.campana = userData.campana
        token.email = userData.email
      }
      return token
    },

    async session({ session, token }) {
      if (token && session.user) {
        const extendedUser = session.user as any
        extendedUser.id = token.id
        extendedUser.documento = token.documento
        extendedUser.nombre = token.nombre
        extendedUser.username = token.username
        extendedUser.role = token.role
        extendedUser.campana = token.campana || null
        extendedUser.email = token.email
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      return url.startsWith("/") ? `${baseUrl}${url}` : url
    }
  },

  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? 'next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 8 * 60 * 60,
      }
    }
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
}