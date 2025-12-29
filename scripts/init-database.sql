-- scripts/init-database.sql
CREATE DATABASE hikvision_events;

-- Conéctate a la base de datos hikvision_events y ejecuta:

-- Tabla principal de eventos
CREATE TABLE biometric_events (
    id SERIAL PRIMARY KEY,
    documento VARCHAR(50),
    nombre VARCHAR(255),
    fecha TIMESTAMP WITH TIME ZONE,
    hora_entrada TIME,
    hora_salida TIME,
    hora_salida_almuerzo TIME,
    hora_entrada_almuerzo TIME,
    dispositivo_ip VARCHAR(50),
    campana VARCHAR(100),
    imagen VARCHAR(500),
    attendance_status VARCHAR(50),
    event_label VARCHAR(100),
    employee_no_string VARCHAR(50),
    card_no VARCHAR(50),
    major INTEGER,
    minor INTEGER,
    event_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(documento, fecha, dispositivo_ip, major, minor)
);

-- Tabla de consolidación diaria
CREATE TABLE daily_consolidation (
    id SERIAL PRIMARY KEY,
    documento VARCHAR(50),
    nombre VARCHAR(255),
    fecha DATE,
    dispositivo_ip VARCHAR(50),
    primera_entrada TIME,
    ultima_salida TIME,
    salida_almuerzo TIME,
    entrada_almuerzo TIME,
    total_eventos INTEGER,
    horas_trabajadas INTERVAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(documento, fecha, dispositivo_ip)
);

-- Índices para mejor performance
CREATE INDEX idx_biometric_documento ON biometric_events(documento);
CREATE INDEX idx_biometric_fecha ON biometric_events(fecha);
CREATE INDEX idx_biometric_dispositivo ON biometric_events(dispositivo_ip);
CREATE INDEX idx_biometric_event_time ON biometric_events(event_time);

CREATE INDEX idx_daily_documento ON daily_consolidation(documento);
CREATE INDEX idx_daily_fecha ON daily_consolidation(fecha);
CREATE INDEX idx_daily_dispositivo ON daily_consolidation(dispositivo_ip);