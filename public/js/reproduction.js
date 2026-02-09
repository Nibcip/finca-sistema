// JavaScript para el módulo de reproducción
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar gráficos
    initCharts();
    
    // Configurar formularios
    setupForms();
});

function initCharts() {
    // Gráfico de tipos de reproducción
    const ctx = document.getElementById('tipoReproduccionChart');
    if (ctx) {
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Monta Natural', 'Inseminación', 'Transferencia'],
                datasets: [{
                    data: [12, 8, 3],
                    backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

function setupForms() {
    // Formulario de nueva reproducción
    const addForm = document.getElementById('addReproductionForm');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            e.preventDefault();
            addReproduction();
        });
    }
}

function addReproduction() {
    const formData = new FormData(document.getElementById('addReproductionForm'));
    const data = Object.fromEntries(formData);
    
    fetch('/reproduction/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('✅ ' + result.message);
            location.reload();
        } else {
            alert('❌ ' + result.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('❌ Error al agregar registro');
    });
}

function showDetail(id) {
    fetch(`/reproduction/detail/${id}`)
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            // Mostrar detalles en un modal
            alert(`Detalles del registro ${id}`);
        } else {
            alert('❌ ' + result.error);
        }
    });
}

function registrarParto(id) {
    const fechaParto = prompt('Ingrese la fecha real del parto (YYYY-MM-DD):');
    if (fechaParto) {
        const criasVivas = prompt('Número de crías vivas:');
        const criasMuertas = prompt('Número de crías muertas:');
        const peso = prompt('Peso promedio de las crías (kg):');
        
        const data = {
            reproduccion_id: id,
            fecha_parto_real: fechaParto,
            crias_vivas: parseInt(criasVivas) || 0,
            crias_muertas: parseInt(criasMuertas) || 0,
            peso_promedio: parseFloat(peso) || 0,
            complicaciones: prompt('Complicaciones (opcional):') || ''
        };
        
        fetch('/reproduction/registrar-parto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('✅ ' + result.message);
                location.reload();
            } else {
                alert('❌ ' + result.error);
            }
        });
    }
}

function cambiarEstado(id, estado) {
    if (confirm(`¿Está seguro de cambiar el estado a ${estado.toUpperCase()}?`)) {
        fetch(`/reproduction/update-status/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ estado: estado })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('✅ ' + result.message);
                location.reload();
            } else {
                alert('❌ ' + result.error);
            }
        });
    }
}