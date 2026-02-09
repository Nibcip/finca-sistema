const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const db = mysql.createConnection({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306
});

// Ruta principal
router.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const cattleQuery = 'SELECT * FROM cattle ORDER BY id';
    const pigsQuery = 'SELECT * FROM pigs ORDER BY id';
    
    db.execute(cattleQuery, (err, cattleResults) => {
        if (err) {
            console.error('❌ Error obteniendo ganado:', err);
            cattleResults = [];
        }
        
        db.execute(pigsQuery, (err, pigsResults) => {
            if (err) {
                console.error('❌ Error obteniendo porcinos:', err);
                pigsResults = [];
            }
            
            res.render('livestock', { 
                user: req.session.user, 
                cattle: cattleResults || [], 
                pigs: pigsResults || [],
                error: req.session.error || null,
                success: req.session.success || null
            });
            
            // Limpiar mensajes de sesión
            delete req.session.error;
            delete req.session.success;
        });
    });
});

// Agregar nuevo animal
router.post('/add-animal', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { type, id, name, breed, age, weight, status } = req.body;
    
    let query, table;
    if (type === 'cattle') {
        table = 'cattle';
        query = 'INSERT INTO cattle (id, name, breed, age, weight, status, last_update) VALUES (?, ?, ?, ?, ?, ?, CURDATE())';
    } else if (type === 'pig') {
        table = 'pigs';
        query = 'INSERT INTO pigs (id, name, breed, age, weight, status, last_update) VALUES (?, ?, ?, ?, ?, ?, CURDATE())';
    } else {
        return res.status(400).json({ error: 'Tipo de animal inválido' });
    }

    db.execute(query, [id, name, breed, age, weight, status], (err, results) => {
        if (err) {
            console.error(`❌ Error agregando ${type}:`, err);
            return res.status(500).json({ error: `Error al agregar ${type}` });
        }
        
        req.session.success = 'Animal agregado correctamente';
        res.json({ success: true, message: 'Animal agregado correctamente' });
    });
});

// Obtener detalles de un animal
router.get('/animal/:type/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { type, id } = req.params;
    let query;
    
    if (type === 'cattle') {
        query = 'SELECT * FROM cattle WHERE id = ?';
    } else if (type === 'pig') {
        query = 'SELECT * FROM pigs WHERE id = ?';
    } else {
        return res.status(400).json({ error: 'Tipo de animal inválido' });
    }

    db.execute(query, [id], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo animal:', err);
            return res.status(500).json({ error: 'Error al obtener animal' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Animal no encontrado' });
        }
        
        res.json({ success: true, animal: results[0] });
    });
});

// Exportar datos
router.post('/export', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { type, format } = req.body;
    let query;
    let filename = '';

    if (type === 'cattle') {
        query = 'SELECT * FROM cattle ORDER BY id';
        filename = 'ganado';
    } else if (type === 'pigs') {
        query = 'SELECT * FROM pigs ORDER BY id';
        filename = 'porcinos';
    } else if (type === 'all') {
        // Obtener ambos tipos
        const cattleQuery = 'SELECT *, "Ganado" as tipo FROM cattle';
        const pigsQuery = 'SELECT *, "Porcino" as tipo FROM pigs';
        
        db.execute(cattleQuery, (err, cattleResults) => {
            if (err) {
                console.error('❌ Error obteniendo ganado para exportar:', err);
                cattleResults = [];
            }
            
            db.execute(pigsQuery, (err, pigsResults) => {
                if (err) {
                    console.error('❌ Error obteniendo porcinos para exportar:', err);
                    pigsResults = [];
                }
                
                const allAnimals = [...cattleResults, ...pigsResults];
                handleExportResponse(res, format, allAnimals, 'todos_los_animales');
            });
        });
        return;
    } else {
        return res.status(400).json({ error: 'Tipo de exportación inválido' });
    }

    db.execute(query, (err, results) => {
        if (err) {
            console.error(`❌ Error obteniendo datos para exportar ${type}:`, err);
            return res.status(500).json({ error: 'Error al obtener datos' });
        }
        
        handleExportResponse(res, format, results, filename);
    });
});

