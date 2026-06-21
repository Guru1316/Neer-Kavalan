// API Configuration
const API_URL = 'https://neer-kavalan.onrender.com';

// Chart instances
let qualityChart = null;
let riskChart = null;
let parameterHealthChart = null;
let phDistributionChart = null;
let tdsDistributionChart = null;
let tempDistributionChart = null;

// Map instance
let map = null;
let markers = {};
let currentFilter = 'all';
let currentSearch = '';
let allReadings = [];
let alertInterval = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeCharts();
    fetchDashboardData();
    updateDateTime();
    setInterval(updateDateTime, 1000);
    setInterval(fetchDashboardData,  600000);
});

// Update Date/Time
function updateDateTime() {
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true
    };
    const dateTimeEl = document.getElementById('currentDateTime');
    if (dateTimeEl) {
        dateTimeEl.textContent = now.toLocaleDateString('en-IN', options);
    }
}

// Initialize Leaflet Map with proper controls
function initializeMap() {
    map = L.map('map', {
        center: [12.2, 78.16],
        zoom: 10,
        zoomControl: true,
        fadeAnimation: true,
        zoomAnimation: true,
        scrollWheelZoom: false,  // Prevents map from zooming on scroll
        dragging: true,           // Allows moving only by click-and-drag (hand symbol)
        zoomSnap: 0.25,
        zoomDelta: 0.5
    });
    
    // Disable scroll zoom completely
    map.scrollWheelZoom.disable();
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
}

// Reset Map View
function resetMapView() {
    map.setView([12.2, 78.16], 10);
}

