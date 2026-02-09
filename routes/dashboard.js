const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306
});

// Ruta del dashboard
router.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();

    // Obtener estadísticas para el dashboard
    const statsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM cattle) as cattle_count,
            (SELECT COUNT(*) FROM pigs) as pigs_count,
            (SELECT COUNT(*) FROM vaccinations WHERE status = 'Completada' AND MONTH(date) = MONTH(CURRENT_DATE)) as vaccinations_count,
            (SELECT COUNT(*) FROM vaccinations WHERE status = 'Vencida') as expired_vaccines,
            (SELECT COUNT(*) FROM sales WHERE status = 'Completada' AND MONTH(sale_date) = MONTH(CURRENT_DATE)) as sales_count,
            (SELECT COALESCE(SUM(amount), 0) FROM sales 
         WHERE status = 'Completada' 
         AND YEAR(sale_date) = ? AND MONTH(sale_date) = ?) as sales_amount`;

         const milkQuery = `
        SELECT DAY(sale_date) as day, SUM(quantity) as total 
        FROM sales 
        WHERE product_name = 'Leche fresca' 
        AND YEAR(sale_date) = ? AND MONTH(sale_date) = ?
        GROUP BY DAY(sale_date)`;

        const salesQuery = `
    SELECT MONTH(sale_date) as month, SUM(amount) as total 
    FROM sales 
    WHERE status = 'Completada' 
      AND YEAR(sale_date) = YEAR(CURDATE())
      AND MONTH(sale_date) BETWEEN 1 AND 6
    GROUP BY MONTH(sale_date)
    ORDER BY MONTH(sale_date) ASC`;
    
    db.execute(statsQuery, [year, month], (err, results) => {
        if (err) {
            console.error('❌ Error obteniendo estadísticas:', err);

            
            // En caso de error, usar valores por defecto
            const stats = {
                cattle_count: 0,
                pigs_count: 0,
                vaccinations_count: 0,
                expired_vaccines: 0,
                sales_count: 0,
                sales_amount: 0
            };
            
            // Actividades recientes (simuladas)
            const recentActivities = [
                { type: 'success', title: 'Sistema iniciado', description: 'Bienvenido al dashboard de GanaSys', time: 'Ahora' }
            ];
            
            // Datos de ejemplo
            const monthlySales = [15500, 9000, 12000, 18000, 14500, 16500];
        
            return res.render('dashboard', { 
                user: req.session.user, 
                stats, 
                recentActivities, 
                milkProduction, 
                monthlySales 
            });
        }
        
    
    db.execute(milkQuery, [year, month], (err, milkResults) => {
                if (err) {
                    console.error('❌ Error en milkQuery:', err);
                    return res.status(500).send("Error interno");

                }
                let milkProduction = new Array(daysInMonth).fill(0);
                 milkResults.forEach(row => {
                    milkProduction[row.day - 1] = parseFloat(row.total) || 0;

        });

        db.execute(salesQuery, (err, resultsSalesQuery) => {
        if (err) {
            console.error("Error en ventas:", err);
            return res.status(500).send("Error");
        }

        let monthlySales = [0, 0, 0, 0, 0, 0];
        resultsSalesQuery.forEach(row => {
        monthlySales[row.month - 1] = parseFloat(row.total) || 0;
        });
    
    

        const stats = results[0];

        const recentActivities = [
            { type: 'success', title: 'Vacunación completada', description: 'Ganado lote #A-245 - Vacuna antiaftosa', time: 'Hace 2 horas' },
            { type: 'warning', title: 'Próximo evento', description: 'Revisión sanitaria programada para mañana', time: 'Hace 4 horas' },
            { type: 'info', title: 'Nuevo nacimiento', description: 'Ternero registrado - Madre: Vaca #123', time: 'Hace 6 horas' },
            { type: 'danger', title: 'Inventario bajo', description: 'Alimento balanceado por debajo del mínimo', time: 'Hace 8 horas' }
        ];

        
        
        
       
        res.render('dashboard', { 
            user: req.session.user, 
            stats, 
            recentActivities, 
            milkProduction, 
            monthlySales 
        });
    })})});
});

module.exports = router;