const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../config/database');

// Middleware de autenticación
const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

// Función para cuando la DB falla (Evita el error de "not defined")
function renderWithSampleData(res, user) {
    res.render('inventory', {
        user,
        inventory: [],
        stats: { total_items: 0, total_value: 0, out_of_stock: 0, low_stock: 0, cattle_value: 0, pig_value: 0, both_value: 0 },
        movements: [],
        foodTypes: [],
        title: 'Inventario (Modo Seguro)'
    });
}

// --- RUTA PRINCIPAL CON ESTADÍSTICAS ---
router.get('/', requireAuth, (req, res) => {
    const user = req.session.user;

    const inventoryQuery = `
        SELECT fi.*, ft.name as food_name, ft.category, ft.unit,
               CASE 
                   WHEN fi.quantity <= 0 THEN 'agotado'
                   WHEN fi.quantity <= fi.min_stock THEN 'bajo_stock'
                   WHEN fi.expiration_date IS NOT NULL AND fi.expiration_date < CURDATE() THEN 'vencido'
                   ELSE 'disponible'
               END as status,
               DATEDIFF(fi.expiration_date, CURDATE()) as days_to_expire,
               (fi.quantity * fi.unit_price) as total_value
        FROM food_inventory fi
        LEFT JOIN food_types ft ON fi.food_type_id = ft.id
        ORDER BY fi.id DESC
    `;

    const statsQuery = `
        SELECT 
            COUNT(*) as total_items,
            SUM(quantity * unit_price) as total_value,
            SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock,
            SUM(CASE WHEN quantity > 0 AND quantity <= min_stock THEN 1 ELSE 0 END) as low_stock,
            SUM(CASE WHEN animal_type = 'ganado' THEN (quantity * unit_price) ELSE 0 END) as cattle_value,
            SUM(CASE WHEN animal_type = 'porcino' THEN (quantity * unit_price) ELSE 0 END) as pig_value,
            SUM(CASE WHEN animal_type = 'ambos' THEN (quantity * unit_price) ELSE 0 END) as both_value
        FROM food_inventory
    `;

    const movementsQuery = `
        SELECT im.*, ft.name as food_name, ft.unit
        FROM inventory_movements im
        LEFT JOIN food_inventory fi ON im.inventory_id = fi.id
        LEFT JOIN food_types ft ON fi.food_type_id = ft.id
        ORDER BY im.movement_date DESC, im.created_at DESC
        LIMIT 10
    `;

    db.query(inventoryQuery, (err, inventory) => {
        if (err) return renderWithSampleData(res, user);

        db.query(statsQuery, (err, statsResult) => {
            if (err) return renderWithSampleData(res, user);
            const stats = statsResult[0] || {};

            db.query(movementsQuery, (err, movements) => {
                if (err) return renderWithSampleData(res, user);

                db.query("SELECT * FROM food_types ORDER BY name", (err, foodTypes) => {
                    res.render('inventory', {
                        user,
                        inventory: inventory || [],
                        stats: stats,
                        movements: movements || [],
                        foodTypes: foodTypes || [],
                        title: 'Inventario de Alimentos - GanaSys'
                    });
                });
            });
        });
    });
});

// (Mantén el resto de tus rutas de API: add, update, delete, etc. que ya tenías)
// No olvides exportar al final:

// --- API: AGREGAR ---
router.post('/api/add', requireAuth, (req, res) => {
    const { food_type_id, lot_number, quantity, unit_price, animal_type } = req.body;
    const total_value = quantity * unit_price;
    const query = `INSERT INTO food_inventory (food_type_id, lot_number, quantity, unit_price, total_value, animal_type, entry_date) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
    
    db.query(query, [food_type_id, lot_number, quantity, unit_price, total_value, animal_type], (err, result) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true });
    });
});

router.delete('/api/delete/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM food_inventory WHERE id = ?`;
    db.query(query, [id], (err, result) => {
        if (err) return res.json({ success: false, message: err.message });
        res.json({ success: true, message: 'Alimento eliminado' });
    });

});

