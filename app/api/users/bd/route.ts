import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CAMPAIGNS_MAP: Record<string, string> = {
  'campana_5757': 'Campana 5757',
  'campana_sav': 'Campana SAV',
  'campana_refi': 'Campana REFI',
  'campana_pl': 'Campana PL',
  'campana_parlo': 'Campana PARLO',
  'ti': 'TI',
  'teams_leaders': 'Teams Leaders',
  'administrativo': 'Administrativo',
  'campaña_5757': 'Campana 5757',
  'campaña_sav': 'Campana SAV',
  'campaña_refi': 'Campana REFI',
  'campaña_pl': 'Campana PL',
  'campaña_parlo': 'Campana PARLO',
  'campaña_PARLO': 'Campana PARLO',
  'campana_ventas': 'Campana SAV',
  'campaña_ventas': 'Campana SAV',
  'campana_ventas_casa': 'Campana SAV',
  'campaña_ventas_casa': 'Campana SAV',
  'ventas': 'Campana SAV',
  'sales': 'Campana SAV',
  'CAMPANA_5757': 'Campana 5757',
  'CAMPANA_SAV': 'Campana SAV',
  'CAMPANA_REFI': 'Campana REFI',
  'CAMPANA_PL': 'Campana PL',
  'CAMPANA_PARLO': 'Campana PARLO',
  'CAMPANA_VENTAS': 'Campana SAV',
  'CAMPAÑA_VENTAS': 'Campana SAV',
  'TI': 'TI',
  'TEAMS_LEADERS': 'Teams Leaders',
  'ADMINISTRATIVO': 'Administrativo'
};

function getCampaignName(campanaCode: string | null | undefined): string | null {
  if (!campanaCode) return null;
  const normalized = campanaCode.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const key = Object.keys(CAMPAIGNS_MAP).find(k =>
    k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalized
  );
  return key ? CAMPAIGNS_MAP[key] : null;
}

const CAMPAIGNS_REVERSE_MAP: Record<string, string> = {};
Object.entries(CAMPAIGNS_MAP).forEach(([code, name]) => {
  CAMPAIGNS_REVERSE_MAP[name] = code;
});