// Función auxiliar para manejar la respuesta de exportación
function handleExportResponse(res, format, data, filename) {
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (format === 'csv') {
        res.json({
            success: true,
            data: data,
            filename: `${filename}_${timestamp}.csv`
        });
    } else if (format === 'excel') {
        res.json({
            success: true,
            data: data,
            filename: `${filename}_${timestamp}.xlsx`
        });
    } else if (format === 'pdf') {
        generateLivestockPDF(res, data);
    } else {
        res.status(400).json({ error: 'Formato de exportación inválido' });
    }
}

// Descargar archivo
router.get('/download/:filename', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { filename } = req.params;
    
    // Obtener datos basados en el nombre del archivo
    let query;
    if (filename.includes('ganado')) {
        query = 'SELECT * FROM cattle ORDER BY id';
    } else if (filename.includes('porcinos')) {
        query = 'SELECT * FROM pigs ORDER BY id';
    } else {
        // Todos los animales
        query = '(SELECT *, "Ganado" as tipo FROM cattle) UNION (SELECT *, "Porcino" as tipo FROM pigs) ORDER BY id';
    }

    db.execute(query, (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo datos para descargar:', err);
            return res.status(500).send('Error al obtener datos');
        }

        // Convertir a CSV
        const csv = convertToCSV(results);
        
        // Configurar headers para descarga
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Enviar CSV
        res.send(csv);
    });
});

// Función para convertir datos a CSV
function convertToCSV(data) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Encabezados
    csvRows.push(headers.join(','));
    
    // Filas de datos
    for (const row of data) {
        const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
        });
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
}

// Actualizar animal
router.put('/update-animal/:type/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { type, id } = req.params;
    const { name, breed, age, weight, status } = req.body;
    
    let query;
    if (type === 'cattle') {
        query = 'UPDATE cattle SET name = ?, breed = ?, age = ?, weight = ?, status = ?, last_update = CURDATE() WHERE id = ?';
    } else if (type === 'pig') {
        query = 'UPDATE pigs SET name = ?, breed = ?, age = ?, weight = ?, status = ?, last_update = CURDATE() WHERE id = ?';
    } else {
        return res.status(400).json({ error: 'Tipo de animal inválido' });
    }

    db.execute(query, [name, breed, age, weight, status, id], (err, results) => {
        if (err) {
            console.error(`❌ Error actualizando ${type}:`, err);
            return res.status(500).json({ error: `Error al actualizar ${type}` });
        }
        
        req.session.success = 'Animal actualizado correctamente';
        res.json({ success: true, message: 'Animal actualizado correctamente' });
    });
});

// Eliminar animal
router.delete('/delete-animal/:type/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { type, id } = req.params;
    let query;
    
    if (type === 'cattle') {
        query = 'DELETE FROM cattle WHERE id = ?';
    } else if (type === 'pig') {
        query = 'DELETE FROM pigs WHERE id = ?';
    } else {
        return res.status(400).json({ error: 'Tipo de animal inválido' });
    }

    db.execute(query, [id], (err, results) => {
        if (err) {
            console.error(`❌ Error eliminando ${type}:`, err);
            return res.status(500).json({ error: `Error al eliminar ${type}` });
        }
        
        req.session.success = 'Animal eliminado correctamente';
        res.json({ success: true, message: 'Animal eliminado correctamente' });
    });
});

