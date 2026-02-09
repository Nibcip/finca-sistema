const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'ganasys'
});

console.log('📋 Mostrando todo el contenido de la base de datos...');

connection.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión:', err.message);
        return;
    }
    
    const tables = ['users', 'cattle', 'pigs', 'vaccinations', 'sales', 'products'];
    
    tables.forEach(table => {
        connection.execute(`SELECT * FROM ${table}`, (err, results) => {
            if (err) {
                console.log(`❌ Error en tabla ${table}:`, err.message);
            } else {
                console.log(`\n📊 ${table.toUpperCase()} (${results.length} registros):`);
                console.log(results);
            }
            
            // Cerrar conexión después de la última tabla
            if (table === 'products') {
                connection.end();
            }
        });
    });
});