const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
// Ruta principal
router.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const vaccinationsQuery = `
        SELECT v.*, 
               COALESCE(c.name, p.name) as animal_name,
               CASE WHEN v.animal_type = 'cattle' THEN c.breed ELSE p.breed END as breed,
               t.treatment as nombre_tratamiento,
               t.dosage as dosage,
               t.start_date as start_date,
               t.end_date as end_date,
               t.observations as observations,
               v.animal_type
        FROM vaccinations v
        LEFT JOIN cattle c ON v.animal_id = c.id AND v.animal_type = 'cattle'
        LEFT JOIN pigs p ON v.animal_id = p.id AND v.animal_type = 'pig'
        LEFT JOIN treatments t ON v.id = t.vaccination_id
        ORDER BY v.date DESC
        LIMIT 50
    `;
    
    db.execute(vaccinationsQuery, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo vacunaciones:', err);
            results = [];
        }
        
        // Obtener estadísticas
        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM vaccinations WHERE MONTH(date) = MONTH(CURRENT_DATE)) as monthly_vaccinations,
                (SELECT COUNT(*) FROM vaccinations WHERE status = 'Pendiente') as active_treatments,
                (SELECT COUNT(*) FROM vaccinations WHERE status = 'Vencida') as expired_vaccines
        `;
        
        db.execute(statsQuery, (err, statsResults) => {
            if (err) {
                console.error('❌ Error obteniendo estadísticas:', err);
                statsResults = [{}];
            }
            
            // Obtener actividades (las próximas 5)
            const activitiesQuery = `
                SELECT * FROM health_activities 
                WHERE scheduled_date >= CURDATE() 
                ORDER BY scheduled_date ASC 
                LIMIT 5
            `;
            
            db.execute(activitiesQuery, (err, activities) => {
                if (err) {
                    console.error('❌ Error obteniendo actividades:', err);
                    activities = [];
                }
                
                // Obtener vacunas próximas a vencer
                const pendingVaccinesQuery = `
                    SELECT vaccine, COUNT(*) as count, status 
                    FROM vaccinations 
                    WHERE status = 'Pendiente' 
                    GROUP BY vaccine 
                    ORDER BY date ASC 
                    LIMIT 3
                `;
                
                db.execute(pendingVaccinesQuery, (err, pendingVaccines) => {
                    if (err) {
                        console.error('❌ Error obteniendo vacunas pendientes:', err);
                        pendingVaccines = [];
                    }
                    
                    // Calcular próxima vacunación
                    const nextVaccinationQuery = `
                        SELECT COUNT(*) as count 
                        FROM vaccinations 
                        WHERE status = 'Pendiente' 
                        AND date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
                    `;
                    
                    db.execute(nextVaccinationQuery, (err, nextVaccinationResult) => {
                        const nextVaccinationCount = nextVaccinationResult && nextVaccinationResult[0] ? nextVaccinationResult[0].count : 0;
                        
                        // Asegurar que todas las variables estén definidas
                        const renderData = {
                            user: req.session.user, 
                            vaccinations: results || [],
                            stats: {
                                monthly_vaccinations: (statsResults[0] && statsResults[0].monthly_vaccinations) || 0,
                                active_treatments: (statsResults[0] && statsResults[0].active_treatments) || 0,
                                expired_vaccines: (statsResults[0] && statsResults[0].expired_vaccines) || 0,
                                next_vaccination: nextVaccinationCount || 0
                            },
                            activities: activities || [],
                            pendingVaccines: pendingVaccines || [],
                            error: req.session.error || null,
                            success: req.session.success || null
                        };
                        
                        // Limpiar mensajes de sesión
                        delete req.session.error;
                        delete req.session.success;
                        
                        // Renderizar la vista con todos los datos
                        res.render('health', renderData);
                    });
                });
            });
        });
    });
});

// Generar reporte de vacunaciones
router.get('/generate-report', (req, res) => {
    if (!req.session.user) {
        return res.status(403).send('No autorizado');
    }

    const { animal_type, period, start_date, end_date, status, format } = req.query;
    
    let query = `
        SELECT v.*, 
               t.treatment as nombre_tratamiento,
               t.dosage as dosage,
               t.start_date as start_date,
               t.end_date as end_date,
               t.observations as observations,
               COALESCE(c.name, p.name) as animal_name,
               CASE WHEN v.animal_type = 'cattle' THEN c.breed ELSE p.breed END as breed,
               CASE WHEN v.animal_type = 'cattle' THEN 'Ganado' ELSE 'Porcino' END as tipo_animal
        FROM vaccinations v
        LEFT JOIN treatments t ON v.id = t.vaccination_id
        LEFT JOIN cattle c ON v.animal_id = c.id AND v.animal_type = 'cattle'
        LEFT JOIN pigs p ON v.animal_id = p.id AND v.animal_type = 'pig'
        WHERE 1=1
    `;
    
    const params = [];
    
    // Filtro por tipo de animal
    if (animal_type && animal_type !== 'all') {
        query += ' AND v.animal_type = ?';
        params.push(animal_type);
    }
    
    // Filtro por periodo
    if (period && period !== 'all') {
        switch(period) {
            case 'today':
                query += ' AND DATE(v.date) = CURDATE()';
                break;
            case 'week':
                query += ' AND YEARWEEK(v.date, 1) = YEARWEEK(CURDATE(), 1)';
                break;
            case 'month':
                query += ' AND MONTH(v.date) = MONTH(CURDATE()) AND YEAR(v.date) = YEAR(CURDATE())';
                break;
            case 'quarter':
                query += ' AND QUARTER(v.date) = QUARTER(CURDATE()) AND YEAR(v.date) = YEAR(CURDATE())';
                break;
            case 'year':
                query += ' AND YEAR(v.date) = YEAR(CURDATE())';
                break;
            case 'custom':
                if (start_date) {
                    query += ' AND v.date >= ?';
                    params.push(start_date);
                }
                if (end_date) {
                    query += ' AND v.date <= ?';
                    params.push(end_date);
                }
                break;
        }
    }
    
    // Filtro por estado
    if (status && status !== 'all') {
        query += ' AND v.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY v.date DESC';
    
    db.execute(query, params, (err, results) => {
        results ? console.log('ON'): console.log('OFF');
        if (err) {
            console.error('❌ Error generando reporte:', err);
            return res.status(500).send('Error al generar reporte');
        }
        
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        let filename = `reporte_vacunaciones_${timestamp}`;

        if (format === 'csv') {
            const csv = convertToCSV(results);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            res.send(csv);
        } else if (format === 'excel') {
            // Para Excel, podemos devolver CSV que Excel puede abrir
            const csv = convertToCSV(results);
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            res.send(csv);
        } else {
            generateHealthPDF(res, results, filename);
        }
    });
});

// Función para convertir datos a CSV
function convertToCSV(data) {
    if (data.length === 0) return 'No hay datos para mostrar';
    
    const headers = ['ID Animal', 'Nombre', 'Tipo', 'Raza', 'Vacuna',, 'Tratamientos', 'Fecha', 'Estado'];  
    const csvRows = [];
    
    // Encabezados
    csvRows.push(headers.join(','));
    
    // Filas de datos
    for (const row of data) {
    const tratamientoInfo = row.nombre_tratamiento ? 
        `${row.nombre_tratamiento} - ${row.dosage} dosis - ${new Date(row.start_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} al ${new Date(row.end_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}${row.observations ? ' / ' + row.observations.replace(/"/g, '""') : ''}` 
        : 'N/A';

    const values = [
        row.animal_id || 'N/A',
        `"${(row.animal_name || '').replace(/"/g, '""')}"`,
        row.animal_type === 'cattle' ? 'Ganado' : 'Porcino',
        `"${(row.breed || '').replace(/"/g, '""')}"`,
        `"${(row.vaccine || '').replace(/"/g, '""')}"`,
        `"${tratamientoInfo}"`,
        row.date ? new Date(row.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A',
        row.status || 'N/A'
    ];
    
    csvRows.push(values.join(','));
}
    
    return csvRows.join('\n');
}



// Función para obtener texto de filtros
function getFilterText(filters) {
    const texts = [];
    
    if (filters.animal_type && filters.animal_type !== 'all') {
        texts.push(`Tipo: ${filters.animal_type === 'cattle' ? 'Ganado' : 'Porcinos'}`);
    }
    
    if (filters.period && filters.period !== 'all') {
        const periodTexts = {
            'today': 'Hoy',
            'week': 'Esta semana',
            'month': 'Este mes',
            'quarter': 'Este trimestre',
            'year': 'Este año',
            'custom': 'Personalizado'
        };
        texts.push(`Periodo: ${periodTexts[filters.period]}`);
        
        if (filters.period === 'custom' && filters.start_date && filters.end_date) {
            texts.push(`Desde: ${filters.start_date} hasta: ${filters.end_date}`);
        }
    }
    
    if (filters.status && filters.status !== 'all') {
        texts.push(`Estado: ${filters.status}`);
    }
    
    return texts.length > 0 ? texts.join(' | ') : 'Sin filtros aplicados';
}

// Obtener animales por tipo
router.post('/get-animals', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { animal_type } = req.body;
    
    let query = '';
    if (animal_type === 'cattle') {
        query = 'SELECT id, name, breed FROM cattle WHERE status = "activo"';
    } else if (animal_type === 'pig') {
        query = 'SELECT id, name, breed FROM pigs WHERE status = "activo"';
    } else {
        return res.json([]);
    }
    
    db.execute(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo animales:', err);
            return res.json([]);
        }
        res.json(results);
    });
});