function esCampanaVentasServidor(campana: string | null): boolean {
  if (!campana) return false;
  const normalized = campana.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ventasVariants = [
    'campaña_ventas', 'campana_ventas', 'campaña_ventas_casa',
    'campana_ventas_casa', 'ventas', 'sales', 'ventas_consolidado'
  ];
  return ventasVariants.includes(normalized);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }

    const user = session.user as any;
    const { role, campana } = user;

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') || '1000');
    const page = parseInt(searchParams.get('page') || '1');
    const departmentFilter = searchParams.get('department');
    const offset = (page - 1) * limit;

    let userDepartments: string[] = [];
    let appliedFilterDescription = null;
    let esTeamLeaderVentas = false;

    if (role === 'Team Leader') {
      esTeamLeaderVentas = esCampanaVentasServidor(campana);
      if (esTeamLeaderVentas) {
        userDepartments = ['Campana SAV', 'Campana REFI', 'Campana PL'];
        appliedFilterDescription = 'Ventas (SAV, REFI, PL)';
      } else {
        const singleDepartment = getCampaignName(campana);
        if (singleDepartment) {
          userDepartments = [singleDepartment];
          appliedFilterDescription = singleDepartment;
        }
      }

      if (userDepartments.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          metadata: { warning: 'Team Leader sin departamento asignado', userRole: role }
        });
      }
    } else if (role === 'TI' || role === 'Administrador') {
      if (departmentFilter) {
        userDepartments = [departmentFilter];
        appliedFilterDescription = departmentFilter;
      }
    } else {
      return NextResponse.json({
        success: true,
        data: [],
        metadata: { warning: 'Usuario sin permisos para ver usuarios', userRole: role }
      });
    }

    const deptCheckResult = await pool.query(
      `SELECT DISTINCT departamento FROM hikvision_users WHERE departamento IS NOT NULL ORDER BY departamento`
    );
    const existingDepartments = deptCheckResult.rows.map(r => r.departamento);

    // ✅ Se agrega device_ip al SELECT para usarlo en la URL de la foto
    let query = `
      SELECT 
        id,
        employee_no   AS "employeeNo",
        nombre,
        genero,
        departamento,
        foto_path     AS "fotoPath",
        device_ip     AS "deviceIp",
        tipo_usuario  AS "tipoUsuario",
        fecha_creacion    AS "createdAt",
        fecha_modificacion AS "updatedAt",
        estado
      FROM hikvision_users
      WHERE 1=1
    `;

    let queryParams: any[] = [];
    let paramIndex = 1;

    if (userDepartments.length > 0) {
      const validDepartments = userDepartments.filter(dept =>
        existingDepartments.some(existing => existing.toLowerCase() === dept.toLowerCase())
      );
      const departmentsToUse = validDepartments.length > 0 ? validDepartments : userDepartments;

      if (departmentsToUse.length === 1) {
        query += ` AND departamento ILIKE $${paramIndex}`;
        queryParams.push(departmentsToUse[0]);
        paramIndex++;
      } else {
        const conditions = departmentsToUse.map((dept, idx) => {
          queryParams.push(dept);
          return `departamento ILIKE $${paramIndex + idx}`;
        });
        query += ` AND (${conditions.join(' OR ')})`;
        paramIndex += departmentsToUse.length;
      }
    }

    if (userDepartments.length === 1) {
      query += ` ORDER BY fecha_creacion DESC, id ASC`;
    } else if (userDepartments.length > 1) {
      query += ` ORDER BY CASE ${userDepartments.map((dept, idx) =>
        `WHEN LOWER(departamento) = LOWER('${dept.replace(/'/g, "''")}') THEN ${idx}`
      ).join(' ')} ELSE 999 END, fecha_creacion DESC, id ASC`;
    } else {
      query += ` ORDER BY LOWER(departamento) ASC, fecha_creacion DESC, id ASC`;
    }

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await pool.query(query, queryParams);

    const usuariosFormateados = result.rows.map(usuario => {
      let campanaCode = null;
      if (usuario.departamento) {
        campanaCode = CAMPAIGNS_REVERSE_MAP[usuario.departamento] || null;
      }

      return {
        ...usuario,
        numeroEmpleado: usuario.employeeNo,
        rol: usuario.tipoUsuario,
        campana: campanaCode,
        departamento: usuario.departamento || 'No asignado',
        // ✅ deviceIp incluido para que el componente construya la URL de la foto
        // correctamente apuntando al dispositivo exacto donde está la foto
        deviceIp: usuario.deviceIp || null
      };
    });

    // Count query
    let countQuery = `SELECT COUNT(*) as total FROM hikvision_users WHERE 1=1`;
    let countParams: any[] = [];

    if (userDepartments.length > 0) {
      const departmentsToUse = userDepartments.filter(dept =>
        existingDepartments.some(existing => existing.toLowerCase() === dept.toLowerCase())
      ).length > 0
        ? userDepartments.filter(dept =>
            existingDepartments.some(existing => existing.toLowerCase() === dept.toLowerCase())
          )
        : userDepartments;

      if (departmentsToUse.length === 1) {
        countQuery += ` AND departamento ILIKE $1`;
        countParams.push(departmentsToUse[0]);
      } else if (departmentsToUse.length > 1) {
        const conditions = departmentsToUse.map((dept, idx) => {
          countParams.push(dept);
          return `departamento ILIKE $${idx + 1}`;
        });
        countQuery += ` AND (${conditions.join(' OR ')})`;
      }
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    return NextResponse.json({
      success: true,
      data: usuariosFormateados,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      metadata: {
        userRole: role,
        userCampaign: campana,
        userDepartments,
        appliedFilter: appliedFilterDescription,
        esTeamLeaderVentas
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}