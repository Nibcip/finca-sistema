// config/database.js
const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Deja vacío si no tienes contraseña
    database: 'ganasys' // CAMBIADO: Usa 'ganasys' en lugar de 'ganasys_db'
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Error conectando a la base de datos:', err.message);
        console.log('⚠️  Creando base de datos...');
        
        // Crear conexión temporal sin base de datos
        const tempConnection = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: ''
        });
        
        tempConnection.connect((connectErr) => {
            if (connectErr) {
                console.error('❌ Error conectando a MySQL:', connectErr.message);
                return;
            }
            
            // Crear base de datos si no existe
            tempConnection.query('CREATE DATABASE IF NOT EXISTS ganasys', (dbErr) => {
                if (dbErr) {
                    console.error('❌ Error creando base de datos:', dbErr.message);
                } else {
                    console.log('✅ Base de datos "ganasys" creada/verificada');
                    
                    // Conectar a la base de datos recién creada
                    connection.config.database = 'ganasys';
                    connection.connect((reconnectErr) => {
                        if (reconnectErr) {
                            console.error('❌ Error reconectando:', reconnectErr.message);
                        } else {
                            console.log('✅ Conectado a la base de datos MySQL: ganasys');
                        }
                    });
                }
                tempConnection.end();
            });
        });
        return;
    }
    console.log('✅ Conectado a la base de datos MySQL: ganasys');
});

module.exports = connection;