// Agregar nueva vacunación
router.post('/add-vaccination', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { treatment, dosage, start_date, end_date, observations, animal_id, animal_type, vaccine, date, status } = req.body;

    const queryVaccination = 'INSERT INTO vaccinations (animal_id, animal_type, vaccine, date, status) VALUES (?, ?, ?, ?, ?)';

    db.execute(queryVaccination, [animal_id, animal_type, vaccine, date, status], (err, results) => {
        if (err) {
            console.error('❌ Error agregando vacunación:', err);
            return res.status(500).json({ error: 'Error al agregar vacunación' });
        }

        const newVaccinationId = results.insertId;

        const queryTreatment = `
            INSERT INTO treatments (vaccination_id, treatment, dosage, start_date, end_date, observations, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'activo')
        `;

        db.execute(queryTreatment, [newVaccinationId, treatment, dosage, start_date, end_date, observations], (err, resultsTrat) => {
            if (err) {
                console.error('❌ Error agregando tratamiento:', err);
                return res.status(500).json({ error: 'Error al agregar tratamiento' });
            }

            res.json({ 
                success: true, 
                message: 'Vacunación y tratamiento registrados correctamente',
                vaccination_id: newVaccinationId 
            });
        });
    });
});


/*
router.post('/add-treatment', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { vaccination_id, treatment, dosage, start_date, end_date, observations } = req.body;
    
    const query = `
        INSERT INTO treatments (vaccination_id, treatment, dosage, start_date, end_date, observations, status) 
        VALUES (?, ?, ?, ?, ?, ?, 'activo')
    `;
    
    db.execute(query, [vaccination_id, treatment, dosage, start_date, end_date, observations], (err, results) => {
        if (err) {
            console.error('❌ Error agregando tratamiento:', err);
            req.session.error = 'Error al agregar tratamiento';
            return res.status(500).json({ error: 'Error al agregar tratamiento' });
        }
        
        req.session.success = 'Tratamiento agregado correctamente';
        res.json({ success: true, message: 'Tratamiento agregado correctamente' });
    });
});*/


