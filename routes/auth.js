const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const db = mysql.createConnection({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306
});
// Ruta GET de login
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    
    res.render('login', { 
        error: req.query.error || '', 
        success: req.query.success || '', 
        email: ''
    });
});

// Ruta POST de login
router.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    console.log('📧 Intento de login con:', email);
    
    const query = 'SELECT * FROM users WHERE email = ?';
    db.execute(query, [email], async (err, results) => {
        if (err) {
            console.error('❌ Error en consulta SQL:', err);
            return res.render('login', { 
                error: 'Error del servidor',
                success: '',
                email: email
            });
        }
        
        if (results.length === 0) {
            console.log('❌ Usuario no encontrado:', email);
            return res.render('login', { 
                error: 'Credenciales incorrectas',
                success: '',
                email: email
            });
        }
        
        const user = results[0];
        
        
        if (user.status !== 'activo') {
            console.log('❌ Cuenta no activa:', email, 'Estado:', user.status);
            return res.render('login', { 
                error: 'Tu cuenta está ' + user.status,
                success: '',
                email: email
            });
        }
        
        try {
            let passwordMatch = false;
            
            // Verificar si la contraseña está encriptada
            if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
                // Contraseña encriptada con bcrypt
                passwordMatch = await bcrypt.compare(password, user.password);
            } else {
                // Contraseña en texto plano (para migración)
                passwordMatch = password === user.password;
                
                // Si coincide, encriptarla para futuro
                if (passwordMatch) {
                    const hashedPassword = await bcrypt.hash(password, 10);
                    db.execute('UPDATE users SET password = ?, status = "activo" WHERE id = ?', [hashedPassword, user.id]);
                    console.log('🔐 Contraseña encriptada para:', email);
                }
            }
            
            if (passwordMatch) {
                // Actualizar último acceso
                db.execute('UPDATE users SET last_access = NOW() WHERE id = ?', [user.id]);
                
                req.session.user = user;
                console.log('✅ Login exitoso para:', user.name);
                return res.redirect('/dashboard');
            } else {
                console.log('❌ Contraseña incorrecta para:', email);
                return res.render('login', { 
                    error: 'Credenciales incorrectas',
                    success: '',
                    email: email
                });
            }
        } catch (error) {
            console.error('❌ Error comparando contraseña:', error);
            return res.render('login', { 
                error: 'Error del servidor',
                success: '',
                email: email
            });
        }
    });
});

// Ruta POST para registro - ESTA ES LA IMPORTANTE
router.post('/register', async (req, res) => {
    const { name, email, password, confirmPassword, role } = req.body;
    
    console.log('📝 Intento de registro para:', email);
    console.log('📋 Datos recibidos:', { name, email, role });
    
    // Validaciones básicas
    if (!name || !email || !password || !confirmPassword || !role) {
        console.log('❌ Faltan campos obligatorios');
        return res.redirect('/login?error=Todos los campos son obligatorios');
    }
    
    if (password !== confirmPassword) {
        console.log('❌ Contraseñas no coinciden');
        return res.redirect('/login?error=Las contraseñas no coinciden');
    }
    
    if (password.length < 6) {
        console.log('❌ Contraseña muy corta');
        return res.redirect('/login?error=La contraseña debe tener al menos 6 caracteres');
    }
    
    // Verificar si el email ya existe
    db.execute('SELECT id FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('❌ Error verificando email:', err);
            return res.redirect('/login?error=Error del servidor');
        }
        
        if (results.length > 0) {
            console.log('❌ Email ya registrado:', email);
            return res.redirect('/login?error=Este correo ya está registrado');
        }
        
        try {
            // Encriptar contraseña
            const hashedPassword = await bcrypt.hash(password, 10);
            console.log('🔐 Contraseña encriptada para:', email);
            
            // Insertar usuario
            const insertQuery = `
                INSERT INTO users (name, email, password, role, status, created_at) 
                VALUES (?, ?, ?, ?, 'pendiente', NOW())
            `;
            
            db.execute(insertQuery, [name, email, hashedPassword, role], (err, result) => {
                if (err) {
                    console.error('❌ Error registrando usuario:', err);
                    console.error('❌ Detalle del error:', err.message);
                    console.error('❌ Código SQL:', err.code);
                    return res.redirect('/login?error=Error registrando usuario: ' + err.message);
                }
                
                console.log('✅ Usuario registrado exitosamente:', email);
                console.log('📊 ID del nuevo usuario:', result.insertId);
                
                return res.redirect('/login?success=Cuenta creada exitosamente. Espera activación del administrador.');
            });
            
        } catch (error) {
            console.error('❌ Error encriptando contraseña:', error);
            return res.redirect('/login?error=Error del servidor al crear cuenta');
        }
    });
});

