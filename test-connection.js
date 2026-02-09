const mysql = require('mysql2');

console.log('🔌 Probando conexión a MySQL...');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    port: 3306
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión:', err.message);
        console.log('\n🔧 Soluciones:');
        console.log('1. Verifica que XAMPP esté ejecutándose como Administrador');
        console.log('2. Prueba cambiar el host a 127.0.0.1');
        console.log('3. Verifica el puerto en XAMPP MySQL config');
    } else {
        console.log('✅ Conexión exitosa!');
        connection.query('SHOW DATABASES', (err, results) => {
            if (err) {
                console.error('Error en query:', err);
            } else {
                console.log('📊 Bases de datos:');
                results.forEach(db => console.log(' -', db.Database));
            }
            connection.end();
        });
    }
});