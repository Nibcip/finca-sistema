// Archivo: reproduction.js (versión corregida)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const dayjs = require('dayjs');
const pool = require('../config/database'),promise();


// Middleware para verificar autenticación
const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        console.log('⚠️ Usuario no autenticado, redirigiendo');
        return res.redirect('/login');
    }
    next();
};

// Ruta principal (VERSIÓN CORREGIDA)
router.get('/', requireAuth, async (req, res) => {
    try {
        console.log('📍 Accediendo a ruta /reproduction');
        
        // Obtener reproducciones de la base de datos
        const [reproducciones] = await pool.execute(`
            SELECT 
                r.*,
                CASE 
                    WHEN r.animal_type = 'cattle' THEN c.name
                    WHEN r.animal_type = 'pig' THEN p.name
                END as animal_name,
                CASE 
                    WHEN r.animal_type = 'cattle' THEN c.breed
                    WHEN r.animal_type = 'pig' THEN p.breed
                END as breed
            FROM reproducciones r
            LEFT JOIN cattle c ON r.animal_type = 'cattle' AND r.animal_id = c.id
            LEFT JOIN pigs p ON r.animal_type = 'pig' AND r.animal_id = p.id
            ORDER BY r.fecha_cubricion DESC
        `);
        
        // ... resto del código permanece igual ...
        
        const [gestacionesResult] = await pool.execute(
            "SELECT COUNT(*) as count FROM reproducciones WHERE estado = 'gestación'"
        );
        
        const [partosResult] = await pool.execute(
            "SELECT COUNT(*) as count FROM reproducciones WHERE estado = 'parto_exitoso'"
        );
        
        const [proximosResult] = await pool.execute(
            `SELECT COUNT(*) as count FROM reproducciones 
             WHERE estado = 'gestacion' 
             AND fecha_parto_estimada BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
        );
        
        const [anioResult] = await pool.execute(
            "SELECT COUNT(*) as count FROM reproducciones WHERE YEAR(created_at) = YEAR(CURDATE())"
        );
        
        const stats = {
            gestaciones_activas: gestacionesResult[0]?.count || 0,
            partos_exitosos: partosResult[0]?.count || 0,
            proximos_partos: proximosResult[0]?.count || 0,
            reproducciones_anio: anioResult[0]?.count || 0
        };
        
        console.log('📊 Estadísticas calculadas:', stats);
        
  
        const reproduccionesFormateadas = reproducciones.map(rep => ({
            ...rep,
            fecha_cubricion: dayjs(rep.fecha_cubricion).format('YYYY-MM-DD'),
            fecha_parto_estimada: rep.fecha_parto_estimada ? dayjs(rep.fecha_parto_estimada).format('YYYY-MM-DD') : 'N/A',
            fecha_parto_real: rep.fecha_parto_real ? dayjs(rep.fecha_parto_real).format('YYYY-MM-DD') : null
        }));
        
        res.render('reproduction', {
            user: req.session.user,
            reproducciones: reproduccionesFormateadas,
            stats: stats,
            error: req.query.error || null,
            success: req.query.success || null
        });
        
    } catch (error) {
        console.error('❌ Error en ruta /reproduction:', error);
        // Datos de ejemplo en caso de error
        res.render('reproduction', {
            user: req.session.user,
            reproducciones: [],
            stats: {
                gestaciones_activas: 0,
                partos_exitosos: 0,
                proximos_partos: 0,
                reproducciones_anio: 0
            },
            error: 'Error al cargar datos: ' + error.message,
            success: null
        });
    }
});

// API: Obtener animales por tipo (VERSIÓN CORREGIDA)
router.get('/api/animals/:type', requireAuth, async (req, res) => {
    try {
        const { type } = req.params;
        let animals = [];

        if (type === 'cattle') {
            const [result] = await pool.execute(`
                SELECT id, name, breed 
                FROM cattle 
                WHERE status = 'activo'
                ORDER BY name
            `);
            animals = result;
        } else if (type === 'pig') {
            const [result] = await pool.execute(`
                SELECT id, name, breed 
                FROM pigs 
                WHERE status = 'activo'
                ORDER BY name
            `);
            animals = result;
        } else {
            return res.status(400).json({ error: 'Tipo de animal no válido' });
        }

        res.json(animals);
        
    } catch (error) {
        console.error('❌ Error en API animales:', error);
        res.status(500).json({ error: 'Error al obtener animales' });
    }
});
// API: Agregar nueva reproducción
router.post('/add', requireAuth, async (req, res) => {
    try {
        const { animal_id, animal_type, tipo, fecha_cubricion, observaciones, toro_verracion } = req.body;
        
        console.log('📝 Datos recibidos:', req.body);
        
        if (!animal_id || !animal_type || !tipo || !fecha_cubricion) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos' 
            });
        }
        
        // Calcular fecha estimada de parto (280 días para ganado, 114 días para porcinos)
        let diasGestacion = animal_type === 'cattle' ? 280 : 114;
        let fechaPartoEstimada = dayjs(fecha_cubricion).add(diasGestacion, 'day').format('YYYY-MM-DD');
        
        console.log('📅 Fecha parto estimada calculada:', fechaPartoEstimada);
        
        const [result] = await pool.execute(`
            INSERT INTO reproducciones 
            (animal_id, animal_type, tipo, fecha_cubricion, fecha_parto_estimada, estado, observaciones, toro_verracion)
            VALUES (?, ?, ?, ?, ?, 'gestacion', ?, ?)
        `, [animal_id, animal_type, tipo, fecha_cubricion, fechaPartoEstimada, observaciones || '', toro_verracion || '']);
        
        console.log('✅ Reproducción insertada, ID:', result.insertId);
        
        res.json({ 
            success: true, 
            message: 'Reproducción registrada correctamente',
            id: result.insertId
        });
        
    } catch (error) {
        console.error('❌ Error al registrar reproducción:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al registrar reproducción: ' + error.message 
        });
    }
});

// API: Registrar parto - VERSIÓN CORREGIDA
router.post('/registrar-parto', requireAuth, async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        const { reproduccion_id, fecha_parto_real, crias_vivas, crias_muertas, peso_promedio, complicaciones } = req.body;
        
        console.log('👶 Datos para registrar parto:', req.body);
        
        if (!reproduccion_id || !fecha_parto_real || crias_vivas === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Faltan campos requeridos' 
            });
        }
        
        // Primero verificar que la reproducción existe y está en gestación
        const [reproduccion] = await connection.execute(
            'SELECT id, estado FROM reproducciones WHERE id = ?',
            [reproduccion_id]
        );
        
        if (reproduccion.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Reproducción no encontrada' 
            });
        }
        
        if (reproduccion[0].estado !== 'gestacion') {
            return res.status(400).json({ 
                success: false, 
                message: 'Solo se pueden registrar partos en reproducciones en estado de gestación' 
            });
        }
        
        // Registrar el parto
        await connection.execute(`
            UPDATE reproducciones 
            SET 
                estado = 'parto_exitoso',
                fecha_parto_real = ?,
                crias_vivas = ?,
                crias_muertas = ?,
                peso_promedio = ?,
                complicaciones = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [
            fecha_parto_real, 
            parseInt(crias_vivas) || 0, 
            parseInt(crias_muertas) || 0, 
            peso_promedio ? parseFloat(peso_promedio) : null, 
            complicaciones || '', 
            reproduccion_id
        ]);
        
        console.log('✅ Parto registrado exitosamente para reproducción ID:', reproduccion_id);
        
        res.json({ 
            success: true, 
            message: 'Parto registrado correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error al registrar parto:', error);
        console.error('Detalles del error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error al registrar parto: ' + error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// API: Obtener detalles de reproducción
router.get('/detail/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [rows] = await pool.execute(`
            SELECT 
                r.*,
                a.name as animal_name,
                a.breed
            FROM reproducciones r
            LEFT JOIN animales a ON r.animal_id = a.id
            WHERE r.id = ?
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Reproducción no encontrada' 
            });
        }
        
        const reproduccion = rows[0];
        
        // Formatear fechas
        if (reproduccion.fecha_cubricion) {
            reproduccion.fecha_cubricion = dayjs(reproduccion.fecha_cubricion).format('YYYY-MM-DD');
        }
        if (reproduccion.fecha_parto_estimada) {
            reproduccion.fecha_parto_estimada = dayjs(reproduccion.fecha_parto_estimada).format('YYYY-MM-DD');
        }
        if (reproduccion.fecha_parto_real) {
            reproduccion.fecha_parto_real = dayjs(reproduccion.fecha_parto_real).format('YYYY-MM-DD');
        }
        
        res.json({ 
            success: true, 
            data: reproduccion 
        });
        
    } catch (error) {
        console.error('❌ Error al obtener detalles:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener detalles: ' + error.message 
        });
    }
});

