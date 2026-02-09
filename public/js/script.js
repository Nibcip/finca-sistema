// Funcionalidad para gráficos
document.addEventListener('DOMContentLoaded', function() {
    // Gráfico de producción de leche
    const milkCtx = document.getElementById('milkProductionChart');
    if (milkCtx) {
        const milkData = JSON.parse(milkCtx.getAttribute('data-production'));
        new Chart(milkCtx, {
            type: 'line',
            data: {
                labels: Array.from({length: milkData.length}, (_, i) => i + 1),
                datasets: [{
                    label: 'Litros de leche',
                    data: milkData,
                    borderColor: '#4e73df',
                    backgroundColor: 'rgba(78, 115, 223, 0.05)',
                    pointRadius: 3,
                    pointBackgroundColor: '#4e73df',
                    pointBorderColor: '#4e73df',
                    pointHoverRadius: 5,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 70,
                        ticks: {
                            stepSize: 10
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Gráfico de ventas mensuales
    const salesCtx = document.getElementById('monthlySalesChart');
    if (salesCtx) {
        const salesData = JSON.parse(salesCtx.getAttribute('data-sales'));
        new Chart(salesCtx, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'],
                datasets: [{
                    label: 'Ventas ($)',
                    data: salesData,
                    backgroundColor: '#1cc88a',
                    hoverBackgroundColor: '#17a673',
                    barPercentage: 0.5
                }]
            },
            options: {
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    // Toggle sidebar en móviles
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function(e) {
            e.preventDefault();
            document.body.classList.toggle('sidebar-toggled');
            document.querySelector('.sidebar').classList.toggle('toggled');
        });
    }
});

// Funciones para formularios y validaciones
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.addEventListener('submit', function(e) {
            let isValid = true;
            const inputs = form.querySelectorAll('input[required]');
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.classList.add('is-invalid');
                } else {
                    input.classList.remove('is-invalid');
                }
            });
            
            if (!isValid) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }
}

// Inicializar validaciones cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    validateForm('loginForm');
    validateForm('userForm');
    validateForm('cattleForm');
    validateForm('pigForm');
    validateForm('vaccinationForm');
    validateForm('saleForm');
});

// Funciones para mostrar/ocultar modales
function showModal(modalId) {
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
}

function hideModal(modalId) {
    const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
    modal.hide();
}