// --- API: REPORTE EXCEL (CORREGIDO) ---
router.get('/api/report/excel', requireAuth, async (req, res) => {
    const type = req.query.type;
    const query = `SELECT fi.*, ft.name FROM food_inventory fi JOIN food_types ft ON fi.food_type_id = ft.id`;
    
    db.query(query, async (err, rows) => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Inventario');
        
        sheet.columns = [
            { header: 'Alimento', key: 'name', width: 20 },
            { header: 'Cantidad', key: 'quantity', width: 10 },
            { header: 'Precio', key: 'unit_price', width: 10 },
            { header: 'Total', key: 'total_value', width: 15 }
        ];

        rows.forEach(row => {
            sheet.addRow({
                name: row.name,
                quantity: row.quantity,
                unit_price: row.unit_price,
                total_value: row.quantity * row.unit_price
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    });
});

// API: Agregar nuevo alimento al inventario
router.post('/api/add', requireAuth, (req, res) => {
    console.log('📝 Recibiendo nuevo alimento:', req.body);

    
    const { food_type_id, lot_number, quantity, unit_price, supplier, entry_date, 
            expiration_date, storage_location, animal_type, min_stock, max_stock, notes } = req.body;
    
    // Calcular valor total
    const total_value = quantity * unit_price;
    
    if (!db) {
        // Modo demo
        return res.json({ 
            success: true, 
            message: 'Alimento agregado exitosamente (modo demo)',
            id: Date.now()
        });
    }
    
    const query = `
        INSERT INTO food_inventory 
        (food_type_id, lot_number, quantity, unit_price, total_value, supplier, 
         entry_date, expiration_date, storage_location, animal_type, min_stock, max_stock, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [food_type_id, lot_number, quantity, unit_price, total_value, supplier,
                    entry_date, expiration_date, storage_location, animal_type, min_stock, max_stock, notes];
    
    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error al agregar alimento:', err);
            return res.json({ success: false, message: 'Error en la base de datos' });
        }
        
        // Registrar movimiento de entrada
        const movementQuery = `
            INSERT INTO inventory_movements 
            (inventory_id, movement_type, quantity, reason, notes, responsable)
            VALUES (?, 'entrada', ?, 'Ingreso inicial', ?, ?)
        `;
        
        db.query(movementQuery, [result.insertId, quantity, notes || 'Ingreso inicial', req.session.user.name], (err) => {
            if (err) console.error('Error al registrar movimiento:', err);
        });
        
        res.json({ 
            success: true, 
            message: 'Alimento agregado exitosamente',
            id: result.insertId
        });
    });
});

// API: Actualizar alimento
router.put('/api/update', requireAuth, (req, res) => {
    console.log('✏️ Actualizando alimento:', req.body);
    
    
    const { id, food_name, lot_number, quantity, unit, unit_price, expiration_date, 
            category, storage_location, animal_type, min_stock, max_stock, notes } = req.body;
    
    if (!db) {
        // Modo demo
        return res.json({ 
            success: true, 
            message: 'Alimento actualizado exitosamente (modo demo)'
        });
    }
    
    // Primero obtener el alimento actual para registrar cambios
    db.query('SELECT quantity, unit_price FROM food_inventory WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: 'Alimento no encontrado' });
        }
        
        const oldQuantity = results[0].quantity;
        const oldPrice = results[0].unit_price;
        
        // Actualizar el alimento
        const updateQuery = `
            UPDATE food_inventory 
            SET lot_number = ?, quantity = ?, unit_price = ?, 
                expiration_date = ?, storage_location = ?, animal_type = ?, 
                min_stock = ?, max_stock = ?, notes = ?
            WHERE id = ?
        `;
        
        const values = [lot_number, quantity, unit_price, expiration_date, 
                       storage_location, animal_type, min_stock, max_stock, notes, id];
        
        db.query(updateQuery, values, (err, result) => {
            if (err) {
                console.error('Error al actualizar alimento:', err);
                return res.json({ success: false, message: 'Error en la base de datos' });
            }
            
            // Registrar movimiento si hubo cambio en la cantidad
            if (quantity !== oldQuantity) {
                const movementType = quantity > oldQuantity ? 'entrada' : 'salida';
                const movementQuantity = Math.abs(quantity - oldQuantity);
                
                const movementQuery = `
                    INSERT INTO inventory_movements 
                    (inventory_id, movement_type, quantity, reason, responsable)
                    VALUES (?, ?, ?, 'Actualización manual', ?)
                `;
                
                db.query(movementQuery, [id, movementType, movementQuantity, req.session.user.username], (err) => {
                    if (err) console.error('Error al registrar movimiento:', err);
                });
            }
            
            res.json({ 
                success: true, 
                message: 'Alimento actualizado exitosamente'
            });
        });
    });
});

// API: Obtener movimientos de un alimento
router.get('/api/movements/:id', requireAuth, (req, res) => {
    const itemId = req.params.id;
    console.log(`📋 Obteniendo movimientos para alimento ID: ${itemId}`);
    
    
    
    if (!db) {
        // Datos de ejemplo para modo demo
        const sampleMovements = [
            {
                movement_date: '2024-02-15',
                movement_type: 'entrada',
                quantity: 1000,
                unit: 'kg',
                responsable: 'Juan Pérez',
                reason: 'Compra mensual'
            },
            {
                movement_date: '2024-02-10',
                movement_type: 'salida',
                quantity: 500,
                unit: 'kg',
                responsable: 'María González',
                reason: 'Alimentación diaria'
            },
            {
                movement_date: '2024-02-05',
                movement_type: 'entrada',
                quantity: 2000,
                unit: 'kg',
                responsable: 'Carlos López',
                reason: 'Reabastecimiento'
            }
        ];
        
        return res.json({ 
            success: true, 
            movements: sampleMovements 
        });
    }
    
    const query = `
        SELECT movement_date, movement_type, quantity, reason, responsable
        FROM inventory_movements 
        WHERE inventory_id = ?
        ORDER BY movement_date DESC, created_at DESC
        LIMIT 20
    `;
    
    db.query(query, [itemId], (err, results) => {
        if (err) {
            console.error('Error obteniendo movimientos:', err);
            return res.json({ success: false, message: 'Error en la base de datos' });
        }
        
        res.json({ 
            success: true, 
            movements: results 
        });
    });
});

// API: Ajustar stock
router.post('/api/adjust', requireAuth, (req, res) => {
    console.log('📊 Ajustando stock:', req.body);
    
    
    const { inventory_id, adjust_type, quantity, reason, details } = req.body;
    
  
    // Obtener cantidad actual
    db.query('SELECT quantity FROM food_inventory WHERE id = ?', [inventory_id], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: 'Alimento no encontrado' });
        }
        
        const inputQuantity = parseFloat(quantity);
        const currentQuantity = parseFloat(results[0].quantity)
        
        let newQuantity;
        
        switch(adjust_type) {
            case 'entrada':
                newQuantity = currentQuantity + inputQuantity;
                break;
            case 'salida':
                newQuantity = currentQuantity - inputQuantity;
                if (newQuantity < 0) newQuantity = 0;
                break;
            case 'correccion':
                newQuantity = inputQuantity;
                break;
            default:
                return res.json({ success: false, message: 'Tipo de ajuste inválido' });
        }

        console.log('newQuantity: ', newQuantity);
        
        // Actualizar stock
        const updateQuery = 'UPDATE food_inventory SET quantity = ? WHERE id = ?';
        db.query(updateQuery, [newQuantity, inventory_id], (err, result) => {
            if (err) {
                console.error('Error al ajustar stock:', err);
                return res.json({ success: false, message: 'Error en la base de datos' });
            }
            
            // Registrar movimiento
            const movementType = adjust_type === 'entrada' ? 'entrada' : 'salida';
            const movementReason = `Ajuste de stock: ${reason}`;
            const movementNotes = details || `Ajuste realizado por ${req.session.user.username}`;
            
            const movementQuery = `
                INSERT INTO inventory_movements 
                (inventory_id, movement_type, quantity, reason, notes, responsable)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            db.query(movementQuery, [
                inventory_id, 
                movementType, 
                quantity, 
                movementReason, 
                movementNotes, 
                req.session.user.username
            ], (err) => {
                if (err) console.error('Error al registrar movimiento:', err);
            });
            
            res.json({ 
                success: true, 
                message: 'Stock ajustado exitosamente',
                new_quantity: newQuantity
            });
        });
    });
});