// Initialize All Charts with better options
function initializeCharts() {
    // Quality Trends Chart
    const ctx1 = document.getElementById('qualityChart');
    if (ctx1) {
        qualityChart = new Chart(ctx1.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'pH',
                        data: [],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'TDS',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Turbidity',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Temperature',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            boxWidth: 12,
                            padding: 15,
                            font: { size: 11, family: 'Inter' },
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.9)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 12, family: 'Inter' },
                        bodyFont: { size: 11, family: 'Inter' }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#cbd5e1',
                            maxRotation: 45,
                            maxTicksLimit: 10,
                            font: { size: 10, family: 'Inter' }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.03)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 10, family: 'Inter' }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.03)'
                        }
                    }
                }
            }
        });
    }

    // Risk Distribution Chart
    const ctx2 = document.getElementById('riskChart');
    if (ctx2) {
        riskChart = new Chart(ctx2.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Safe', 'Warning', 'Critical'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
                    borderColor: 'rgba(10, 14, 26, 0.8)',
                    borderWidth: 3,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#e2e8f0',
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 11, family: 'Inter' }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let total = context.dataset.data.reduce((a, b) => a + b, 0);
                                let percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return `${context.label}: ${percentage}% (${context.parsed})`;
                            }
                        }
                    }
                },
                cutout: '72%'
            }
        });
    }

    // Parameter Health Chart
    const ctx3 = document.getElementById('parameterHealthChart');
    if (ctx3) {
        parameterHealthChart = new Chart(ctx3.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['pH', 'TDS', 'Turbidity', 'Temperature'],
                datasets: [{
                    label: 'Health Score',
                    data: [70, 70, 70, 70],
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    borderColor: '#8b5cf6',
                    borderWidth: 2,
                    pointBackgroundColor: '#8b5cf6',
                    pointRadius: 5,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 10, family: 'Inter' }
                        }
                    }
                },
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.05)' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        pointLabels: { 
                            color: '#cbd5e1', 
                            font: { size: 11, family: 'Inter' } 
                        },
                        ticks: { 
                            display: false,
                            stepSize: 20
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }

    // pH Distribution Chart
    const ctx4 = document.getElementById('phDistributionChart');
    if (ctx4) {
        phDistributionChart = new Chart(ctx4.getContext('2d'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'pH Level',
                    data: [],
                    backgroundColor: 'rgba(139, 92, 246, 0.6)',
                    borderColor: '#8b5cf6',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: 'rgba(139, 92, 246, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 10, family: 'Inter' }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 8, family: 'Inter' },
                            maxRotation: 45
                        },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 9, family: 'Inter' }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    // TDS Distribution Chart
    const ctx5 = document.getElementById('tdsDistributionChart');
    if (ctx5) {
        tdsDistributionChart = new Chart(ctx5.getContext('2d'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'TDS Level (ppm)',
                    data: [],
                    backgroundColor: 'rgba(245, 158, 11, 0.6)',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: 'rgba(245, 158, 11, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 10, family: 'Inter' }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 8, family: 'Inter' },
                            maxRotation: 45
                        },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 9, family: 'Inter' }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    // Temperature Distribution Chart
    const ctx6 = document.getElementById('tempDistributionChart');
    if (ctx6) {
        tempDistributionChart = new Chart(ctx6.getContext('2d'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature (°C)',
                    data: [],
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: '#ef4444',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: 'rgba(239, 68, 68, 0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e2e8f0',
                            font: { size: 10, family: 'Inter' }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 8, family: 'Inter' },
                            maxRotation: 45
                        },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: '#cbd5e1',
                            font: { size: 9, family: 'Inter' }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
}

// Toggle Chart View
function toggleChartView(type) {
    if (qualityChart) {
        qualityChart.config.type = type;
        qualityChart.update();
    }
}

// Fetch Dashboard Data
async function fetchDashboardData() {
    try {
        const [summaryRes, readingsRes, alertsRes] = await Promise.all([
            fetch(`${API_URL}/dashboard-summary`),
            fetch(`${API_URL}/latest-readings`),
            fetch(`${API_URL}/alerts`)
        ]);

        const summaryData = await summaryRes.json();
        const readingsData = await readingsRes.json();
        const alertsData = await alertsRes.json();

        allReadings = readingsData.readings || [];
        
        updateSummary(summaryData);
        updateMap(allReadings);
        updateTable(allReadings);
        updateCharts(allReadings);
        updateAlerts(alertsData.alerts);
        updateRiskIndex(allReadings);

        const updateTime = document.getElementById('updateTime');
        if (updateTime) {
            updateTime.textContent = new Date().toLocaleTimeString();
        }

    } catch (error) {
        console.error('Error fetching data:', error);
        handleError(error);
    }
}

// Update Summary
function updateSummary(data) {
    const elements = {
        totalVillages: document.getElementById('totalVillages'),
        safeVillages: document.getElementById('safeVillages'),
        warningVillages: document.getElementById('warningVillages'),
        dangerousVillages: document.getElementById('dangerousVillages'),
        activeAlerts: document.getElementById('activeAlerts'),
        alertCount: document.getElementById('alertCount'),
        tableCount: document.getElementById('tableCount')
    };

    if (elements.totalVillages) elements.totalVillages.textContent = data.total_villages || 0;
    if (elements.safeVillages) elements.safeVillages.textContent = data.safe_villages || 0;
    if (elements.warningVillages) elements.warningVillages.textContent = data.warning_villages || 0;
    if (elements.dangerousVillages) elements.dangerousVillages.textContent = data.dangerous_villages || 0;
    if (elements.activeAlerts) elements.activeAlerts.textContent = data.active_alerts || 0;
    if (elements.alertCount) elements.alertCount.textContent = data.active_alerts || 0;
    if (elements.tableCount) elements.tableCount.textContent = `${data.total_villages || 0} Villages`;
}

// Update Risk Index
function updateRiskIndex(readings) {
    if (!readings || readings.length === 0) {
        const riskIndex = document.getElementById('riskIndex');
        if (riskIndex) riskIndex.textContent = '0%';
        return;
    }
    
    const avgRisk = readings.reduce((sum, r) => sum + (r.risk_score || 0), 0) / readings.length;
    const riskPercent = Math.round(avgRisk);
    
    const riskIndex = document.getElementById('riskIndex');
    if (riskIndex) riskIndex.textContent = riskPercent + '%';
    
    const trend = document.getElementById('riskTrend');
    if (trend) {
        if (riskPercent < 40) {
            trend.innerHTML = '<i class="fas fa-arrow-down text-success"></i> Safe';
            trend.className = 'stat-footer text-success';
        } else if (riskPercent < 70) {
            trend.innerHTML = '<i class="fas fa-arrow-up text-warning"></i> Moderate';
            trend.className = 'stat-footer text-warning';
        } else {
            trend.innerHTML = '<i class="fas fa-arrow-up text-danger"></i> Critical';
            trend.className = 'stat-footer text-danger';
        }
    }
}

// Update Map with village coordinates
function updateMap(readings) {
    if (!readings || !map) return;
    
    Object.values(markers).forEach(marker => map.removeLayer(marker));
    markers = {};

    const villageCoords = {
        "Adagappadi": [12.08, 78.12],
        "Akkamanahalli": [12.09, 78.14],
        "Aandihalli": [12.10, 78.10],
        "A.Gollahalli": [12.11, 78.16],
        "HaleDharmapuri": [12.12, 78.15],
        "Kadagathur": [12.13, 78.18],
        "Kondampatti": [12.14, 78.13],
        "Kondagarahalli": [12.15, 78.19],
        "Konanginaickanahalli": [12.16, 78.11],
        "Koduhalli": [12.17, 78.20],
        "Krishnapuram": [12.18, 78.17],
        "Kuppur": [12.19, 78.22],
        "Lakkiyampatti": [12.20, 78.14],
        "Mookanur": [12.21, 78.16],
        "Naickanahalli": [12.22, 78.18],
        "K.Naduhalli": [12.23, 78.12],
        "Nallasenahalli": [12.24, 78.15],
        "Noolahalli": [12.25, 78.20],
        "Puluthikarai": [12.26, 78.13],
        "Semmandakuppam": [12.27, 78.17],
        "Settikarai": [12.28, 78.19],
        "Sogathur": [12.29, 78.14],
        "Thippireddihalli": [12.30, 78.16],
        "Unguranahalli": [12.31, 78.21],
        "Vellalapatti": [12.32, 78.18],
        "Vellolai": [12.33, 78.15],
        "V.Muthampatti": [12.34, 78.22],
        "Mukkalnaickanpatti": [12.35, 78.19]
    };

    readings.forEach(reading => {
        const coords = villageCoords[reading.village_name] || [12.2 + Math.random() * 0.3, 78.16 + Math.random() * 0.3];
        
        const color = reading.status === 'Safe' ? '#22c55e' :
                      reading.status === 'Warning' ? '#f59e0b' : '#ef4444';
        
        const marker = L.circleMarker(coords, {
            radius: 16,
            fillColor: color,
            color: '#fff',
            weight: 2.5,
            opacity: 0.9,
            fillOpacity: 0.85,
            className: 'village-marker'
        }).addTo(map);

        marker.bindPopup(`
            <div style="color: #000; min-width: 220px; max-width: 280px; padding: 4px;">
                <h6 style="font-weight: 700; margin-bottom: 10px; color: #1a2d4a; font-size: 16px;">
                    <i class="fas fa-water" style="color: #2563eb;"></i> ${reading.village_name}
                </h6>
                <div style="margin-bottom: 8px; padding: 6px 10px; background: #f3f4f6; border-radius: 6px;">
                    <span style="font-weight: 600;">Status:</span>
                    <span style="color: ${color}; font-weight: 700; text-transform: uppercase;">${reading.status}</span>
                    <span class="badge ${reading.status === 'Safe' ? 'bg-success' : reading.status === 'Warning' ? 'bg-warning' : 'bg-danger'} ms-2">
                        ${reading.risk_score}/100
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 0.82rem;">
                    <div><span style="font-weight: 600;">pH:</span> ${reading.ph} ${reading.ph >= 6.5 && reading.ph <= 8.5 ? '✅' : '⚠️'}</div>
                    <div><span style="font-weight: 600;">TDS:</span> ${reading.tds} ppm</div>
                    <div><span style="font-weight: 600;">Turbidity:</span> ${reading.turbidity} NTU</div>
                    <div><span style="font-weight: 600;">Temperature:</span> ${reading.temperature}°C</div>
                </div>
                <div style="font-size: 0.6rem; color: #6b7280; margin-top: 8px; border-top: 1px solid #e5e7eb; padding-top: 6px;">
                    <i class="far fa-clock"></i> ${reading.timestamp ? new Date(reading.timestamp).toLocaleString() : 'N/A'}
                </div>
            </div>
        `, {
            maxWidth: 300,
            minWidth: 200
        });

        // Only open popup on click, not hover
        marker.on('click', function(e) {
            this.openPopup();
        });

        markers[reading.village_name] = marker;
    });

    if (Object.keys(markers).length > 0) {
        const group = L.featureGroup(Object.values(markers));
        map.fitBounds(group.getBounds().pad(0.1));
    }
}

// Filter Table
function filterTable(status) {
    currentFilter = status;
    
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === status);
    });
    
    applyFilters();
}