// Actualizar vacunación
router.put('/update-vaccination/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const vaccinationId = req.params.id;
    const { vaccine, date, status } = req.body;
    
    const query = 'UPDATE vaccinations SET vaccine = ?, date = ?, status = ? WHERE id = ?';
    db.execute(query, [vaccine, date, status, vaccinationId], (err, results) => {
        if (err) {
            console.error('❌ Error actualizando vacunación:', err);
            req.session.error = 'Error al actualizar vacunación';
            return res.status(500).json({ error: 'Error al actualizar vacunación' });
        }
        
        req.session.success = 'Vacunación actualizada correctamente';
        res.json({ success: true, message: 'Vacunación actualizada correctamente' });
    });
});

// Agregar tratamiento

// Agregar nueva actividad
router.post('/add-activity', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { activity_type, description, scheduled_date, frequency, priority } = req.body;
    
    const query = `
        INSERT INTO health_activities (activity_type, description, scheduled_date, frequency, priority, status) 
        VALUES (?, ?, ?, ?, ?, 'programada')
    `;
    
    db.execute(query, [activity_type, description, scheduled_date, frequency, priority], (err, results) => {
        if (err) {
            console.error('❌ Error agregando actividad:', err);
            req.session.error = 'Error al agregar actividad';
            return res.status(500).json({ error: 'Error al agregar actividad' });
        }
        
        req.session.success = 'Actividad programada correctamente';
        res.json({ success: true, message: 'Actividad programada correctamente' });
    });
});

// Obtener tratamientos por vacunación
router.get('/get-treatments/:vaccination_id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const query = 'SELECT * FROM treatments WHERE vaccination_id = ? ORDER BY start_date DESC';
    db.execute(query, [req.params.vaccination_id], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo tratamientos:', err);
            return res.json([]);
        }
        res.json(results);
    });
});

// Obtener actividades recientes
router.get('/get-activities', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const query = `
        SELECT * FROM health_activities 
        WHERE scheduled_date >= CURDATE() 
        ORDER BY scheduled_date ASC 
        LIMIT 10
    `;
    
    db.execute(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo actividades:', err);
            return res.json([]);
        }
        res.json(results);
    });
});

