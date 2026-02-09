const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306
});

console.log('🔍 Verificando base de datos ganasys...');

connection.connect((err) => {
    if (err) {
        console.error('❌ Error de conexión:', err.message);
        console.log('\n📋 Posibles soluciones:');
        console.log('1. Verifica que XAMPP esté ejecutándose con MySQL en verde');
        console.log('2. Asegúrate de que la base de datos "ganasys" existe');
        console.log('3. Revisa el usuario y contraseña en app.js');
        return;
    }
    
    console.log('✅ Conexión exitosa a MySQL');
    
    // Verificar tablas
    connection.execute('SHOW TABLES', (err, results) => {
        if (err) {
            console.error('❌ Error al verificar tablas:', err);
        } else {
            console.log('\n📊 Tablas encontradas en la base de datos:');
            if (results.length === 0) {
                console.log('❌ No hay tablas. Debes importar database.sql');
            } else {
                results.forEach((row, index) => {
                    console.log(`${index + 1}. ${row.Tables_in_ganasys}`);
                });
            }
            
            // Verificar usuarios
            connection.execute('SELECT COUNT(*) as total FROM users', (err, userResults) => {
                if (err) {
                    console.log('\n❌ Error al verificar usuarios:', err.message);
                    console.log('La tabla users probablemente no existe');
                } else {
                    console.log(`\n👥 Usuarios en sistema: ${userResults[0].total}`);
                    
                    // Mostrar usuarios
                    connection.execute('SELECT id, name, email, role FROM users', (err, users) => {
                        if (err) {
                            console.log('❌ Error al obtener usuarios:', err);
                        } else {
                            console.log('\n📋 Lista de usuarios:');
                            users.forEach(user => {
                                console.log(`- ${user.name} (${user.email}) - ${user.role}`);
                            });
                        }
                        connection.end();
                    });
                }
            });
        }
    });
});