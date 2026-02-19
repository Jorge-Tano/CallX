'use client'

import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

// Función para normalizar campañas (remover acentos, convertir a minúsculas)
function normalizarCampana(campana: string | null): string | null {
  if (!campana) return null
  
  // Convertir a minúsculas y normalizar caracteres
  return campana
    .toLowerCase()
    .normalize('NFD') // Separar acentos
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/\s+/g, '_') // Reemplazar espacios con guiones bajos
    .replace(/[^a-z0-9_]/g, '') // Remover caracteres especiales
}

// 🔥 Función para verificar si es campaña de ventas - CORREGIDA
function esCampanaVentas(campana: string | null): boolean {
  if (!campana) return false
  
  const normalizada = normalizarCampana(campana)
  
  // Si normalizada es null, retornar false
  if (!normalizada) return false
  
  // Múltiples variaciones posibles
  const ventasVariants = [
    'campaña_ventas',
    'campana_ventas',
    'campaña_ventas_casa',
    'campana_ventas_casa',
    'ventas',
    'sales',
    'ventas_consolidado'
  ]
  
  return ventasVariants.includes(normalizada)
}

// 🔥 Obtener todas las campañas para un Team Leader - CORREGIDA
function obtenerCampanasTeamLeader(campana: string | null): string[] {
  if (!campana) return []
  
  if (esCampanaVentas(campana)) {
    return ['SAV', 'REFI', 'PL']  // 🔥 Las 3 campañas de ventas
  }
  
  // Para otras campañas individuales
  return [campana]
}

// 🔥 Obtener nombres de departamento para Team Leader - CORREGIDA
function obtenerDepartamentosTeamLeader(campana: string | null): string[] {
  if (!campana) return []
  
  if (esCampanaVentas(campana)) {
    return ['Campana SAV', 'Campana REFI', 'Campana PL']  // 🔥 Departamentos en BD
  }
  
  // Mapeo para otras campañas
  const normalizada = normalizarCampana(campana)
  if (!normalizada) return []
  
  const campaignMap: Record<string, string> = {
    'campaña_5757': 'Campana 5757',
    'campana_5757': 'Campana 5757',
    'campaña_parlo': 'Campana PARLO',
    'campana_parlo': 'Campana PARLO',
    'ti': 'TI',
    'administrativo': 'Administrativo'
  }
  
  const department = campaignMap[normalizada] || campana
  return [department]
}

export function useHideFrom() {
  const { data: session, status, update } = useSession()
  
  // DEBUG detallado
  useEffect(() => {
    
  }, [session, status])
  
  const userData = session?.user as any
  
  // Normalizar la campaña para consistencia
  const userCampaignRaw = userData?.campana || null
  const userCampaign = userCampaignRaw ? normalizarCampana(userCampaignRaw) : null
  const userRole = userData?.role || null
  const userName = userData?.name || userData?.nombre || null
  const userId = userData?.id || null
  const userDocument = userData?.documento || null
  
  // 🔥 Campañas del usuario
  const userCampaigns = userRole === 'Team Leader' ? 
    obtenerCampanasTeamLeader(userCampaignRaw) : 
    userCampaignRaw ? [userCampaignRaw] : []
  
  // 🔥 Departamentos del Team Leader (para consultas SQL)
  const userDepartments = userRole === 'Team Leader' ? 
    obtenerDepartamentosTeamLeader(userCampaignRaw) : []
  
  const esTeamLeaderVentas = userRole === 'Team Leader' && esCampanaVentas(userCampaignRaw)
  
  // 🔥 FUNCIÓN PARA DEBUG: Forzar actualización de sesión
  const refreshSession = async () => {
    
    await update()
  }
  
  const shouldHide = (rolesToHide: string | string[]): boolean => {
    if (status === 'loading' || status === 'unauthenticated') {
      return true
    }
    
    if (!userRole) {
      return true
    }
    
    const hideArray = Array.isArray(rolesToHide) ? rolesToHide : [rolesToHide]
    const shouldHideResult = hideArray.includes(userRole)
    
    
    
    return shouldHideResult
  }
  
  const hideFrom = (options: {
    roles: string | string[]
    showWhenLoading?: boolean
    hideWhenNoRole?: boolean
  }): boolean => {
    const { roles, showWhenLoading = false, hideWhenNoRole = true } = options
    
    if (status === 'loading') {
      return !showWhenLoading
    }
    
    if (status === 'unauthenticated') {
      return true
    }
    
    if (!userRole) {
      return hideWhenNoRole
    }
    
    const hideArray = Array.isArray(roles) ? roles : [roles]
    return hideArray.includes(userRole)
  }
  
  const Hide = ({
    from,
    children,
    fallback = null,
    inverse = false
  }: {
    from: string | string[]
    children: React.ReactNode
    fallback?: React.ReactNode
    inverse?: boolean
  }): React.ReactNode => {
    const hide = shouldHide(from)
    
    
    
    if (inverse) {
      return hide ? children : fallback
    }
    
    return hide ? fallback : children
  }

  return {
    currentUser: userData ? {
      id: userId,
      nombre: userName,
      rol: userRole,
      campana: userCampaign, // 🔥 Versión normalizada
      campanaOriginal: userCampaignRaw, // 🔥 Original para referencia
      documento: userDocument,
      esTeamLeaderVentas, // 🔥 Flag de ventas
      campañas: userCampaigns, // 🔥 Array de códigos de campaña
      departamentos: userDepartments // 🔥 Array de nombres de departamento (para SQL)
    } : null,
    userRole,
    userCampaign,
    userCampaignRaw,
    userCampaigns,
    userDepartments, // 🔥 NUEVO: Departamentos para SQL
    esTeamLeaderVentas,
    userName,
    userId,
    userDocument,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    session,
    refreshSession,
    
    shouldHide,
    hideFrom,
    Hide,
  }
}