// API: Registrar movimiento de salida
router.post('/api/movement/out', requireAuth, (req, res) => {
    console.log('📤 Registrando salida:', req.body);
    
    
    const { inventory_id, quantity, reason, animal_type, animal_group, notes } = req.body;
    
    if (!db) {
        // Modo demo
        return res.json({ 
            success: true, 
            message: 'Salida registrada exitosamente (modo demo)',
            new_quantity: 1500
        });
    }
    
    // Verificar stock disponible
    db.query('SELECT quantity FROM food_inventory WHERE id = ?', [inventory_id], (err, results) => {
        if (err || results.length === 0) {
            return res.json({ success: false, message: 'Alimento no encontrado' });
        }
        
        const currentQuantity = results[0].quantity;
        
        if (currentQuantity < quantity) {
            return res.json({ success: false, message: 'Stock insuficiente' });
        }
        
        const newQuantity = currentQuantity - quantity;
        
        // Actualizar stock
        const updateQuery = 'UPDATE food_inventory SET quantity = ? WHERE id = ?';
        db.query(updateQuery, [newQuantity, inventory_id], (err, result) => {
            if (err) {
                console.error('Error al actualizar stock:', err);
                return res.json({ success: false, message: 'Error en la base de datos' });
            }
            
            // Registrar movimiento
            const movementQuery = `
                INSERT INTO inventory_movements 
                (inventory_id, movement_type, quantity, reason, notes, animal_type, animal_group, responsable)
                VALUES (?, 'salida', ?, ?, ?, ?, ?, ?)
            `;
            
            db.query(movementQuery, [
                inventory_id, 
                quantity, 
                reason, 
                notes || 'Salida registrada',
                animal_type,
                animal_group,
                req.session.user.name
            ], (err) => {
                if (err) console.error('Error al registrar movimiento:', err);
            });
            
            res.json({ 
                success: true, 
                message: 'Salida registrada exitosamente',
                new_quantity: newQuantity
            });
        });
    });
});