// Search Table
function searchTable(query) {
    currentSearch = query.toLowerCase().trim();
    applyFilters();
}

// Apply Filters
function applyFilters() {
    let filtered = allReadings;
    
    // Apply status filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(r => r.status === currentFilter);
    }
    
    // Apply search filter
    if (currentSearch) {
        filtered = filtered.filter(r => 
            r.village_name.toLowerCase().includes(currentSearch)
        );
    }
    
    updateTable(filtered);
}

// Update Table
function updateTable(readings) {
    const tbody = document.getElementById('villageTableBody');
    
    if (!tbody) return;
    
    if (!readings || readings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="fas fa-search fa-2x mb-2 d-block"></i>
                    No matching villages found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = readings.map((reading, index) => `
        <tr class="tr-${reading.status ? reading.status.toLowerCase() : ''}">
            <td>${index + 1}</td>
            <td><strong>${reading.village_name}</strong></td>
            <td>${reading.ph || 'N/A'}</td>
            <td>${reading.tds || 'N/A'}</td>
            <td>${reading.turbidity || 'N/A'}</td>
            <td>${reading.temperature || 'N/A'}</td>
            <td>
                <span class="badge ${reading.risk_score < 40 ? 'bg-success' : reading.risk_score <= 70 ? 'bg-warning' : 'bg-danger'}">
                    ${reading.risk_score || 0}
                </span>
            </td>
            <td>
                <span class="status-badge ${(reading.status || 'unknown').toLowerCase()}">
                    ${reading.status || 'Unknown'}
                </span>
            </td>
            <td style="font-size: 0.7rem; color: var(--text-muted);">
                ${reading.timestamp ? new Date(reading.timestamp).toLocaleTimeString() : 'N/A'}
            </td>
        </tr>
    `).join('');
    
    // Update count
    const countEl = document.getElementById('tableCount');
    if (countEl) {
        countEl.textContent = `${readings.length} Villages`;
    }
}

// Update All Charts
function updateCharts(readings) {
    if (!readings || readings.length === 0) return;

    // Update Quality Chart
    const sorted = [...readings].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    const latest = sorted.slice(-10);
    const labels = latest.map(r => r.village_name.substring(0, 10));
    
    if (qualityChart) {
        qualityChart.data.labels = labels;
        qualityChart.data.datasets[0].data = latest.map(r => r.ph || 0);
        qualityChart.data.datasets[1].data = latest.map(r => r.tds || 0);
        qualityChart.data.datasets[2].data = latest.map(r => r.turbidity || 0);
        qualityChart.data.datasets[3].data = latest.map(r => r.temperature || 0);
        qualityChart.update();
    }

    // Update Risk Distribution
    const safe = readings.filter(r => r.status === 'Safe').length;
    const warning = readings.filter(r => r.status === 'Warning').length;
    const dangerous = readings.filter(r => r.status === 'Dangerous').length;
    const total = readings.length;
    
    if (riskChart) {
        riskChart.data.datasets[0].data = [safe, warning, dangerous];
        riskChart.update();
    }
    
    // Update risk stats
    const safePercent = total > 0 ? Math.round((safe / total) * 100) : 0;
    const warningPercent = total > 0 ? Math.round((warning / total) * 100) : 0;
    const dangerousPercent = total > 0 ? Math.round((dangerous / total) * 100) : 0;
    
    const safeEl = document.getElementById('safePercent');
    const warningEl = document.getElementById('warningPercent');
    const dangerousEl = document.getElementById('dangerousPercent');
    
    if (safeEl) safeEl.textContent = `${safePercent}%`;
    if (warningEl) warningEl.textContent = `${warningPercent}%`;
    if (dangerousEl) dangerousEl.textContent = `${dangerousPercent}%`;

    // Update Parameter Health
    const avgPh = readings.reduce((sum, r) => sum + (r.ph || 0), 0) / readings.length;
    const avgTds = readings.reduce((sum, r) => sum + (r.tds || 0), 0) / readings.length;
    const avgTurbidity = readings.reduce((sum, r) => sum + (r.turbidity || 0), 0) / readings.length;
    const avgTemp = readings.reduce((sum, r) => sum + (r.temperature || 0), 0) / readings.length;
    
    if (parameterHealthChart) {
        parameterHealthChart.data.datasets[0].data = [
            Math.min((avgPh / 8.5) * 100, 100),
            Math.min((avgTds / 500) * 100, 100),
            Math.min((avgTurbidity / 5) * 100, 100),
            Math.min((avgTemp / 35) * 100, 100)
        ];
        parameterHealthChart.update();
    }

    // Update Distribution Charts
    const villages = readings.map(r => r.village_name.substring(0, 8));
    const phValues = readings.map(r => r.ph || 0);
    const tdsValues = readings.map(r => r.tds || 0);
    const tempValues = readings.map(r => r.temperature || 0);

    if (phDistributionChart) {
        phDistributionChart.data.labels = villages;
        phDistributionChart.data.datasets[0].data = phValues;
        phDistributionChart.update();
    }

    if (tdsDistributionChart) {
        tdsDistributionChart.data.labels = villages;
        tdsDistributionChart.data.datasets[0].data = tdsValues;
        tdsDistributionChart.update();
    }

    if (tempDistributionChart) {
        tempDistributionChart.data.labels = villages;
        tempDistributionChart.data.datasets[0].data = tempValues;
        tempDistributionChart.update();
    }
}

// Update Alerts
function updateAlerts(alerts) {
    const container = document.getElementById('alertsContainer');
    
    if (!container) return;
    
    console.log('📊 Updating alerts:', alerts);
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle fa-3x mb-3"></i>
                <p>No active alerts</p>
                <small>System is running normally</small>
            </div>
        `;
        return;
    }

    container.innerHTML = alerts.slice(0, 15).map(alert => `
        <div class="alert-item ${alert.status ? alert.status.toLowerCase() : 'warning'}">
            <div class="d-flex justify-content-between align-items-start">
                <div style="flex: 1;">
                    <strong>${alert.village_name || 'Unknown'}</strong>
                    <p class="alert-message">${alert.message || 'No message'}</p>
                </div>
                <span class="alert-time">
                    ${alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'N/A'}
                </span>
            </div>
        </div>
    `).join('');

    // Show banner if there are dangerous alerts
    const hasDanger = alerts.some(a => a.status === 'Dangerous');
    // const banner = document.getElementById('alertBanner');
    // if (banner) {
    //     if (hasDanger) {
    //         banner.style.display = 'block';
    //         const bannerMsg = document.getElementById('bannerMessage');
    //         if (bannerMsg) {
    //             const dangerCount = alerts.filter(a => a.status === 'Dangerous').length;
    //             bannerMsg.textContent = `🚨 CRITICAL: ${dangerCount} village(s) with contamination risk detected! Immediate action required.`;
    //         }
    //     } else {
    //         banner.style.display = 'none';
    //     }
    // }
}

// Clear Alerts
function clearAlerts() {
    const container = document.getElementById('alertsContainer');
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-check-circle fa-3x mb-3"></i>
                <p>Alerts cleared</p>
                <small>System is running normally</small>
            </div>
        `;
    }
}