// Ruta POST para recuperar contraseña
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    
    console.log('🔐 Solicitud de recuperación para:', email);
    
    // Verificar si el email existe
    db.execute('SELECT id, name FROM users WHERE email = ?', [email], (err, results) => {
        if (err) {
            console.error('❌ Error verificando email:', err);
            return res.json({ 
                success: false, 
                message: 'Error del servidor' 
            });
        }
        
        if (results.length === 0) {
            // Por seguridad, no revelamos si el email existe
            console.log('⚠️ Email no encontrado (pero no lo decimos):', email);
            return res.json({ 
                success: true, 
                message: 'Si el email existe en nuestro sistema, recibirás instrucciones en la consola del servidor.' 
            });
        }
        
        const user = results[0];
        
        // Generar token simple
        const token = crypto.randomBytes(20).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hora
        
        // Guardar token
        const insertQuery = `
            INSERT INTO password_resets (email, token, expires_at) 
            VALUES (?, ?, ?)
        `;
        
        db.execute(insertQuery, [email, token, expires], (err) => {
            if (err) {
                console.error('❌ Error guardando token:', err);
                return res.json({ 
                    success: false, 
                    message: 'Error del servidor' 
                });
            }
            
            // Mostrar enlace en consola (para desarrollo)
            const resetLink = `http://localhost:30029/reset-password?token=${token}`;
            
            console.log('\n🔗 ===== ENLACE DE RECUPERACIÓN =====');
            console.log('Para:', user.name, `<${email}>`);
            console.log('Enlace de recuperación:', resetLink);
            console.log('Válido hasta:', expires.toLocaleString());
            console.log('🔗 ===== FIN ENLACE =====\n');
            
            return res.json({ 
                success: true, 
                message: 'Revisa la consola del servidor para el enlace de recuperación.' 
            });
        });
    });
});

// Ruta GET para reset-password
router.get('/reset-password', (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.redirect('/login?error=Token no válido');
    }
    
    // Verificar token
    db.execute(
        'SELECT email FROM password_resets WHERE token = ? AND expires_at > NOW()',
        [token],
        (err, results) => {
            if (err || results.length === 0) {
                return res.redirect('/login?error=Token inválido o expirado');
            }
            
            res.render('reset-password', { 
                token: token,
                error: '',
                success: ''
            });
        }
    );
});

// Ruta POST para reset-password
router.post('/reset-password', async (req, res) => {
    const { token, password, confirmPassword } = req.body;
    
    console.log('🔄 Procesando restablecimiento de contraseña con token:', token);
    
    // Validaciones
    if (!token) {
        return res.render('reset-password', {
            token: '',
            error: 'Token no válido',
            success: ''
        });
    }
    
    if (password !== confirmPassword) {
        return res.render('reset-password', {
            token: token,
            error: 'Las contraseñas no coinciden',
            success: ''
        });
    }
    
    if (password.length < 6) {
        return res.render('reset-password', {
            token: token,
            error: 'La contraseña debe tener al menos 6 caracteres',
            success: ''
        });
    }
    
    // Verificar token
    db.execute(
        'SELECT email FROM password_resets WHERE token = ? AND expires_at > NOW()',
        [token],
        async (err, results) => {
            if (err || results.length === 0) {
                return res.render('reset-password', {
                    token: '',
                    error: 'Token inválido o expirado',
                    success: ''
                });
            }
            
            const email = results[0].email;
            
            try {
                // Encriptar nueva contraseña
                const hashedPassword = await bcrypt.hash(password, 10);
                
                // Actualizar contraseña
                db.execute(
                    'UPDATE users SET password = ? WHERE email = ?',
                    [hashedPassword, email],
                    (err, result) => {
                        if (err) {
                            console.error('❌ Error actualizando contraseña:', err);
                            return res.render('reset-password', {
                                token: token,
                                error: 'Error del servidor',
                                success: ''
                            });
                        }
                        
                        // Eliminar token
                        db.execute('DELETE FROM password_resets WHERE token = ?', [token]);
                        
                        console.log('✅ Contraseña actualizada para:', email);
                        
                        res.redirect('/login?success=Contraseña actualizada exitosamente. Ahora puedes iniciar sesión.');
                    }
                );
                
            } catch (error) {
                console.error('❌ Error encriptando contraseña:', error);
                return res.render('reset-password', {
                    token: token,
                    error: 'Error del servidor',
                    success: ''
                });
            }
        }
    );
});

// Ruta de logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Error al cerrar sesión:', err);
        }
        res.redirect('/login');
    });
});

module.exports = router;