// API: Generar reporte - VERSIÓN COMPLETA
router.get('/api/report/:format', requireAuth, async (req, res) => {
    const { format } = req.params;
    const { type } = req.query;
    
    console.log(`📊 Generando reporte ${format} tipo: ${type}`);
    
    try {
        // Consulta para obtener los datos del inventario según el tipo
        let query = `
            SELECT 
                fi.*, 
                ft.name as food_name, 
                ft.category, 
                ft.unit,
                (fi.quantity * fi.unit_price) as total_value,
                DATEDIFF(fi.expiration_date, CURDATE()) as days_to_expire,
                CASE 
                    WHEN fi.quantity <= 0 THEN 'AGOTADO'
                    WHEN fi.quantity <= fi.min_stock THEN 'BAJO STOCK'
                    WHEN fi.expiration_date IS NOT NULL AND fi.expiration_date < CURDATE() THEN 'VENCIDO'
                    ELSE 'DISPONIBLE'
                END as status
            FROM food_inventory fi
            LEFT JOIN food_types ft ON fi.food_type_id = ft.id
            WHERE 1=1
        `;
        
        // Filtros según el tipo de reporte
        switch(type) {
            case 'low_stock':
                query += ` AND (fi.quantity <= fi.min_stock OR fi.quantity <= 0)`;
                break;
            case 'expiring':
                query += ` AND fi.expiration_date IS NOT NULL 
                          AND fi.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
                break;
            case 'cattle':
                query += ` AND fi.animal_type IN ('ganado', 'ambos')`;
                break;
            case 'pig':
                query += ` AND fi.animal_type IN ('porcino', 'ambos')`;
                break;
        }
        
        query += ` ORDER BY fi.status, ft.name`;
        
        // Ejecutar consulta
        db.query(query, async (err, inventory) => {
            if (err) {
                console.error('Error obteniendo inventario para reporte:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al generar el reporte' 
                });
            }
            
            // Estadísticas adicionales
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_items,
                    SUM(fi.quantity) as total_quantity,
                    SUM(fi.quantity * fi.unit_price) as total_value,
                    SUM(CASE WHEN fi.quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock,
                    SUM(CASE WHEN fi.quantity > 0 AND fi.quantity <= fi.min_stock THEN 1 ELSE 0 END) as low_stock
                FROM food_inventory fi
                LEFT JOIN food_types ft ON fi.food_type_id = ft.id
                WHERE 1=1
            `;
            
            let statsWhere = '';
            switch(type) {
                case 'low_stock':
                    statsWhere = ` AND (fi.quantity <= fi.min_stock OR fi.quantity <= 0)`;
                    break;
                case 'expiring':
                    statsWhere = ` AND fi.expiration_date IS NOT NULL 
                                 AND fi.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`;
                    break;
                case 'cattle':
                    statsWhere = ` AND fi.animal_type IN ('ganado', 'ambos')`;
                    break;
                case 'pig':
                    statsWhere = ` AND fi.animal_type IN ('porcino', 'ambos')`;
                    break;
            }
            
            db.query(statsQuery + statsWhere, async (err, statsResult) => {
                if (err) {
                    console.error('Error obteniendo estadísticas:', err);
                }
                
                const stats = statsResult && statsResult[0] ? statsResult[0] : {};
                
                // Generar reporte según el formato
                if (format === 'excel') {
                    await generateExcelReport(res, inventory, stats, type);
                } else if (format === 'pdf') {
                    await generatePDFReport(res, inventory, stats, type);
                } else {
                    res.status(400).json({ 
                        success: false, 
                        message: 'Formato no soportado' 
                    });
                }
            });
        });
    } catch (error) {
        console.error('Error generando reporte:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al generar el reporte' 
        });
    }
});

