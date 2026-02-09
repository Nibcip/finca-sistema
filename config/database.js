const mysql = require('mysql2');


const pool = mysql.createPool({
    host: 'bobq0xtg7ibr1edpxglr-mysql.services.clever-cloud.com',
    user: 'uwsvkjgawwwi42gb',
    password: 'tky7Lu7Xphlurj54btpM',
    database: 'bobq0xtg7ibr1edpxglr',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0

});



module.exports = pool;