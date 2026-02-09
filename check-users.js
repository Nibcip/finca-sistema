const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión:', err.message);
        return;
    }
    
    console.log('🔍 Revisando usuarios en la base de datos...');
    
    connection.execute('SELECT id, name, email, password, role FROM users', (err, results) => {
        if (err) {
            console.error('❌ Error:', err.message);
            return;
        }
        
        console.log(`\n👥 Usuarios encontrados (${results.length}):`);
        results.forEach(user => {
            console.log('\n══════════════════════════════════════');
            console.log(`📧 Email: ${user.email}`);
            console.log(`👤 Nombre: ${user.name}`);
            console.log(`🎯 Rol: ${user.role}`);
            console.log(`🔑 Contraseña (hash): ${user.password}`);
            console.log(`🔑 Longitud: ${user.password.length} caracteres`);
        });
        
        connection.end();
    });
});