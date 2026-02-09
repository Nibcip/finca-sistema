const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// Obtener la conexión a la base de datos
let db;
router.use((req, res, next) => {
    db = req.app.locals.getDbConnection();
    next();
});

// Ruta de prueba para verificar que funciona
router.get('/test', (req, res) => {
    console.log('✅ TEST: Ruta /users/test funcionando');
    res.json({ 
        success: true, 
        message: 'Router de usuarios funcionando perfectamente' 
    });
});

router.get('/test/:id', (req, res) => {
    console.log('✅ TEST: Ruta /users/test/' + req.params.id + ' funcionando');
    res.json({ 
        success: true, 
        message: 'Ruta con parámetro funcionando',
        id: req.params.id
    });
});

// Ruta principal - Página de usuarios
router.get('/', (req, res) => {
    console.log('📥 Accediendo a página de usuarios');
    
    if (!req.session.user) {
        return res.redirect('/login');
    }


    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        console.log('⚠️ Usuario no es admin, redirigiendo a dashboard');
        return res.redirect('/dashboard');
    }

    const query = 'SELECT * FROM users ORDER BY name';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo usuarios:', err);
            return res.render('users', { 
                user: req.session.user, 
                users: [],
                error: 'Error al cargar los usuarios'
            });
        }
        
        console.log(`✅ Enviando ${results.length} usuarios a la vista`);
        res.render('users', { 
            user: req.session.user, 
            users: results,
            error: null
        });
    });
});

// Ruta para OBTENER UN USUARIO (para editar)
router.get('/:id', (req, res) => {
    console.log('📥 GET /users/' + req.params.id + ' solicitado');
    
    // Verificar sesión
    if (!req.session.user) {
        return res.status(401).json({ 
            success: false, 
            error: 'No has iniciado sesión' 
        });
    }

    // Verificar que sea administrador
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        return res.status(403).json({ 
            success: false, 
            error: 'Solo administradores pueden ver usuarios' 
        });
    }

    const userId = req.params.id;
    
    // 🆕 MODIFICADO: Incluir el campo status en la consulta
    const query = 'SELECT id, name, email, role, status FROM users WHERE id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo usuario:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error del servidor' 
            });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        console.log('✅ Usuario encontrado:', results[0]);
        res.json({ 
            success: true, 
            user: results[0] 
        });
    });
});

// 🆕 NUEVA RUTA: Cambiar estado de usuario
router.put('/:id/status', (req, res) => {
    console.log('🔄 PUT /users/' + req.params.id + '/status solicitado');
    
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        return res.status(403).json({ 
            success: false, 
            error: 'Solo administradores pueden cambiar estados de usuario' 
        });
    }

    const userId = req.params.id;
    const { status } = req.body;
    
    console.log('Cambiando estado:', { userId, status });
    
    // Validar el estado
    const validStatuses = ['activo', 'inactivo', 'reposo'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Estado no válido. Use: activo, inactivo o reposo' 
        });
    }

    // No permitir cambiar el estado del propio administrador
    if (parseInt(userId) === req.session.user.id && status !== 'activo') {
        return res.status(400).json({ 
            success: false, 
            error: 'No puedes desactivar tu propio usuario' 
        });
    }

    const query = 'UPDATE users SET status = ?, status_changed_at = NOW() WHERE id = ?';
    
    db.query(query, [status, userId], (err, results) => {
        if (err) {
            console.error('❌ Error cambiando estado:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error del servidor al cambiar estado' 
            });
        }
        
        if (results.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        console.log(`✅ Estado cambiado a "${status}" para usuario ID: ${userId}`);
        res.json({ 
            success: true, 
            message: `Estado cambiado a "${status}" correctamente`
        });
    });
});

// Ruta para CREAR usuario
router.post('/create', (req, res) => {
    console.log('📝 POST /users/create recibido');
    
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        return res.status(403).json({ 
            success: false, 
            error: 'Solo administradores pueden crear usuarios' 
        });
    }

    const { name, email, password, role, status } = req.body;
    
    console.log('Datos recibidos:', { name, email, role, status });
    
    // Validar datos
    if (!name || !email || !password || !role || !status) {
        return res.status(400).json({ 
            success: false, 
            error: 'Todos los campos son obligatorios' 
        });
    }

    if (password.length < 6) {
        return res.status(400).json({ 
            success: false, 
            error: 'La contraseña debe tener al menos 6 caracteres' 
        });
    }

    // Validar el estado
    const validStatuses = ['activo', 'inactivo', 'reposo'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Estado no válido. Use: activo, inactivo o reposo' 
        });
    }

    // Verificar si el email ya existe
    const checkQuery = 'SELECT id FROM users WHERE email = ?';
    db.query(checkQuery, [email], (err, results) => {
        if (err) {
            console.error('❌ Error verificando email:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error del servidor' 
            });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'El email ya está registrado' 
            });
        }

        // 🆕 MODIFICADO: Crear usuario con estado
        const insertQuery = 'INSERT INTO users (name, email, password, role, status, status_changed_at) VALUES (?, ?, ?, ?, ?, NOW())';
        db.query(insertQuery, [name, email, password, role, status], (err, results) => {
            if (err) {
                console.error('❌ Error creando usuario:', err);
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error al crear usuario' 
                });
            }
            
            console.log('✅ Usuario creado con ID:', results.insertId);
            res.json({ 
                success: true, 
                message: `Usuario ${name} creado correctamente`,
                user: {
                    id: results.insertId,
                    name,
                    email,
                    role,
                    status
                }
            });
        });
    });
});