// Export Data
function exportData() {
    const table = document.getElementById('villageTable');
    if (!table) return;
    
    const rows = table.querySelectorAll('tbody tr');
    let csv = 'Village,pH,TDS,Turbidity,Temperature,Risk Score,Status,Last Updated\n';
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
            const data = Array.from(cells).map(cell => cell.textContent.trim());
            csv += data.join(',') + '\n';
        }
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aquaalert_data_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Print Table
function printTable() {
    window.print();
}

// Refresh Data
function refreshData() {
    const tbody = document.getElementById('villageTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    Refreshing...
                </td>
            </tr>
        `;
    }
    fetchDashboardData();
}

// Error Handling
function handleError(error) {
    console.error('API Error:', error);
    const container = document.getElementById('alertsContainer');
    if (container) {
        container.innerHTML = `
            <div class="empty-state text-danger">
                <i class="fas fa-exclamation-circle fa-3x mb-3"></i>
                <p>Connection Error</p>
                <small>Unable to connect to server.</small>
                <br>
                <small class="text-muted">Make sure: python main.py is running on port 8000</small>
            </div>
        `;
    }
}

// Make functions globally available
window.exportData = exportData;
window.refreshData = refreshData;
window.filterTable = filterTable;
window.searchTable = searchTable;
window.toggleChartView = toggleChartView;
window.resetMapView = resetMapView;
window.clearAlerts = clearAlerts;
window.printTable = printTable;