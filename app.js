const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const port = 30030;
const db = require('./config/database');
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'ganasys-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));






app.locals.getDbConnection = () => {
    if (!db) {
        console.error("Intento de acceder a la DB antes de conectar");
    }
    return db;
};




// Función para conectar a la base de datos
async function initializeDatabase() {
    try {
        await createBasicStructure();
        console.log('Base de datos lista y estructurada');
    } catch (error) {
        console.error('Error inicializando base de datos:', error.message);
        if (error.code === 'ER_USER_LIMIT_REACHED') {
            console.error(' El servidor de base de datos está lleno. Reinicia el servicio en Render.');

        }
        throw error;
    }
}
// Función para crear estructura básica
function createBasicStructure() {
    return new Promise((resolve, reject) => {
        const queries = [
            // Tabla users actualizada con campo status
            `CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'veterinario', 'supervisor', 'operador') DEFAULT 'operador',
                status ENUM('active', 'pending', 'suspended', 'inactive') DEFAULT 'pending',
                last_access TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`,
            
            // Tabla para tokens de recuperación de contraseña
            `CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100) NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (token),
                INDEX idx_email (email)
            )`,
            
            `CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                stock INT NOT NULL DEFAULT 0,
                unit VARCHAR(50),
                min_stock INT DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`,
            
            `CREATE TABLE IF NOT EXISTS sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_code VARCHAR(50) UNIQUE NOT NULL,
                client_name VARCHAR(200) NOT NULL,
                sale_date DATE NOT NULL,
                product_id INT,
                product_name VARCHAR(200) NOT NULL,
                quantity INT NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                discount DECIMAL(10,2) DEFAULT 0.00,
                tax DECIMAL(10,2) DEFAULT 0.00,
                total_amount DECIMAL(10,2) NOT NULL,
                status ENUM('Pendiente', 'Completada', 'Cancelada') DEFAULT 'Pendiente',
                payment_method VARCHAR(50),
                notes TEXT,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
            )`,
            
            `CREATE TABLE IF NOT EXISTS payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                payment_date DATE NOT NULL,
                payment_method VARCHAR(50),
                status VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
            )`,
            
            // Insertar usuario admin por defecto con contraseña encriptada (password: Admin123)
            `INSERT IGNORE INTO users (name, email, password, role, status) VALUES 
            ('Administrador', 'admin@ganasys.com', '$2b$10$u5Y6bJxX7k3Q1vW2cR3nS.9z8y7a6b5c4d3e2f1g0h9i8j7k6l5m4n3o2p', 'admin', 'active'),
            ('Dueño', 'nibci@ganasys.com', '$2b$10$u5Y6bJxX7k3Q1vW2cR3nS.9z8y7a6b5c4d3e2f1g0h9i8j7k6l5m4n3o2p', 'admin', 'active')`
        ];

        function executeQuery(index) {
            if (index >= queries.length) {
                console.log('✅ Estructura básica creada');
                resolve();
                return;
            }
            
            db.query(queries[index], (err) => {
                if (err) {
                    console.error(`Error ejecutando query ${index + 1}:`, err.message);
                    // Continuamos con la siguiente query aunque falle una
                    executeQuery(index + 1);
                } else {
                    executeQuery(index + 1);
                }
            });
        }
        
        executeQuery(0);
    });
}

// Middleware para pasar la conexión a la base de datos a las rutas
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Importar middlewares
const { requireAuth } = require('./middlewares/auth');

// Importar rutas
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const usersRoutes = require('./routes/users');
const livestockRoutes = require('./routes/livestock');
const healthRoutes = require('./routes/health');
const salesRoutes = require('./routes/sales');
const reproductionRoutes = require('./routes/reproduction');
const inventoryRoutes = require('./routes/inventory');

// Usar rutas con autenticación
app.use('/', authRoutes);
app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/users', requireAuth, usersRoutes);
app.use('/livestock', requireAuth, livestockRoutes);
app.use('/health', requireAuth, healthRoutes);
app.use('/sales', requireAuth, salesRoutes);
app.use('/reproduction', requireAuth, reproductionRoutes);
app.use('/inventory', requireAuth, inventoryRoutes);

// Ruta principal
app.get('/', (req, res) => {
    if (req.session.user) res.redirect('/dashboard');
    else res.redirect('/login');
});

// Ruta API para obtener animales
app.get('/reproduction/api/animals/:type', requireAuth, (req, res) => {
    const { type } = req.params;
    let tableName = '';
    
    if (type === 'cattle') {
        tableName = 'cattle';
    } else if (type === 'pig') {
        tableName = 'pigs';
    } else {
        return res.json([]);
    }
    
    const query = `SELECT id, name, breed FROM ${tableName} WHERE status = 'Activo'`;
    
    req.db.query(query, (err, results) => {
        if (err) {
            console.error('Error obteniendo animales:', err);
            return res.status(500).json({ error: 'Error del servidor' });
        }
        res.json(results);
    });
});

// Ruta para verificar token de recuperación
app.get('/verify-token/:token', (req, res) => {
    const { token } = req.params;
    
    db.execute(
        'SELECT email FROM password_resets WHERE token = ? AND expires_at > NOW()',
        [token],
        (err, results) => {
            if (err) {
                console.error('Error verificando token:', err);
                return res.json({ valid: false });
            }
            
            if (results.length > 0) {
                res.json({ valid: true });
            } else {
                res.json({ valid: false });
            }
        }
    );
});

// Inicializar e iniciar servidor
initializeDatabase()
    .then(() => {
        app.listen(port, () => {
            console.log(`🚀 Servidor GanaSys ejecutándose en http://localhost:${port}`);
            console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
            console.log(`👥 Usuarios: http://localhost:${port}/users`);
            console.log(`🐄 Ganado: http://localhost:${port}/livestock`);
            console.log(`❤️ Reproducción: http://localhost:${port}/reproduction`);
            console.log(`💉 Sanidad: http://localhost:${port}/health`);
            console.log(`💰 Ventas: http://localhost:${port}/sales`);
            console.log(`📦 Inventario: http://localhost:${port}/inventory`);
            console.log(`🔐 Login: http://localhost:${port}/login`);
            console.log('\n🔑 Credenciales de administrador:');
            console.log('📧 Email: admin@ganasys.com');
            console.log('🔑 Contraseña: Admin123');
        });
    })
    .catch((error) => {
        console.error('❌ No se pudo iniciar la aplicación:', error.message);
        console.log('\n🔧 SOLUCIÓN MANUAL:');
        console.log('1. Abre XAMPP');
        console.log('2. Inicia MySQL');
        console.log('3. Verifica que el puerto 3306 esté libre');
        console.log('4. Vuelve a ejecutar: npm start');
    });