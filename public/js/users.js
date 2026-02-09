// JavaScript para la gestión de usuarios - VERSIÓN SIMPLIFICADA
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Sistema de usuarios iniciado');
    
    // 1. Botón de crear usuario
    const addForm = document.getElementById('addUserForm');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            e.preventDefault();
            crearUsuario();
        });
    }
    
    // 2. Botones de editar
    document.querySelectorAll('.btn-outline-primary').forEach(boton => {
        boton.addEventListener('click', function() {
            const fila = this.closest('tr');
            const idUsuario = fila.getAttribute('data-user-id');
            if (idUsuario) {
                abrirEditor(idUsuario);
            }
        });
    });
    
    // 3. Botones de eliminar
    document.querySelectorAll('.btn-outline-danger').forEach(boton => {
        boton.addEventListener('click', function() {
            const fila = this.closest('tr');
            const idUsuario = fila.getAttribute('data-user-id');
            const nombreUsuario = fila.querySelector('[data-user-name]').getAttribute('data-user-name');
            if (idUsuario) {
                eliminarUsuario(idUsuario, nombreUsuario);
            }
        });
    });
    
    console.log('✅ Botones configurados correctamente');
});

// FUNCIÓN PARA CREAR USUARIO
function crearUsuario() {
    const formulario = document.getElementById('addUserForm');
    const boton = document.getElementById('btnGuardarNuevoUsuario');

    if (!boton) {
        console.error('No se encontró botón de creación');
        return;
    }
    
    // Mostrar "cargando"
    const textoOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
    
    // Obtener datos
    const datos = {
        name: formulario.querySelector('[name="name"]').value,
        email: formulario.querySelector('[name="email"]').value,
        password: formulario.querySelector('[name="password"]').value,
        role: formulario.querySelector('[name="role"]').value,
        status: formulario.querySelector('[name="status"]').value
    };
    
    console.log('Enviando datos:', datos);
    
    fetch('/users/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    })
    .then(respuesta => respuesta.json())
    .then(resultado => {
        if (resultado.success) {
            mostrarMensaje('success', resultado.message);
            
            // Cerrar ventana
            const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
            if (modal) modal.hide();
            
            // Recargar página después de 1 segundo
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            mostrarMensaje('danger', resultado.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarMensaje('danger', 'Error de conexión');
    })
    .finally(() => {
        // Restaurar botón
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
    });
}

// FUNCIÓN PARA EDITAR USUARIO
function abrirEditor(idUsuario) {
    console.log('Abriendo editor para usuario ID:', idUsuario);
    
    // Mostrar mensaje de carga
    mostrarMensaje('info', 'Cargando datos del usuario...');
    
    // Primero probamos si la ruta funciona
    fetch('/users/test/' + idUsuario)
    .then(respuesta => {
        console.log('Test respuesta:', respuesta.status);
        if (respuesta.ok) {
            return respuesta.json();
        } else {
            throw new Error('Ruta de prueba no funciona');
        }
    })
    .then(resultadoTest => {
        console.log('Test funcionó:', resultadoTest);
        
        // Ahora cargar datos reales
        return fetch('/users/' + idUsuario);
    })
    .then(respuesta => {
        console.log('Respuesta real:', respuesta.status);
        if (!respuesta.ok) {
            throw new Error('No se pudo cargar el usuario');
        }
        return respuesta.json();
    })
    .then(resultado => {
        if (resultado.success) {
            const usuario = resultado.user;
            
            // Llenar formulario
            document.getElementById('editUserId').value = usuario.id;
            document.getElementById('editUserName').value = usuario.name;
            document.getElementById('editUserEmail').value = usuario.email;
            document.getElementById('editUserPassword').value = '';
            document.getElementById('editUserRole').value = usuario.role;
            
            // Mostrar ventana de edición
            const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
            modal.show();
            
            mostrarMensaje('success', 'Datos cargados correctamente');
        } else {
            mostrarMensaje('danger', resultado.error);
        }
    })
    .catch(error => {
        console.error('Error cargando usuario:', error);
        mostrarMensaje('danger', 'Error: ' + error.message);
        
        // Mostrar ventana con datos de ejemplo
        document.getElementById('editUserId').value = idUsuario;
        document.getElementById('editUserName').value = 'Usuario ' + idUsuario;
        document.getElementById('editUserEmail').value = 'usuario' + idUsuario + '@ejemplo.com';
        document.getElementById('editUserPassword').value = '';
        document.getElementById('editUserRole').value = 'operador';
        
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();
    });
}

// FUNCIÓN PARA ACTUALIZAR USUARIO
function actualizarUsuario() {
    const formulario = document.getElementById('editUserForm');
    const idUsuario = document.getElementById('editUserId').value;
    const boton = formulario.querySelector('button[type="submit"]');
    
    if (!idUsuario) {
        mostrarMensaje('danger', 'No se encontró el ID del usuario');
        return;
    }
    
    // Mostrar "cargando"
    const textoOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    // Obtener datos
    const datos = {
        name: formulario.querySelector('[name="name"]').value,
        email: formulario.querySelector('[name="email"]').value,
        role: formulario.querySelector('[name="role"]').value,
        password: formulario.querySelector('[name="password"]').value
    };
    
    // Si no hay contraseña nueva, quitarla
    if (!datos.password) {
        delete datos.password;
    }
    
    console.log('Actualizando usuario:', datos);
    
    fetch('/users/' + idUsuario, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    })
    .then(respuesta => respuesta.json())
    .then(resultado => {
        if (resultado.success) {
            mostrarMensaje('success', resultado.message);
            
            // Cerrar ventana
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            if (modal) modal.hide();
            
            // Recargar página después de 1 segundo
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            mostrarMensaje('danger', resultado.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarMensaje('danger', 'Error de conexión');
    })
    .finally(() => {
        // Restaurar botón
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
    });
}

// FUNCIÓN PARA ELIMINAR USUARIO
function eliminarUsuario(idUsuario, nombreUsuario) {
    if (!confirm(`¿Estás seguro de eliminar a "${nombreUsuario}"?\nEsta acción no se puede deshacer.`)) {
        return;
    }
    
    mostrarMensaje('info', 'Eliminando usuario...');
    
    fetch('/users/' + idUsuario, {
        method: 'DELETE'
    })
    .then(respuesta => respuesta.json())
    .then(resultado => {
        if (resultado.success) {
            mostrarMensaje('success', resultado.message);
            
            // Quitar la fila de la tabla
            const fila = document.querySelector(`tr[data-user-id="${idUsuario}"]`);
            if (fila) {
                fila.remove();
            }
        } else {
            mostrarMensaje('danger', resultado.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        mostrarMensaje('danger', 'Error de conexión');
    });
}

// FUNCIÓN PARA MOSTRAR MENSAJES
function mostrarMensaje(tipo, texto) {
    // Crear elemento de mensaje
    const mensaje = document.createElement('div');
    mensaje.className = `alert alert-${tipo} alert-dismissible fade show`;
    mensaje.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        max-width: 400px;
    `;
    
    mensaje.innerHTML = `
        <strong>${tipo === 'success' ? '✅' : tipo === 'danger' ? '❌' : 'ℹ️'}</strong>
        ${texto}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Agregar al documento
    document.body.appendChild(mensaje);
    
    // Quitar después de 5 segundos
    setTimeout(() => {
        if (mensaje.parentNode) {
            mensaje.remove();
        }
    }, 5000);
}

// Configurar formulario de edición
const editForm = document.getElementById('editUserForm');
if (editForm) {
    editForm.addEventListener('submit', function(e) {
        e.preventDefault();
        actualizarUsuario();
    });
}

console.log('✅ Sistema de usuarios listo para usar');