// Ruta para ACTUALIZAR usuario
router.put('/:id', (req, res) => {
    console.log('✏️ PUT /users/' + req.params.id + ' solicitado');
    
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        return res.status(403).json({ 
            success: false, 
            error: 'Solo administradores pueden editar usuarios' 
        });
    }

    const userId = req.params.id;
    const { name, email, role, password, status } = req.body;
    
    console.log('Datos para actualizar:', { userId, name, email, role, status });
    
    // Validar datos
    if (!name || !email || !role || !status) {
        return res.status(400).json({ 
            success: false, 
            error: 'Nombre, email, rol y estado son obligatorios' 
        });
    }

    // Validar el estado
    const validStatuses = ['activo', 'inactivo', 'reposo'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            success: false, 
            error: 'Estado no válido. Use: activo, inactivo o reposo' 
        });
    }

    // No permitir desactivar el propio usuario
    if (parseInt(userId) === req.session.user.id && status !== 'activo') {
        return res.status(400).json({ 
            success: false, 
            error: 'No puedes desactivar tu propio usuario' 
        });
    }

    // Verificar email único (excepto el usuario actual)
    const checkQuery = 'SELECT id FROM users WHERE email = ? AND id != ?';
    db.query(checkQuery, [email, userId], (err, results) => {
        if (err) {
            console.error('❌ Error verificando email:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error del servidor' 
            });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'El email ya está en uso por otro usuario' 
            });
        }

        // 🆕 MODIFICADO: Si hay nueva contraseña
        if (password && password.trim() !== '') {
            if (password.length < 6) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'La contraseña debe tener al menos 6 caracteres' 
                });
            }
            
            // Actualizar con contraseña
            const updateQuery = 'UPDATE users SET name = ?, email = ?, role = ?, password = ?, status = ?, status_changed_at = NOW() WHERE id = ?';
            db.query(updateQuery, [name, email, role, password, status, userId], (err, results) => {
                if (err) {
                    console.error('❌ Error actualizando usuario:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error al actualizar usuario' 
                    });
                }
                
                if (results.affectedRows === 0) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Usuario no encontrado' 
                    });
                }
                
                console.log('✅ Usuario actualizado (con contraseña y estado)');
                res.json({ 
                    success: true, 
                    message: `Usuario ${name} actualizado correctamente`
                });
            });
        } else {
            // Actualizar sin cambiar contraseña
            const updateQuery = 'UPDATE users SET name = ?, email = ?, role = ?, status = ?, status_changed_at = NOW() WHERE id = ?';
            db.query(updateQuery, [name, email, role, status, userId], (err, results) => {
                if (err) {
                    console.error('❌ Error actualizando usuario:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Error al actualizar usuario' 
                    });
                }
                
                if (results.affectedRows === 0) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Usuario no encontrado' 
                    });
                }
                
                console.log('✅ Usuario actualizado (sin cambiar contraseña)');
                res.json({ 
                    success: true, 
                    message: `Usuario ${name} actualizado correctamente`
                });
            });
        }
    });
});

// Ruta para ELIMINAR usuario
router.delete('/:id', (req, res) => {
    console.log('🗑️ DELETE /users/' + req.params.id + ' solicitado');
    
    if (req.session.user.role !== 'admin' && req.session.user.role !== 'supervisor' && req.session.user.role !== 'operador') {
        return res.status(403).json({ 
            success: false, 
            error: 'Solo administradores pueden eliminar usuarios' 
        });
    }

    const userId = req.params.id;
    
    // No permitir auto-eliminación
    if (parseInt(userId) === req.session.user.id) {
        return res.status(400).json({ 
            success: false, 
            error: 'No puedes eliminar tu propio usuario' 
        });
    }

    const query = 'DELETE FROM users WHERE id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('❌ Error eliminando usuario:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error al eliminar usuario' 
            });
        }
        
        if (results.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        console.log('✅ Usuario eliminado ID:', userId);
        res.json({ 
            success: true, 
            message: 'Usuario eliminado correctamente' 
        });
    });
});

// 🆕 NUEVA RUTA: Verificar estado de usuario (para login)
router.get('/:id/check-status', (req, res) => {
    const userId = req.params.id;
    
    const query = 'SELECT status FROM users WHERE id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('❌ Error verificando estado:', err);
            return res.status(500).json({ 
                success: false, 
                error: 'Error del servidor' 
            });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        res.json({ 
            success: true, 
            status: results[0].status
        });
    });
});


module.exports = router;
