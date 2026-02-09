// routes/sales.js
const express = require('express');
const router = express.Router();

// Importar middlewares desde el archivo separado
const { requireAuth, authenticateToken } = require('../middlewares/auth');

// Obtener estadísticas mensuales
router.get('/stats', requireAuth, (req, res) => {
    try {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        
        // Query simplificado
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Completada' THEN total_amount ELSE 0 END), 0) as monthly_sales,
                COUNT(CASE WHEN status = 'Completada' THEN 1 END) as completed_sales,
                COUNT(CASE WHEN status = 'Pendiente' THEN 1 END) as pending_sales,
                COALESCE(SUM(CASE WHEN status = 'Pendiente' THEN total_amount ELSE 0 END), 0) as pending_amount
            FROM sales
            WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?
        `;
        
        req.db.query(query, [year, month], (error, results) => {
            if (error) {
                console.error('Error getting stats:', error);
                return res.status(500).json({ error: 'Error al obtener estadísticas' });
            }
            
            const stats = results[0] || {};
            res.json({
                monthly_sales: stats.monthly_sales || 0,
                completed_sales: stats.completed_sales || 0,
                pending_sales: stats.pending_sales || 0,
                pending_amount: stats.pending_amount || 0
            });
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Obtener todas las ventas
router.get('/api/sales', authenticateToken, (req, res) => {
    try {
        req.db.query(`
            SELECT 
                s.id,
                s.sale_code,
                s.client_name,
                s.sale_date,
                s.product_name,
                s.quantity,
                s.amount,
                s.total_amount,
                s.status,
                s.payment_method,
                s.notes,
                DATE_FORMAT(s.created_at, '%d/%m/%Y %H:%i') as formatted_date
            FROM sales s
            ORDER BY s.sale_date DESC, s.created_at DESC
            LIMIT 100
        `, (error, sales) => {
            if (error) {
                console.error('Error getting sales:', error);
                return res.status(500).json({ error: 'Error al obtener ventas' });
            }
            
            res.json(sales);
        });
    } catch (error) {
        console.error('Error getting sales:', error);
        res.status(500).json({ error: 'Error al obtener ventas' });
    }
});

// Obtener productos disponibles
router.get('/api/products', authenticateToken, (req, res) => {
    try {
        req.db.query(`
            SELECT 
                id,
                name,
                description,
                category,
                price,
                stock,
                unit,
                min_stock,
                CASE 
                    WHEN stock <= 0 THEN 'Agotado'
                    WHEN stock <= min_stock THEN 'Bajo Stock'
                    ELSE 'Disponible'
                END as stock_status
            FROM products
            ORDER BY category, name
        `, (error, products) => {
            if (error) {
                console.error('Error getting products:', error);
                return res.status(500).json({ error: 'Error al obtener productos' });
            }
            
            res.json(products);
        });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// Crear nueva venta
router.post('/api/create', authenticateToken, (req, res) => {
    const {
        client,
        product,
        quantity,
        unit_price,
        amount,
        status = 'Completada',
        payment_method = 'Efectivo',
        notes
    } = req.body;
    
    // Validar datos requeridos
    if (!client || !product || !quantity || !unit_price || !amount) {
        return res.status(400).json({
            success: false,
            error: 'Faltan datos requeridos'
        });
    }
    
    // Validar que quantity y amount sean números positivos
    if (quantity <= 0 || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'La cantidad y el monto deben ser mayores a 0'
        });
    }
    
    // Generar código de venta
    const dateCode = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const randomCode = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const saleCode = `V-${dateCode}-${randomCode}`;
    
    // Buscar producto por nombre
    req.db.query(
        'SELECT id, name, stock FROM products WHERE name LIKE ?',
        [`%${product}%`],
        (error, productResult) => {
            if (error) {
                console.error('Error finding product:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al buscar producto'
                });
            }
            
            if (productResult.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Producto no encontrado'
                });
            }
            
            const productData = productResult[0];
            
            // Verificar stock solo si la venta se completará
            if (status === 'Completada' && productData.stock < quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Stock insuficiente. Disponible: ${productData.stock}`
                });
            }
            
            // Calcular total
            const total = parseFloat(amount);
            
            // Insertar venta
            req.db.query(
                `INSERT INTO sales (
                    sale_code, client_name, sale_date, product_id, product_name,
                    quantity, unit_price, amount, total_amount, status,
                    payment_method, notes, created_by
                ) VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleCode,
                    client,
                    productData.id,
                    productData.name,
                    parseInt(quantity),
                    parseFloat(unit_price),
                    parseFloat(amount),
                    total,
                    status,
                    payment_method,
                    notes,
                    req.user.id || 1
                ],
                (error, result) => {
                    if (error) {
                        console.error('Error creating sale:', error);
                        return res.status(500).json({
                            success: false,
                            error: 'Error al registrar la venta'
                        });
                    }
                    
                    const saleId = result.insertId;
                    
                    // Actualizar stock si la venta está completada
                    if (status === 'Completada') {
                        req.db.query(
                            'UPDATE products SET stock = stock - ? WHERE id = ?',
                            [quantity, productData.id],
                            (error) => {
                                if (error) {
                                    console.error('Error updating stock:', error);
                                }
                                
                                // Registrar pago
                                req.db.query(
                                    `INSERT INTO payments (
                                        sale_id, amount, payment_date, payment_method,
                                        status, created_at
                                    ) VALUES (?, ?, CURDATE(), ?, 'Pagado', NOW())`,
                                    [saleId, total, payment_method],
                                    (error) => {
                                        if (error) {
                                            console.error('Error creating payment:', error);
                                        }
                                        
                                        res.json({
                                            success: true,
                                            message: 'Venta registrada exitosamente',
                                            sale_id: saleId,
                                            sale_code: saleCode
                                        });
                                    }
                                );
                            }
                        );
                    } else {
                        res.json({
                            success: true,
                            message: 'Venta registrada exitosamente',
                            sale_id: saleId,
                            sale_code: saleCode
                        });
                    }
                }
            );
        }
    );
});

// Eliminar venta
router.post('/api/delete/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    
    // Obtener información de la venta
    req.db.query(
        'SELECT product_id, quantity, status FROM sales WHERE id = ?',
        [saleId],
        (error, sale) => {
            if (error) {
                console.error('Error finding sale:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al buscar venta'
                });
            }
            
            if (sale.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Venta no encontrada'
                });
            }
            
            const saleData = sale[0];
            
            // Devolver stock si la venta estaba completada
            if (saleData.status === 'Completada' && saleData.product_id) {
                req.db.query(
                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                    [saleData.quantity, saleData.product_id],
                    (error) => {
                        if (error) {
                            console.error('Error updating stock:', error);
                        }
                        
                        // Eliminar pagos asociados
                        req.db.query('DELETE FROM payments WHERE sale_id = ?', [saleId], (error) => {
                            if (error) {
                                console.error('Error deleting payments:', error);
                            }
                            
                            // Eliminar la venta
                            req.db.query('DELETE FROM sales WHERE id = ?', [saleId], (error) => {
                                if (error) {
                                    console.error('Error deleting sale:', error);
                                    return res.status(500).json({
                                        success: false,
                                        error: 'Error al eliminar la venta'
                                    });
                                }
                                
                                res.json({
                                    success: true,
                                    message: 'Venta eliminada exitosamente'
                                });
                            });
                        });
                    }
                );
            } else {
                // Si no está completada, solo eliminar
                req.db.query('DELETE FROM payments WHERE sale_id = ?', [saleId], (error) => {
                    if (error) {
                        console.error('Error deleting payments:', error);
                    }
                    
                    req.db.query('DELETE FROM sales WHERE id = ?', [saleId], (error) => {
                        if (error) {
                            console.error('Error deleting sale:', error);
                            return res.status(500).json({
                                success: false,
                                error: 'Error al eliminar la venta'
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Venta eliminada exitosamente'
                        });
                    });
                });
            }
        }
    );
});

// Exportar ventas a CSV
router.get('/api/export', authenticateToken, (req, res) => {
    try {
        req.db.query(`
            SELECT 
                sale_code as 'Código',
                client_name as 'Cliente',
                DATE_FORMAT(sale_date, '%d/%m/%Y') as 'Fecha',
                product_name as 'Producto',
                quantity as 'Cantidad',
                FORMAT(unit_price, 2) as 'Precio Unitario',
                FORMAT(amount, 2) as 'Subtotal',
                FORMAT(discount, 2) as 'Descuento',
                FORMAT(total_amount, 2) as 'Total',
                status as 'Estado',
                payment_method as 'Método de Pago'
            FROM sales
            ORDER BY sale_date DESC
            LIMIT 1000
        `, (error, sales) => {
            if (error) {
                console.error('Error exporting sales:', error);
                return res.status(500).json({ error: 'Error al exportar ventas' });
            }
            
            // Convertir a CSV
            let csv = '';
            
            // Encabezados
            if (sales.length > 0) {
                const headers = Object.keys(sales[0]);
                csv += headers.join(',') + '\n';
                
                // Datos
                sales.forEach(row => {
                    const values = headers.map(header => {
                        let value = row[header] || '';
                        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                            value = `"${value.replace(/"/g, '""')}"`;
                        }
                        return value;
                    });
                    csv += values.join(',') + '\n';
                });
            }
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=ventas_${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        });
    } catch (error) {
        console.error('Error exporting sales:', error);
        res.status(500).json({ error: 'Error al exportar ventas' });
    }
});