// Función para generar reporte en Excel
async function generateExcelReport(res, inventory, stats, reportType) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inventario');
        
        // Título del reporte
        const reportTitle = getReportTitle(reportType);
        worksheet.mergeCells('A1:K1');
        worksheet.getCell('A1').value = `GanaSys - ${reportTitle}`;
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
        // Fecha de generación
        worksheet.mergeCells('A2:K2');
        worksheet.getCell('A2').value = `Generado el: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        // Estadísticas
        worksheet.getCell('A4').value = 'ESTADÍSTICAS DEL REPORTE';
        worksheet.getCell('A4').font = { bold: true };
        
        worksheet.getCell('A5').value = 'Total de Items:';
        worksheet.getCell('B5').value = stats.total_items || 0;
        
        worksheet.getCell('A6').value = 'Cantidad Total:';
        worksheet.getCell('B6').value = (stats.total_quantity || 0).toLocaleString('es-ES');
        
        worksheet.getCell('A7').value = 'Valor Total:';
        worksheet.getCell('B7').value = `$${(stats.total_value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
        
        worksheet.getCell('A8').value = 'Items Agotados:';
        worksheet.getCell('B8').value = stats.out_of_stock || 0;
        
        worksheet.getCell('A9').value = 'Items Bajo Stock:';
        worksheet.getCell('B9').value = stats.low_stock || 0;
        
        // Encabezados de la tabla
        const headers = [
            'ID', 'Alimento', 'Categoría', 'Lote', 'Cantidad', 
            'Unidad', 'Precio Unit.', 'Valor Total', 'Tipo Animal', 
            'Vencimiento', 'Estado'
        ];
        
        worksheet.addRow([]); // Fila vacía
        
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4CAF50' } // Verde manzana
        };
        headerRow.alignment = { horizontal: 'center' };
        
        // Datos del inventario
        inventory.forEach(item => {
            const row = worksheet.addRow([
                item.id,
                item.food_name,
                item.category ? item.category.toUpperCase() : 'N/A',
                item.lot_number || 'N/A',
                item.quantity,
                item.unit || 'kg',
                item.unit_price,
                item.total_value,
                getAnimalTypeText(item.animal_type),
                item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : 'No vence',
                getStatusText(item.status)
            ]);
            
            // Formato de números
            row.getCell(7).numFmt = '$#,##0.00';
            row.getCell(8).numFmt = '$#,##0.00';
        });
        
        // Ajustar ancho de columnas
        worksheet.columns = [
            { width: 10 },  // ID
            { width: 25 },  // Alimento
            { width: 15 },  // Categoría
            { width: 15 },  // Lote
            { width: 12 },  // Cantidad
            { width: 10 },  // Unidad
            { width: 15 },  // Precio Unit.
            { width: 15 },  // Valor Total
            { width: 15 },  // Tipo Animal
            { width: 15 },  // Vencimiento
            { width: 15 }   // Estado
        ];
        
        // Aplicar bordes a la tabla
        const lastRow = worksheet.rowCount;
        const lastCol = headers.length;
        
        for (let i = 11; i <= lastRow; i++) { // Empezar desde la fila de encabezados
            for (let j = 1; j <= lastCol; j++) {
                const cell = worksheet.getCell(i, j);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        }
        
        // Generar nombre del archivo
        const fileName = `inventario_${reportType}_${Date.now()}.xlsx`;
        
        // Configurar headers para descarga
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        // Escribir el workbook en la respuesta
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('Error generando Excel:', error);
        res.status(500).send('Error generando el reporte Excel');
    }
}