// API: Eliminar reproducción
router.post('/delete/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await pool.execute('DELETE FROM reproducciones WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Reproducción no encontrada' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Reproducción eliminada correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error al eliminar reproducción:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar reproducción: ' + error.message 
        });
    }
});

// API: Editar reproducción
router.post('/edit/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo, fecha_cubricion, observaciones, toro_verracion } = req.body;
        
        if (!fecha_cubricion) {
            return res.status(400).json({ 
                success: false, 
                message: 'Fecha de cubrición es requerida' 
            });
        }
        
        // Obtener reproducción actual para recalcular fecha de parto
        const [rows] = await pool.execute('SELECT animal_type FROM reproducciones WHERE id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Reproducción no encontrada' 
            });
        }
        
        const { animal_type } = rows[0];
        let diasGestacion = animal_type === 'cattle' ? 280 : 114;
        let fechaPartoEstimada = dayjs(fecha_cubricion).add(diasGestacion, 'day').format('YYYY-MM-DD');
        
        await pool.execute(`
            UPDATE reproducciones 
            SET 
                tipo = ?,
                fecha_cubricion = ?,
                fecha_parto_estimada = ?,
                observaciones = ?,
                toro_verracion = ?,
                updated_at = NOW()
            WHERE id = ?
        `, [tipo, fecha_cubricion, fechaPartoEstimada, observaciones || '', toro_verracion || '', id]);
        
        res.json({ 
            success: true, 
            message: 'Reproducción actualizada correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error al editar reproducción:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al editar reproducción: ' + error.message 
        });
    }
});

