"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Definir las campañas disponibles como strings
const CAMPAIGNS = [
  { value: 'campaña_5757', label: 'Campaña 5757' },
  { value: 'campaña_SAV', label: 'Campaña SAV' },
  { value: 'campaña_REFI', label: 'Campaña REFI' },
  { value: 'campaña_PL', label: 'Campaña PL' },
  { value: 'campaña_PARLO', label: 'Campaña PARLO' },
  { value: 'campaña_ventas', label: 'Campaña Ventas'}
];

// Mapeo para mostrar nombres más descriptivos
const CAMPAIGN_NAMES: Record<string, string> = {
  'campaña_5757': 'Campaña 5757',
  'campaña_SAV': 'Campaña SAV',
  'campaña_REFI': 'Campaña REFI',
  'campaña_PL': 'Campaña PL',
  'campaña_PARLO': 'Campaña PARLO',
  'campaña_ventas': 'Campaña Ventas'
};

export default function RegisterPage() {
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    documento: "",
    nombre: "",
    users: "",
    passward: "",
    confirmPassward: "",
    fecha_registro: new Date().toISOString().split('T')[0],
    rol: "Team Leader",
    campaña: "" // ← Ahora es string
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [showcampañaField, setShowcampañaField] = useState(false);

  // 4 ROLES: Administrador, TI, Team Leader, Supervisores
  const rolesDisponibles = [
    { 
      value: "Administrador", 
      label: "Administrador", 
      desc: "Acceso total al sistema",
      icon: "bi-shield-check",
      color: "from-red-500 to-pink-500",
      bgColor: "bg-red-50",
      borderColor: "border-red-200"
    },
    { 
      value: "TI", 
      label: "Soporte TI", 
      desc: "Gestión técnica",
      icon: "bi-cpu",
      color: "from-blue-500 to-cyan-500",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200"
    },
    { 
      value: "Team Leader", 
      label: "Team Leader", 
      desc: "Líder de equipo",
      icon: "bi-people",
      color: "from-green-500 to-emerald-500",
      bgColor: "bg-green-50",
      borderColor: "border-green-200"
    },
    { 
      value: "Supervisor", 
      label: "Supervisor", 
      desc: "Supervisión operativa",
      icon: "bi-clipboard-check",
      color: "from-purple-500 to-indigo-500",
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200"
    },
  ];

  // Efecto para mostrar/ocultar campo de campaña
  useEffect(() => {
    if (formData.rol === "Team Leader") {
      setShowcampañaField(true);
    } else {
      setShowcampañaField(false);
      setFormData(prev => ({ ...prev, campaña: "" })); // Limpiar campaña si no es Team Leader
    }
  }, [formData.rol]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.documento.trim()) {
      newErrors.documento = "El documento es requerido";
    }

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre completo es requerido";
    } else if (formData.nombre.length < 5) {
      newErrors.nombre = "Nombre muy corto (mínimo 5 caracteres)";
    }

    if (!formData.users.trim()) {
      newErrors.users = "El nombre de usuario es requerido";
    } else if (!/^[a-zA-Z0-9._-]+$/.test(formData.users)) {
      newErrors.users = "Solo letras, números, puntos, guiones y guiones bajos";
    }

    if (!formData.passward) {
      newErrors.passward = "La contraseña es requerida";
    } else if (formData.passward.length < 6) {
      newErrors.passward = "Mínimo 6 caracteres";
    }

    if (formData.passward !== formData.confirmPassward) {
      newErrors.confirmPassward = "Las contraseñas no coinciden";
    }

    // Validar rol (debe ser uno de los 4 disponibles)
    const rolesValidos = ["Administrador", "TI", "Team Leader", "Supervisor"];
    if (!formData.rol || !rolesValidos.includes(formData.rol)) {
      newErrors.rol = "Selecciona un tipo de usuario";
    }

    // Validar campaña solo para Team Leader
    if (formData.rol === "Team Leader" && !formData.campaña) {
      newErrors.campaña = "La campaña es requerida para Team Leader";
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSuccess("");

    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documento: formData.documento,
          nombre: formData.nombre,
          users: formData.users,
          passward: formData.passward,
          fecha_registro: formData.fecha_registro,
          rol: formData.rol,
          campaña: formData.rol === "Team Leader" ? formData.campaña : null // Enviar string o null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes("ya existe")) {
          setErrors({ users: "Este nombre de usuario ya está registrado" });
        } else if (data.error?.includes("documento")) {
          setErrors({ documento: "Este documento ya está registrado" });
        } else {
          setErrors({ general: data.error || "Error en el registro" });
        }
      } else {
        // Obtener nombre amigable de la campaña
        const campañaNombre = formData.campaña && CAMPAIGN_NAMES[formData.campaña] 
          ? ` (${CAMPAIGN_NAMES[formData.campaña]})` 
          : '';
        
        setSuccess(`✅ ¡${formData.rol} registrado exitosamente${campañaNombre}! Redirigiendo...`);
        
        // Limpiar formulario
        setFormData({
          documento: "",
          nombre: "",
          users: "",
          passward: "",
          confirmPassward: "",
          fecha_registro: new Date().toISOString().split('T')[0],
          rol: "Team Leader",
          campaña: ""
        });
        
        // Redirigir después de 2 segundos
        setTimeout(() => {
          router.push("/");
        }, 2000);
      }
    } catch (error) {
      console.error("Error en registro:", error);
      setErrors({ general: "Error de conexión con el servidor" });
    } finally {
      setLoading(false);
    }
  };

  // Función para obtener estilos del rol seleccionado
  const getRoleStyles = (roleValue: string) => {
    const role = rolesDisponibles.find(r => r.value === roleValue);
    if (!role) return {};
    
    return {
      iconColor: role.value === 'Administrador' ? 'text-red-600' : 
                role.value === 'TI' ? 'text-blue-600' :
                role.value === 'Team Leader' ? 'text-green-600' : 'text-purple-600',
      bgColor: role.value === 'Administrador' ? 'bg-red-100' : 
              role.value === 'TI' ? 'bg-blue-100' :
              role.value === 'Team Leader' ? 'bg-green-100' : 'bg-purple-100',
      textColor: role.value === 'Administrador' ? 'text-red-700' : 
                role.value === 'TI' ? 'text-blue-700' :
                role.value === 'Team Leader' ? 'text-green-700' : 'text-purple-700',
      borderColor: role.value === 'Administrador' ? 'border-red-200' : 
                  role.value === 'TI' ? 'border-blue-200' :
                  role.value === 'Team Leader' ? 'border-green-200' : 'border-purple-200'
    };
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-900 to-green-900">
      {/* IMAGEN A LA IZQUIERDA */}
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
        
        {/* Texto sobre la imagen */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <h1 className="text-5xl font-bold mb-6 text-center">
           <span className="text-green-400">CallX</span>
          </h1>
          <p className="text-xl text-gray-300 text-center max-w-lg mb-8">
            Sistema integral de gestión y monitoreo de eventos
          </p>
          
          {/* Mostrar los 4 roles en la sección izquierda */}
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {rolesDisponibles.map((rolOption) => {
              const styles = getRoleStyles(rolOption.value);
              return (
                <div 
                  key={rolOption.value} 
                  className={`flex items-center gap-3 p-3 rounded-lg backdrop-blur-sm border ${styles.borderColor}`}
                  style={{ 
                    background: `linear-gradient(135deg, ${rolOption.color.split(' ')[1].replace('from-', '')}20, transparent)` 
                  }}
                >
                  <div className={`w-10 h-10 rounded-full ${styles.bgColor} flex items-center justify-center`}>
                    <i className={`bi ${rolOption.icon} ${styles.iconColor}`}></i>
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{rolOption.label}</h3>
                    <p className="text-xs text-gray-300">{rolOption.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Información adicional */}
          <div className="mt-8 p-4 bg-white/10 rounded-lg backdrop-blur-sm max-w-md">
            <p className="text-sm text-gray-300 text-center">
              Selecciona el tipo de usuario según las responsabilidades que tendrá en el sistema.
            </p>
          </div>
        </div>
      </div>

      {/* FORMULARIO DE REGISTRO */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-4 lg:p-12">
        <div className="bg-white/95 backdrop-blur-sm w-full max-w-2xl p-8 lg:p-12 rounded-2xl shadow-2xl border border-white/20">
          
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-green-600 to-emerald-500 flex items-center justify-center">
                <i className="bi bi-person-plus text-white text-xl"></i>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Crear Cuenta</h1>
                <p className="text-gray-600 text-sm">Registro de nuevo usuario</p>
              </div>
            </div>
          </div>

          {/* Mensajes de error/success */}
          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <i className="bi bi-exclamation-triangle-fill text-red-500"></i>
                <p className="text-red-700 text-sm">{errors.general}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg animate-fadeIn">
              <div className="flex items-center gap-2">
                <i className="bi bi-check-circle-fill text-green-500"></i>
                <p className="text-green-700 text-sm">{success}</p>
              </div>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Documento */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Documento
                </label>
                <input
                  type="text"
                  name="documento"
                  value={formData.documento}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2.5 border ${
                    errors.documento ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg bg-white/50 focus:ring-2 focus:ring-green-500 text-black focus:border-transparent transition text-sm`}
                  placeholder="1234567"
                  disabled={loading}
                  maxLength={15}
                />
                {errors.documento && (
                  <p className="text-red-500 text-xs mt-1">{errors.documento}</p>
                )}
              </div>

              {/* Nombre Completo */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  name="nombre"
                  value={formData.nombre}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2.5 border ${
                    errors.nombre ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg bg-white/50 focus:ring-2 text-black focus:ring-green-500 focus:border-transparent transition text-sm`}
                  placeholder="Nombre Completo"
                  disabled={loading}
                />
                {errors.nombre && (
                  <p className="text-red-500 text-xs mt-1">{errors.nombre}</p>
                )}
              </div>

              {/* Nombre de Usuario */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Usuario
                </label>
                <input
                  type="text"
                  name="users"
                  value={formData.users}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2.5 border ${
                    errors.users ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg bg-white/50 focus:ring-2 text-black focus:ring-green-500 focus:border-transparent transition text-sm`}
                  placeholder="usuario"
                  disabled={loading}
                />
                {errors.users && (
                  <p className="text-red-500 text-xs mt-1">{errors.users}</p>
                )}
              </div>

              {/* Contraseña */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Contraseña
                </label>
                <input
                  type="password"
                  name="passward"
                  value={formData.passward}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2.5 border ${
                    errors.passward ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg bg-white/50 focus:ring-2 text-black focus:ring-green-500 focus:border-transparent transition text-sm`}
                  placeholder="••••••••"
                  disabled={loading}
                />
                {errors.passward && (
                  <p className="text-red-500 text-xs mt-1">{errors.passward}</p>
                )}
              </div>

              {/* Confirmar Contraseña */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  name="confirmPassward"
                  value={formData.confirmPassward}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2.5 border ${
                    errors.confirmPassward ? 'border-red-300' : 'border-gray-300'
                  } rounded-lg bg-white/50 text-black focus:ring-2 focus:ring-green-500 focus:border-transparent transition text-sm`}
                  placeholder="••••••••"
                  disabled={loading}
                />
                {errors.confirmPassward && (
                  <p className="text-red-500 text-xs mt-1">{errors.confirmPassward}</p>
                )}
              </div>

              {/* SELECTOR DE ROL - 4 BOTONES EN GRID */}
              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Usuario
                </label>
                
                {/* Grid de 4 botones (2x2 en móvil, 4 en línea en desktop) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {rolesDisponibles.map((rolOption) => {
                    const isSelected = formData.rol === rolOption.value;
                    const styles = getRoleStyles(rolOption.value);
                    
                    return (
                      <div key={rolOption.value} className="flex-1 min-w-0">
                        <input
                          type="radio"
                          id={`rol-${rolOption.value}`}
                          name="rol"
                          value={rolOption.value}
                          checked={isSelected}
                          onChange={handleChange}
                          className="sr-only peer"
                          disabled={loading}
                        />
                        <label
                          htmlFor={`rol-${rolOption.value}`}
                          className={`
                            block p-3 border rounded-lg cursor-pointer transition-all duration-200
                            peer-checked:border-2 peer-checked:shadow-sm h-full
                            hover:border-gray-400 hover:shadow
                            ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                            ${errors.rol ? 'border-red-300' : ''}
                            ${isSelected ? 
                              `border-2 ${rolOption.value === 'Administrador' ? 'border-red-500' : 
                               rolOption.value === 'TI' ? 'border-blue-500' :
                               rolOption.value === 'Team Leader' ? 'border-green-500' : 'border-purple-500'} 
                              bg-white shadow-sm` : 
                              'bg-gray-50'
                            }
                          `}
                        >
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isSelected ? styles.bgColor : 'bg-white'
                            }`}>
                              <i className={`bi ${rolOption.icon} ${
                                isSelected ? styles.iconColor : 
                                rolOption.value === 'Administrador' ? 'text-red-500' : 
                                rolOption.value === 'TI' ? 'text-blue-500' :
                                rolOption.value === 'Team Leader' ? 'text-green-500' : 'text-purple-500'
                              }`}></i>
                            </div>
                            
                            <div className="text-center">
                              <span className={`font-medium text-sm ${
                                isSelected ? styles.textColor : 'text-gray-800'
                              }`}>
                                {rolOption.label}
                              </span>
                              <p className={`text-xs mt-0.5 ${
                                isSelected ? 
                                  rolOption.value === 'Administrador' ? 'text-red-600' : 
                                  rolOption.value === 'TI' ? 'text-blue-600' :
                                  rolOption.value === 'Team Leader' ? 'text-green-600' : 'text-purple-600'
                                : 'text-gray-600'
                              }`}>
                                {rolOption.desc}
                              </p>
                            </div>
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </div>
                
                {errors.rol && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <i className="bi bi-exclamation-circle"></i>
                    {errors.rol}
                  </p>
                )}
              </div>

              {/* CAMPO DE CAMPAÑA (Solo para Team Leader) - AHORA COMO STRING */}
              <div className={`md:col-span-2 transition-all duration-300 ease-in-out ${
                showcampañaField 
                  ? 'opacity-100 max-h-40 translate-y-0' 
                  : 'opacity-0 max-h-0 overflow-hidden -translate-y-4'
              }`}>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Campaña Asignada <span className="text-red-500">*</span>
                    <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      Solo para Team Leader
                    </span>
                  </label>
                  <div className="relative">
                    <select
                      name="campaña"
                      value={formData.campaña}
                      onChange={handleChange}
                      className={`block w-full px-3 py-2.5 border ${
                        errors.campaña ? 'border-red-300' : 'border-gray-300'
                      } rounded-lg bg-white/50 focus:ring-2 text-black focus:ring-green-500 focus:border-transparent transition text-sm appearance-none pr-10`}
                      disabled={loading || !showcampañaField}
                    >
                      <option value="">Selecciona una campaña</option>
                      {CAMPAIGNS.map((campaña) => (
                        <option key={campaña.value} value={campaña.value}>
                          {campaña.label}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                      <i className="bi bi-chevron-down"></i>
                    </div>
                  </div>
                  {errors.campaña && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                      <i className="bi bi-exclamation-circle"></i>
                      {errors.campaña}
                    </p>
                  )}
                  
                  {/* Mostrar nombre descriptivo de la campaña seleccionada */}
                  {formData.campaña && CAMPAIGN_NAMES[formData.campaña] && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                      <p className="text-green-700">
                        <i className="bi bi-info-circle mr-1"></i>
                        Será asignado a: <span className="font-medium">{CAMPAIGN_NAMES[formData.campaña]}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Botón de Registro */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 shadow hover:shadow-md flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm">
                      Registrando como {formData.rol}
                      {formData.rol === "Team Leader" && formData.campaña && ` (${CAMPAIGN_NAMES[formData.campaña]})`}
                      ...
                    </span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-person-plus"></i>
                    <span>
                      Registrar como {formData.rol}
                      {formData.rol === "Team Leader" && formData.campaña && ` (${CAMPAIGN_NAMES[formData.campaña]})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bootstrap Icons */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css"
      />
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        
        /* Animación para el campo de campaña */
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
            max-height: 0;
          }
          to {
            opacity: 1;
            transform: translateY(0);
            max-height: 200px;
          }
        }
        
        .campaña-slide-enter {
          animation: slideDown 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}