// Obtener detalles de una venta específica
router.get('/api/details/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    
    req.db.query(`
        SELECT 
            s.id,
            s.sale_code,
            s.client_name,
            DATE_FORMAT(s.sale_date, '%d/%m/%Y') as sale_date,
            s.product_name,
            s.quantity,
            s.unit_price,
            s.total_amount as amount,
            s.status,
            s.payment_method,
            s.notes,
            DATE_FORMAT(s.created_at, '%d/%m/%Y %H:%i') as formatted_date
        FROM sales s
        WHERE s.id = ?
    `, [saleId], (error, results) => {
        if (error) {
            console.error('Error getting sale details:', error);
            return res.status(500).json({ error: 'Error al obtener detalles de la venta' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Venta no encontrada' });
        }
        
        res.json(results[0]);
    });
});

// Actualizar venta
router.post('/api/update/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    const {
        client_name,
        product_name,
        quantity,
        total_amount,
        status
    } = req.body;
    
    // Validar datos
    if (!client_name || !product_name || !quantity || !total_amount || !status) {
        return res.status(400).json({
            success: false,
            error: 'Faltan datos requeridos'
        });
    }
    
    // Obtener venta anterior
    req.db.query(
        'SELECT product_id, quantity as old_quantity, status as old_status FROM sales WHERE id = ?',
        [saleId],
        (error, sale) => {
            if (error) {
                console.error('Error finding sale:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al buscar venta'
                });
            }
            
            if (sale.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Venta no encontrada'
                });
            }
            
            const saleData = sale[0];
            
            // Actualizar venta
            req.db.query(
                `UPDATE sales SET 
                    client_name = ?,
                    product_name = ?,
                    quantity = ?,
                    total_amount = ?,
                    status = ?,
                    updated_at = NOW()
                WHERE id = ?`,
                [
                    client_name,
                    product_name,
                    parseInt(quantity),
                    parseFloat(total_amount),
                    status,
                    saleId
                ],
                (error, result) => {
                    if (error) {
                        console.error('Error updating sale:', error);
                        return res.status(500).json({
                            success: false,
                            error: 'Error al actualizar la venta'
                        });
                    }
                    
                    // Si hay un producto_id y cambió el stock, actualizar inventario
                    if (saleData.product_id) {
                        const quantityDiff = parseInt(quantity) - saleData.old_quantity;
                        
                        if (quantityDiff !== 0) {
                            // Si el estado cambió a Completada o de Completada a otro
                            if (status === 'Completada' && saleData.old_status !== 'Completada') {
                                // Nueva venta completada - restar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                                    [quantity, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            } else if (status !== 'Completada' && saleData.old_status === 'Completada') {
                                // Dejó de estar completada - sumar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                                    [saleData.old_quantity, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            } else if (status === 'Completada' && saleData.old_status === 'Completada') {
                                // Cambio de cantidad en venta completada - ajustar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                                    [quantityDiff, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            }
                        }
                    }
                    
                    res.json({
                        success: true,
                        message: 'Venta actualizada exitosamente'
                    });
                }
            );
        }
    );
});