function generateLivestockPDF(res, animals) {
    try {
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape',bufferPages: true });
        const fileName = `stock_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
        doc.pipe(res);
        
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#2E7D32')
            .text('GanaSys', 50, 50);
        
        doc.fontSize(16).font('Helvetica').fillColor('black')
            .text('Reporte de Animales', 50, 80);
        
        doc.fontSize(10).fillColor('gray')
            .text(`Generado el: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 50, 105);
        
        doc.moveTo(50, 120).lineTo(770, 120).strokeColor('#2E7D32').lineWidth(2).stroke();
        

        const totalAnimals = animals.length;
        const totalWeight = animals.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
        const avgWeight = totalAnimals > 0 ? (totalWeight / totalAnimals).toFixed(2) : 0;

        doc.fontSize(12).font('Helvetica-Bold').fillColor('black')
            .text('RESUMEN:', 50, 140);
        
        doc.fontSize(10).font('Helvetica')
            .text(`Total de Animales: ${totalAnimals}`, 50, 160)
            .text(`Peso Promedio Global: ${avgWeight} kg`, 200, 160);
        
        doc.moveDown(2);
        
        const tableTop = 200;
        const tableLeft = 50;
        const rowHeight = 20;
        
        const columns = [
            { label: 'ID', width: 40, align: 'left' },
            { label: 'Nombre', width: 80, align: 'left' },
            { label: 'Raza', width: 100, align: 'left' },
            { label: 'Peso (kg)', width: 70, align: 'right' },
            { label: 'Edad', width: 60, align: 'center' },
            { label: 'Estado', width: 80, align: 'center' },
            { label: 'Tipo', width: 80, align: 'center' },
            { label: 'Ingreso', width: 80, align: 'right' },
            { label: 'Ubicación', width: 130, align: 'left' }
        ];

        let x = tableLeft;
        let y = tableTop;

        columns.forEach(col => {
            doc.rect(x, y, col.width, rowHeight).fill('#2e7d32');
            doc.fillColor("#ffffff").font('Helvetica-Bold').fontSize(10);
            doc.text(col.label, x + 5, y + 5, { width: col.width - 10, align: col.align });
            x += col.width;
        });

        y += rowHeight;
        animals.forEach((animal, index) => {
            if (y > 500) {
                doc.addPage();
                y = 50; 
                
                x = tableLeft;
                columns.forEach(col => {
                    doc.rect(x, y, col.width, rowHeight).fill('#2e7d32');
                    doc.fillColor("#ffffff").font('Helvetica-Bold').fontSize(10);
                    doc.text(col.label, x + 5, y + 5, { width: col.width - 10, align: col.align });
                    x += col.width;
                });
                y += rowHeight;
            }

            if (index % 2 === 0) {
                let rowWidth = columns.reduce((acc, col) => acc + col.width, 0);
                doc.rect(tableLeft, y, rowWidth, rowHeight - 2).fill('#F8F9FA');
            }

            doc.fillColor("#000000").font('Helvetica').fontSize(9);


            const fechaFormated = new Date(animal.last_update).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

            const rowData = [
                animal.id || '-',
                animal.name, 
                animal.breed || 'N/A',
                animal.weight ? `${animal.weight}` : '0',
                animal.age  || 'N/A',
                animal.status || 'Activo',
                animal.tipo || (animal.type === 'cattle' ? 'Ganado' : 'Porcino'), // Usa 'tipo' del SQL 'all' o infiere
                fechaFormated || 'N/A',
                animal.location || 'Corral General'
            ];

            x = tableLeft;
            rowData.forEach((text, i) => {
                const col = columns[i];
                doc.text(text, x + 5, y + 4, { width: col.width - 10, align: col.align });
                x += col.width;
            });

            y += rowHeight;
        });

        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            const pageHeight = doc.page.height;
            doc.fontSize(8).fillColor('gray')
                .text(`Página ${i + 1} de ${pageCount}`, 50, pageHeight - 50, { align: 'left' })
                .text('GanaSys © 2024', 700, pageHeight - 50, { align: 'right' });
        }

        doc.end();

    } catch (error) {
        console.error('Error generando PDF', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error generando el reporte PDF' });
        }
    }
}



module.exports = router;