// Actualizar estado de actividad
router.put('/update-activity/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { status } = req.body;
    const query = 'UPDATE health_activities SET status = ? WHERE id = ?';
    
    db.execute(query, [status, req.params.id], (err, results) => {
        if (err) {
            console.error('❌ Error actualizando actividad:', err);
            return res.status(500).json({ error: 'Error al actualizar actividad' });
        }
        res.json({ success: true, message: 'Actividad actualizada' });
    });
});

// Eliminar actividad 
router.delete('/delete-activity/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const query = 'DELETE FROM health_activities WHERE id = ?';
    db.execute(query, [req.params.id], (err, results) => {
        if (err) {
            console.error('❌ Error eliminando actividad:', err);
            return res.status(500).json({ error: 'Error al eliminar actividad' });
        }
        res.json({ success: true, message: 'Actividad eliminada' });
    });
});
// Eliminar vacunación
router.delete('/delete-vaccination/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const vaccinationId = req.params.id;
    
    
        // Si no hay tratamientos, proceder con la eliminación
        const deleteQuery = 'DELETE FROM vaccinations WHERE id = ?';
        
        db.execute(deleteQuery, [vaccinationId], (err, results) => {
            if (err) {
                console.error('❌ Error eliminando vacunación:', err);
                return res.status(500).json({ error: 'Error al eliminar vacunación' });
            }
            
            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Vacunación no encontrada' });
            }
            
            res.json({ 
                success: true, 
                message: 'Vacunación eliminada correctamente',
                affectedRows: results.affectedRows
            });
        });
    });
;


function generateHealthPDF(res, data, filename) {
    try {
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`);
        doc.pipe(res);
        doc.rect(0, 0, 842, 60).fill('#2E7D32'); // Fondo verde superior
        doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold').text('GanaSys - Reporte de Salud', 40, 20);
        
        doc.fillColor('#000000').fontSize(10).font('Helvetica')
           .text(`Fecha de impresión: ${new Date().toLocaleString()}`, 600, 70);

        const tableTop = 100;
        const colWidths = [30, 100, 80, 100, 80, 150, 100, 100]; // Total 680 aprox
        const headers = ['ID', 'Nombre', 'Tipo', 'Raza', 'Vacuna', 'Tratamientos','Fecha', 'Estado'];
        
        let y = tableTop;
        let x = 40;

        // Dibujar Encabezados de Tabla
        doc.font('Helvetica-Bold').fontSize(11);
        headers.forEach((header, i) => {
            doc.rect(x, y, colWidths[i], 25).fill('#E8F5E9').stroke('#2E7D32');
            doc.fillColor('#2E7D32').text(header, x + 5, y + 7, { width: colWidths[i] - 10, align: 'center' });
            x += colWidths[i];
        });

        y += 25;
        doc.font('Helvetica').fontSize(10).fillColor('#333333');
        
        data.forEach((item, index) => {

            const row = [

                item.animal_id || 'N/A',

                item.animal_name || 'N/A',

                item.animal_type === 'cattle' ? 'Ganado' : 'Porcino',

                item.breed || 'N/A',

                item.vaccine || 'N/A',

                item.nombre_tratamiento ? 

                    `${item.nombre_tratamiento} - ${item.dosage} dosis - ${new Date(item.start_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${new Date(item.end_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${item.observations ? '/ ' + item.observations : ''}` 
                    : 'N/A',
                item.date ? new Date(item.date).toLocaleDateString() : 'N/A',
                item.status || 'N/A'
            ];
            let maxRowHeight = 20; 
            row.forEach((text, i) => {
                const height = doc.heightOfString(text.toString(), {
                    width: colWidths[i] - 10
                });
                if (height > maxRowHeight) {
                    maxRowHeight = height;
              }
            });
            maxRowHeight += 10;
            if (y + maxRowHeight > 520) { 
                doc.addPage({ layout: 'landscape' });
                y = 50; 
            }
            if (index % 2 === 0) {
                doc.rect(40, y, colWidths.reduce((a, b) => a + b, 0), maxRowHeight).fill('#F9F9F9');

            }
            doc.fillColor('#333333');
            x = 40;
            row.forEach((text, i) => {
                doc.text(text.toString(), x + 5, y + 5, { 
                    width: colWidths[i] - 10, 
                    align: 'center' 
                });
                x += colWidths[i];
            });

            doc.moveTo(40, y + maxRowHeight).lineTo(40 + colWidths.reduce((a, b) => a + b, 0), y + maxRowHeight)
               .strokeColor('#DDDDDD').lineWidth(0.5).stroke();

            y += maxRowHeight;

        });


        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).fillColor('gray').text(
                `Página ${i + 1} de ${pageCount} - GanaSys Software Ganadero`,
                40, 560, { align: 'center' }
            );
        }

        doc.end();

    } catch (error) {
        console.error("Error PDF:", error);
        res.status(500).send("No se pudo generar el PDF");
    }
}

module.exports = router;