// Generar factura (formato HTML)
router.get('/api/invoice/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    
    req.db.query(`
        SELECT 
            s.id,
            s.sale_code,
            s.client_name,
            DATE_FORMAT(s.sale_date, '%d/%m/%Y') as sale_date,
            s.product_name,
            s.quantity,
            s.unit_price,
            s.total_amount,
            s.payment_method,
            s.notes,
            DATE_FORMAT(NOW(), '%d/%m/%Y') as invoice_date,
            u.name as seller_name
        FROM sales s
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.id = ?
    `, [saleId], (error, results) => {
        if (error) {
            console.error('Error getting invoice data:', error);
            return res.status(500).send('Error al generar factura');
        }
        
        if (results.length === 0) {
            return res.status(404).send('Venta no encontrada');
        }
        
        const sale = results[0];
        
        // Generar HTML de factura
        const invoiceHtml = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Factura ${sale.sale_code}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .company-name { font-size: 24px; font-weight: bold; color: #32CD32; }
                    .invoice-title { font-size: 20px; margin: 20px 0; }
                    .details { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .details th { background-color: #f2f2f2; padding: 10px; text-align: left; }
                    .details td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; }
                    .footer { margin-top: 50px; text-align: center; color: #666; }
                    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80px; color: rgba(50, 205, 50, 0.1); z-index: -1; }
                </style>
            </head>
            <body>
                <div class="watermark">GanaSys</div>
                
                <div class="header">
                    <div class="company-name">GanaSys</div>
                    <div>Sistema de Gestión Ganadera</div>
                    <div>NIT: 900.123.456-7</div>
                    <div>Tel: +57 1 234 5678</div>
                </div>
                
                <h2 class="invoice-title">FACTURA No. ${sale.sale_code}</h2>
                
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td>
                            <strong>CLIENTE:</strong><br>
                            ${sale.client_name}<br><br>
                            <strong>FECHA DE FACTURA:</strong><br>
                            ${sale.invoice_date}
                        </td>
                        <td style="text-align: right;">
                            <strong>VENDEDOR:</strong><br>
                            ${sale.seller_name || 'Sistema GanaSys'}<br><br>
                            <strong>MÉTODO DE PAGO:</strong><br>
                            ${sale.payment_method}
                        </td>
                    </tr>
                </table>
                
                <table class="details">
                    <thead>
                        <tr>
                            <th>CÓDIGO</th>
                            <th>DESCRIPCIÓN</th>
                            <th>CANTIDAD</th>
                            <th>PRECIO UNITARIO</th>
                            <th>VALOR TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${sale.id}</td>
                            <td>${sale.product_name}</td>
                            <td>${sale.quantity}</td>
                            <td>$${parseFloat(sale.unit_price).toFixed(2)}</td>
                            <td>$${parseFloat(sale.total_amount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div class="total">
                    <table style="width: 300px; margin-left: auto;">
                        <tr>
                            <td><strong>SUBTOTAL:</strong></td>
                            <td>$${parseFloat(sale.total_amount).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td><strong>IVA (0%):</strong></td>
                            <td>$0.00</td>
                        </tr>
                        <tr style="font-size: 20px;">
                            <td><strong>TOTAL A PAGAR:</strong></td>
                            <td><strong>$${parseFloat(sale.total_amount).toFixed(2)}</strong></td>
                        </tr>
                    </table>
                </div>
                
                ${sale.notes ? `
                <div style="margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #32CD32;">
                    <strong>NOTAS:</strong><br>
                    ${sale.notes}
                </div>
                ` : ''}
                
                <div class="footer">
                    <hr>
                    <p><strong>¡Gracias por su compra!</strong></p>
                    <p>Esta factura es generada electrónicamente por el sistema GanaSys</p>
                    <p>Válida como documento equivalente según Resolución DIAN 1876400023234</p>
                    <p>GanaSys © ${new Date().getFullYear()} - Todos los derechos reservados</p>
                </div>
                
                <script>
                    // Imprimir automáticamente
                    window.onload = function() {
                        window.print();
                        // Cerrar después de imprimir
                        setTimeout(function() {
                            window.close();
                        }, 1000);
                    };
                </script>
            </body>
            </html>
        `;
        
        // Configurar para mostrar como HTML
        res.setHeader('Content-Type', 'text/html');
        res.send(invoiceHtml);
    });
});

// Ruta principal - Renderizar vista EJS
router.get('/', requireAuth, (req, res) => {
    try {
        // Obtener estadísticas
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN status = 'Completada' THEN total_amount ELSE 0 END), 0) as monthly_sales,
                COUNT(CASE WHEN status = 'Completada' THEN 1 END) as completed_sales,
                COUNT(CASE WHEN status = 'Pendiente' THEN 1 END) as pending_sales,
                COALESCE(SUM(CASE WHEN status = 'Pendiente' THEN total_amount ELSE 0 END), 0) as pending_amount
            FROM sales
            WHERE YEAR(sale_date) = ? AND MONTH(sale_date) = ?
        `;
        
        req.db.query(query, [year, month], (error, statsResult) => {
            if (error) {
                console.error('Error getting stats:', error);
                statsResult = [];
            }
            
            const stats = statsResult[0] || {};
            
            // Obtener ventas recientes
            req.db.query(`
                SELECT 
                    s.id,
                    s.sale_code,
                    s.client_name as client,
                    DATE_FORMAT(s.sale_date, '%d/%m/%Y') as date,
                    s.product_name as product,
                    s.quantity,
                    s.total_amount as amount,
                    s.status,
                    s.payment_method,
                    s.notes
                FROM sales s
                ORDER BY s.sale_date DESC, s.created_at DESC
                LIMIT 50
            `, (error, sales) => {
                if (error) {
                    console.error('Error getting sales:', error);
                    sales = [];
                }
                
                // Obtener productos
                req.db.query(`
                    SELECT 
                        id,
                        name,
                        price,
                        stock,
                        unit,
                        min_stock
                    FROM products
                    ORDER BY name
                `, (error, products) => {
                    if (error) {
                        console.error('Error getting products:', error);
                        products = [];
                    }
                    
                    res.render('sales', {
                        title: 'Ventas',
                        user: req.session.user,
                        stats: {
                            monthly_sales: stats.monthly_sales || 0,
                            completed_sales: stats.completed_sales || 0,
                            pending_sales: stats.pending_sales || 0,
                            pending_amount: stats.pending_amount || 0
                        },
                        sales: sales || [],
                        products: products || []
                    });
                });
            });
        });
        
    } catch (error) {
        console.error('Error loading sales page:', error);
        res.status(500).render('error', { 
            message: 'Error al cargar la página de ventas',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Obtener detalles de una venta específica
router.get('/api/details/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    req.db.query(`
        SELECT 
            s.id,
            s.sale_code,
            s.client_name,
            s.sale_date,
            s.product_name,
            s.quantity,
            s.unit_price,
            s.total_amount as amount,
            s.status,
            s.payment_method,
            s.notes,
            DATE_FORMAT(s.created_at, '%d/%m/%Y %H:%i') as formatted_date
        FROM sales s
        WHERE s.id = ?
    `, [saleId], (error, results) => {
        if (error) {
            console.error('Error getting sale details:', error);
            return res.status(500).json({ error: 'Error al obtener detalles de la venta' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Venta no encontrada' });
        }
        
        res.json(results[0]);
        
    });
});

// Actualizar venta
router.post('/api/update/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    const {
        client_name,
        product_name,
        quantity,
        total_amount,
        status
    } = req.body;
    
    // Validar datos
    if (!client_name || !product_name || !quantity || !total_amount || !status) {
        return res.status(400).json({
            success: false,
            error: 'Faltan datos requeridos'
        });
    }
    
    // Obtener venta anterior
    req.db.query(
        'SELECT product_id, quantity as old_quantity, status as old_status FROM sales WHERE id = ?',
        [saleId],
        (error, sale) => {
            if (error) {
                console.error('Error finding sale:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Error al buscar venta'
                });
            }
            
            if (sale.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Venta no encontrada'
                });
            }
            
            const saleData = sale[0];
            
            // Actualizar venta
            req.db.query(
                `UPDATE sales SET 
                    client_name = ?,
                    product_name = ?,
                    quantity = ?,
                    total_amount = ?,
                    status = ?,
                    updated_at = NOW()
                WHERE id = ?`,
                [
                    client_name,
                    product_name,
                    parseInt(quantity),
                    parseFloat(total_amount),
                    status,
                    saleId
                ],
                (error, result) => {
                    if (error) {
                        console.error('Error updating sale:', error);
                        return res.status(500).json({
                            success: false,
                            error: 'Error al actualizar la venta'
                        });
                    }
                    
                    // Si hay un producto_id y cambió el stock, actualizar inventario
                    if (saleData.product_id) {
                        const quantityDiff = parseInt(quantity) - saleData.old_quantity;
                        
                        if (quantityDiff !== 0) {
                            // Si el estado cambió a Completada o de Completada a otro
                            if (status === 'Completada' && saleData.old_status !== 'Completada') {
                                // Nueva venta completada - restar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                                    [quantity, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            } else if (status !== 'Completada' && saleData.old_status === 'Completada') {
                                // Dejó de estar completada - sumar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                                    [saleData.old_quantity, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            } else if (status === 'Completada' && saleData.old_status === 'Completada') {
                                // Cambio de cantidad en venta completada - ajustar stock
                                req.db.query(
                                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                                    [quantityDiff, saleData.product_id],
                                    (error) => {
                                        if (error) {
                                            console.error('Error updating stock:', error);
                                        }
                                    }
                                );
                            }
                        }
                    }
                    
                    res.json({
                        success: true,
                        message: 'Venta actualizada exitosamente'
                    });
                }
            );
        }
    );
});

// Generar factura (formato PDF o HTML)
router.get('/api/invoice/:id', authenticateToken, (req, res) => {
    const saleId = req.params.id;
    
    req.db.query(`
        SELECT 
            s.id,
            s.sale_code,
            s.client_name,
            s.sale_date,
            s.product_name,
            s.quantity,
            s.unit_price,
            s.total_amount,
            s.payment_method,
            s.notes,
            DATE_FORMAT(s.created_at, '%d/%m/%Y') as invoice_date,
            u.name as seller_name
        FROM sales s
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.id = ?
    `, [saleId], (error, results) => {
        if (error) {
            console.error('Error getting invoice data:', error);
            return res.status(500).send('Error al generar factura');
        }
        
        if (results.length === 0) {
            return res.status(404).send('Venta no encontrada');
        }
        
        const sale = results[0];
        
        // Generar HTML de factura
        const invoiceHtml = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Factura ${sale.sale_code}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; }
                    .header { text-align: center; margin-bottom: 30px; }
                    .company-name { font-size: 24px; font-weight: bold; color: #32CD32; }
                    .invoice-title { font-size: 20px; margin: 20px 0; }
                    .details { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .details th { background-color: #f2f2f2; padding: 10px; text-align: left; }
                    .details td { padding: 10px; border-bottom: 1px solid #ddd; }
                    .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; }
                    .footer { margin-top: 50px; text-align: center; color: #666; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="company-name">GanaSys</div>
                    <div>Sistema de Gestión Ganadera</div>
                </div>
                
                <h2 class="invoice-title">FACTURA: ${sale.sale_code}</h2>
                
                <table style="width: 100%; margin-bottom: 20px;">
                    <tr>
                        <td>
                            <strong>Cliente:</strong> ${sale.client_name}<br>
                            <strong>Fecha:</strong> ${sale.invoice_date}
                        </td>
                        <td style="text-align: right;">
                            <strong>Vendedor:</strong> ${sale.seller_name || 'Sistema'}<br>
                            <strong>Método de pago:</strong> ${sale.payment_method}
                        </td>
                    </tr>
                </table>
                
                <table class="details">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Precio Unitario</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${sale.product_name}</td>
                            <td>${sale.quantity}</td>
                            <td>$${parseFloat(sale.unit_price).toFixed(2)}</td>
                            <td>$${parseFloat(sale.total_amount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
                
                <div class="total">
                    TOTAL: $${parseFloat(sale.total_amount).toFixed(2)}
                </div>
                
                ${sale.notes ? `<div style="margin-top: 30px;"><strong>Notas:</strong> ${sale.notes}</div>` : ''}
                
                <div class="footer">
                    <hr>
                    <p>Gracias por su compra</p>
                    <p>GanaSys - ${new Date().getFullYear()}</p>
                </div>
            </body>
            </html>
        `;
        
        // Configurar para descargar como HTML
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename=factura_${sale.sale_code}.html`);
        res.send(invoiceHtml);
    });
});

module.exports = router;