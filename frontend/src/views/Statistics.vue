<template>
  <div class="statistics">
    <header class="header">
      <div class="header-content">
        <h1 class="title">Statistics</h1>
        <button @click="goToDashboard" class="back-button">
          ← Back to Dashboard
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <p>Loading statistics...</p>
      </div>

      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="fetchStatistics" class="retry-button">Retry</button>
      </div>

      <div v-else class="statistics-container">
        <!-- Year Toggles -->
        <div class="year-toggles">
          <h2 class="section-title">Select Years</h2>
          <div class="toggle-grid">
            <label
              v-for="yearData in years"
              :key="yearData.year"
              class="toggle-item"
            >
              <input
                type="checkbox"
                v-model="selectedYears"
                :value="yearData.year"
                class="toggle-checkbox"
              />
              <span class="toggle-label">
                {{ yearData.year }}
                <span class="toggle-total">({{ yearData.totalDistance.toLocaleString() }} km)</span>
              </span>
            </label>
          </div>
        </div>

        <!-- Chart -->
        <div class="chart-container">
          <h2 class="section-title">Weekly Distance (km)</h2>
          <canvas ref="chartCanvas"></canvas>
        </div>

        <!-- Legend showing totals -->
        <div v-if="selectedYears.length > 0" class="totals">
          <h3 class="subsection-title">Total Distance by Year</h3>
          <div class="totals-grid">
            <div
              v-for="yearData in filteredYears"
              :key="yearData.year"
              class="total-card"
            >
              <span class="total-year">{{ yearData.year }}</span>
              <span class="total-distance">{{ yearData.totalDistance.toLocaleString() }} km</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend } from 'chart.js';
import axios from 'axios';

// Register Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

const router = useRouter();

const years = ref([]);
const selectedYears = ref([]);
const isLoading = ref(true);
const error = ref('');
const chartCanvas = ref(null);
let chartInstance = null;

const filteredYears = computed(() => {
  return years.value.filter(y => selectedYears.value.includes(y.year));
});

async function fetchStatistics() {
  try {
    isLoading.value = true;
    error.value = '';

    const response = await axios.get('/api/statistics/weekly-distance', {
      withCredentials: true,
    });

    years.value = response.data.years;

    // Auto-select the most recent year
    if (years.value.length > 0) {
      selectedYears.value = [years.value[0].year];
    }
  } catch (err) {
    console.error('Failed to fetch statistics:', err);
    error.value = 'Failed to load statistics. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

function createChart() {
  if (!chartCanvas.value) return;

  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = chartCanvas.value.getContext('2d');

  const datasets = filteredYears.value.map((yearData, index) => {
    const colors = [
      '#667eea',
      '#f59e0b',
      '#10b981',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
    ];
    const color = colors[index % colors.length];

    return {
      label: yearData.year.toString(),
      data: yearData.weeks.map(w => w.distance),
      borderColor: color,
      backgroundColor: color + '20',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 2,
      pointHoverRadius: 5,
    };
  });

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 52 }, (_, i) => `Week ${i + 1}`),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
              weight: 'bold',
            },
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} km`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Week of Year',
            font: {
              size: 14,
              weight: 'bold',
            },
          },
          ticks: {
            maxTicksLimit: 13, // Show every 4 weeks
          },
        },
        y: {
          title: {
            display: true,
            text: 'Distance (km)',
            font: {
              size: 14,
              weight: 'bold',
            },
          },
          beginAtZero: true,
        },
      },
    },
  });
}

function goToDashboard() {
  router.push('/dashboard');
}

// Watch for changes in selected years and recreate chart
watch(selectedYears, async () => {
  await nextTick();
  createChart();
});

onMounted(async () => {
  await fetchStatistics();
  await nextTick();
  createChart();
});
</script>

<style scoped>
.statistics {
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header-content {
  margin: 0 auto;
  padding: 0 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0;
}

.back-button {
  padding: 0.5rem 1.5rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s;
}

.back-button:hover {
  background: white;
  color: #667eea;
}

.main {
  width: 100%;
  padding: 3rem;
}

.loading,
.error {
  text-align: center;
  padding: 3rem 1rem;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  color: #c33;
}

.retry-button {
  margin-top: 1rem;
  padding: 0.75rem 2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.3s;
}

.retry-button:hover {
  background: #5568d3;
}

.statistics-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  grid-template-rows: auto auto;
  gap: 2rem;
}

.year-toggles {
  grid-column: 1;
  grid-row: 1;
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  align-self: start;
}

.chart-container {
  grid-column: 2;
  grid-row: 1;
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.totals {
  grid-column: 1 / -1;
  grid-row: 2;
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1.5rem 0;
  color: #333;
}

.subsection-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: #333;
}

.toggle-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.toggle-item:hover {
  border-color: #667eea;
  background: #eef2ff;
}

.toggle-checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.toggle-label {
  flex: 1;
  font-weight: 600;
  color: #333;
}

.toggle-total {
  display: block;
  font-size: 0.875rem;
  font-weight: 400;
  color: #666;
  margin-top: 0.25rem;
}

.chart-container {
  min-height: 700px;
}

.chart-container canvas {
  max-height: 700px;
}

.totals-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.total-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  text-align: center;
}

.total-year {
  font-size: 1.25rem;
  font-weight: 700;
  color: #667eea;
}

.total-distance {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
}

</style>