// Ruta de prueba de conexión
router.get('/test', async (req, res) => {
    try {
        await pool.execute('SELECT 1');
        
        // Verificar tabla reproducciones
        const [reproducciones] = await pool.execute('SELECT COUNT(*) as count FROM reproducciones');
        const [animales] = await pool.execute('SELECT COUNT(*) as count FROM animales');
        const [columns] = await pool.execute('SHOW COLUMNS FROM reproducciones');
        
        res.json({ 
            status: 'ok', 
            message: 'Conexión a base de datos exitosa',
            detalles: {
                reproducciones_count: reproducciones[0].count,
                animales_count: animales[0].count,
                columnas_reproducciones: columns.map(c => c.Field)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Error de conexión a base de datos',
            error: error.message 
        });
    }
});

// Ruta para verificar estructura de base de datos
router.get('/debug-db', requireAuth, async (req, res) => {
    try {
        const [reproducciones] = await pool.execute('SELECT * FROM reproducciones LIMIT 5');
        const [estadisticas] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN estado = 'gestacion' THEN 1 END) as gestaciones,
                COUNT(CASE WHEN estado = 'parto_exitoso' THEN 1 END) as partos
            FROM reproducciones
        `);
        
        res.json({
            reproducciones: reproducciones,
            estadisticas: estadisticas[0],
            fecha_actual: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;
