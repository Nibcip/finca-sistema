-- CREATE DATABASE ganasys;  -- Elimina esta línea
-- USE ganasys;             -- Elimina esta línea

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'veterinario', 'supervisor', 'operador') DEFAULT 'operador',
    last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de ganado
CREATE TABLE IF NOT EXISTS cattle (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    breed VARCHAR(100) NOT NULL,
    age VARCHAR(50) NOT NULL,
    weight VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Activo',
    last_update DATE NOT NULL
);

-- Tabla de porcinos
CREATE TABLE IF NOT EXISTS pigs (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    breed VARCHAR(100) NOT NULL,
    age VARCHAR(50) NOT NULL,
    weight VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'Activo',
    last_update DATE NOT NULL
);

-- Tabla de vacunaciones
CREATE TABLE IF NOT EXISTS vaccinations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    animal_id VARCHAR(10) NOT NULL,
    animal_type ENUM('cattle', 'pig') NOT NULL,
    vaccine VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    status ENUM('Completada', 'Pendiente', 'Vencida') DEFAULT 'Completada'
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS sales (
    id VARCHAR(10) PRIMARY KEY,
    client VARCHAR(100) NOT NULL,
    product VARCHAR(100) NOT NULL,
    quantity VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status ENUM('Completada', 'Pendiente', 'Cancelada') DEFAULT 'Completada',
    date DATE NOT NULL
);

-- Tabla de productos en inventario
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    stock VARCHAR(50) NOT NULL,
    price VARCHAR(50) NOT NULL,
    last_sale DATE
);

-- Insertar usuario administrador por defecto
INSERT IGNORE INTO users (name, email, password, role) VALUES 
('dueño', 'nibci@ganasys.com', 'nibci', 'admin');

-- Insertar datos de ejemplo para ganado
INSERT IGNORE INTO cattle (id, name, breed, age, weight, last_update) VALUES 
('C001', 'Esperanza', 'Holstein', '3 años', '400 kg', '2024-01-10'),
('C002', 'Jenny', 'Jersey', '2 años', '300 kg', '2024-01-12'),
('C003', 'Reina', 'Holstein', '4 años', '500 kg', '2024-01-08'),
('C004', 'Bella', 'Brahman', '3 años', '400 kg', '2024-01-14');

-- Insertar datos de ejemplo para porcinos
INSERT IGNORE INTO pigs (id, name, breed, age, weight, last_update) VALUES 
('P001', 'Piggy', 'Yorkshire', '8 meses', '55 kg', '2024-01-11'),
('P002', 'Rosa', 'Landrace', '1 año', '120 kg', '2024-01-11'),
('P003', 'Piglet', 'Duroc', '6 meses', '65 kg', '2024-01-09'),
('P004', 'Napoleon', 'Hampshire', '2 años', '100 kg', '2024-01-15');

-- Insertar datos de ejemplo para vacunaciones
INSERT IGNORE INTO vaccinations (animal_id, animal_type, vaccine, date, status) VALUES 
('C001', 'cattle', 'Antiaftosa', '2024-01-15', 'Completada'),
('P002', 'pig', 'Pneumonia', '2024-01-10', 'Completada'),
('C003', 'cattle', 'Brucelosis', '2024-01-05', 'Vencida'),
('P001', 'pig', 'Peste Porcina', '2024-01-20', 'Pendiente');

-- Insertar datos de ejemplo para ventas
INSERT IGNORE INTO sales (id, client, product, quantity, amount, status, date) VALUES 
('V001', 'Consorcio El Buen Sabor', 'Res (Canal)', '2 unidades', 2800.00, 'Completada', '2024-01-15'),
('V002', 'Lácteos San José', 'Leche Fresca', '500 litros', 750.00, 'Completada', '2024-01-14'),
('V003', 'Granja Las Piñas', 'Ternero', '1 unidad', 2200.00, 'Pendiente', '2024-01-13'),
('V004', 'Mercado Central', 'Cerdo (Canal)', '3 unidades', 2300.00, 'Completada', '2024-01-12'),
('V005', 'Quesera Avanzada', 'Leche Fresca', '300 litros', 400.00, 'Cancelada', '2024-01-10');

-- Insertar datos de ejemplo para productos
INSERT IGNORE INTO products (name, stock, price, last_sale) VALUES 
('Res (Canal)', '15 unidades', '$1000/u', '2024-01-15'),
('Cerdo (Canal)', '8 unidades', '$700/u', '2024-01-12'),
('Leche Fresca', '2500 litros', '$1.50/L', '2024-01-14'),
('Ternero', '5 unidades', '$1000/u', '2024-01-13'),
('Queso Fresco', '100 kg', '$9/kg', '2024-01-06');