// Función para generar reporte en PDF
async function generatePDFReport(res, inventory, stats, reportType) {
    try {
        const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
        
        const fileName = `inventario_${reportType}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        
        doc.pipe(res);
        
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('GanaSys', 50, 50);
        
        doc.fontSize(16).font('Helvetica').fillColor('black')
           .text(getReportTitle(reportType), 50, 80);
        
        doc.fontSize(10).fillColor('gray')
           .text(`Generado el: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 50, 105);
        
        // Línea separadora
        doc.moveTo(50, 120).lineTo(770, 120).strokeColor('#2E7D32').lineWidth(2).stroke();
        
        // Estadísticas
        doc.fontSize(12).font('Helvetica-Bold').fillColor('black')
           .text('ESTADÍSTICAS:', 50, 140);
        
        doc.fontSize(10).font('Helvetica')
           .text(`Total de Items: ${stats.total_items || 0}`, 50, 160)
           .text(`Cantidad Total: ${(stats.total_quantity || 0).toLocaleString('es-ES')}`, 50, 175)
           .text(`Valor Total: $${(stats.total_value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`, 50, 190)
           .text(`Items Agotados: ${stats.out_of_stock || 0}`, 200, 160)
           .text(`Items Bajo Stock: ${stats.low_stock || 0}`, 200, 175);
        
        // Espacio
        doc.moveDown(2);
        
        // Tabla de inventario
        const tableTop = 220;
        const tableLeft = 50;
        const columnWidth = 77;
        
        // Encabezados de la tabla
        const headers = [
            'Alimento', 'Categoría', 'Lote', 'Cantidad', 
            'Unidad', 'Precio $', 'Valor $', 'Animal', 'Vencimiento', 'Estado'
        ];
        
        
        let x = tableLeft;
        // 
        headers.forEach((header, i) => {
            doc.rect(x, tableTop, columnWidth, 20).fill('#2e7d32');

            // Contenido de las celdas(color,fuente y tamaño)
            doc.fillColor("#ffffff").font('Helvetica-Bold').fontSize(10); 
            doc.text(header, x + 5, tableTop + 5, { width: columnWidth - 10, align: 'center' });
            x += columnWidth;
        });
        
        
        let y = tableTop + 20;
        
        inventory.forEach((item, index) => {
            // Alternar colores de fondo
            if (index % 2 === 0) {
                doc.rect(tableLeft, y, columnWidth * headers.length, 15).fill('#F8F9FA');
            }

            // Contenido de las celdas(color,fuente y tamaño)
            doc.fillColor("#000000").font('Helvetica').fontSize(8);     

            
            const cellData = [
                item.food_name,
                item.category ? item.category.toUpperCase() : 'N/A',
                item.lot_number || 'N/A',
                item.quantity.toLocaleString('es-ES'),
                item.unit || 'kg',
                `$${item.unit_price}`,
                `$${item.total_value}`,
                getAnimalTypeText(item.animal_type),
                item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : 'No vence',
                getStatusText(item.status)
            ];
            
            x = tableLeft;
            cellData.forEach((data, i) => {
                doc.text(data, x + 5, y + 3, { width: columnWidth - 10, align: i >= 5 ? 'right' : 'left' });
                x += columnWidth;
            });
            
            y += 15;
            
            // Verificar si se necesita una nueva página
            if (y > 550) {
                doc.addPage();
                y = 50;
            }
        });
        
        // Bordes de la tabla
        doc.rect(tableLeft, tableTop, columnWidth * headers.length, y - tableTop)
           .strokeColor('#CCCCCC').lineWidth(0.5).stroke();
        
        // Líneas verticales
        for (let i = 1; i < headers.length; i++) {
            doc.moveTo(tableLeft + columnWidth * i, tableTop)
               .lineTo(tableLeft + columnWidth * i, y)
               .strokeColor('#CCCCCC').lineWidth(0.5).stroke();
        }
        
        // Pie de página
        const pageHeight = doc.page.height;
        doc.fontSize(8).fillColor('gray')
           .text(`Página ${doc.page.number}`, 50, pageHeight - 50, { align: 'left' })
           .text(`Total de registros: ${inventory.length}`, 400, pageHeight - 50, { align: 'center' })
           .text('GanaSys © 2024', 700, pageHeight - 50, { align: 'right' });
        
        // Finalizar el documento
        doc.end();
        
    } catch (error) {
        console.error('Error generando PDF:', error);
        res.status(500).send('Error generando el reporte PDF');
    }
}



// Funciones auxiliares
function getReportTitle(type) {
    const titles = {
        'complete': 'Inventario Completo',
        'low_stock': 'Reporte de Stock Bajo/Crítico',
        'expiring': 'Productos por Vencer (30 días)',
        'cattle': 'Alimentos para Ganado',
        'pig': 'Alimentos para Porcinos',
        'value': 'Valorización del Inventario'
    };
    return titles[type] || 'Reporte de Inventario';
}

function getAnimalTypeText(type) {
    const types = {
        'ganado': 'GANADO',
        'porcino': 'PORCINO',
        'ambos': 'AMBOS'
    };
    return types[type] || 'N/A';
}

function getStatusText(status) {
    const statusMap = {
        'AGOTADO': 'AGOTADO',
        'BAJO STOCK': 'BAJO',
        'VENCIDO': 'VENCIDO',
        'DISPONIBLE': 'OK'
    };
    return statusMap[status] || 'N/A';
}

module.exports = router;