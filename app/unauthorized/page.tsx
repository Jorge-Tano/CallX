export default function Unauthorized() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ fontSize: '2rem', color: '#dc2626', marginBottom: '1rem' }}>
        ⚠️ Acceso Denegado
      </h1>
      <p style={{ fontSize: '1.125rem', marginBottom: '2rem', maxWidth: '400px' }}>
        No tienes permisos para acceder a esta página.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <a 
          href="/dashboard" 
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            fontWeight: '500'
          }}
        >
          Ir al Dashboard
        </a>
        <a 
          href="/login" 
          style={{
            padding: '0.75rem 1.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            textDecoration: 'none',
            color: '#374151'
          }}
        >
          Cambiar Usuario
        </a>
      </div>
    </div>
  )
}