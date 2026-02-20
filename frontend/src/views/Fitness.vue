<template>
  <div class="fitness">
    <header class="header">
      <div class="header-content">
        <h1 class="title">Fitness</h1>
        <button @click="router.push('/dashboard')" class="back-button">← Back to Dashboard</button>
      </div>
    </header>

    <main class="main">
      <!-- Card 1: PMC Chart -->
      <div class="card">
        <div class="card-header-row">
          <h2 class="card-title">Performance Management Chart</h2>
          <div class="range-toggles">
            <button
              v-for="r in ranges"
              :key="r.label"
              :class="['range-btn', { active: activeRange === r.label }]"
              @click="setRange(r.label)"
            >{{ r.label }}</button>
          </div>
        </div>

        <p v-if="pmcMeta" class="pmc-meta">
          Power TSS: <strong>{{ pmcMeta.powerRideCount }}</strong> rides &nbsp;|&nbsp;
          hrTSS: <strong>{{ pmcMeta.hrRideCount }}</strong> rides
        </p>

        <div v-if="pmcLoading" class="loading-inline">Loading PMC…</div>
        <div v-else-if="pmcError" class="error-inline">{{ pmcError }}</div>
        <div v-else class="chart-wrap">
          <canvas ref="pmcCanvas"></canvas>
        </div>
      </div>

      <!-- Card 3: Whoop / HRV -->
      <div class="card">
        <h2 class="card-title">HRV &amp; Recovery (Whoop)</h2>

        <div v-if="whoopStatus === null" class="loading-inline">Checking Whoop status…</div>

        <div v-else-if="!whoopStatus.connected" class="whoop-connect">
          <p>Connect your Whoop account to see HRV and recovery scores overlaid on your training load.</p>
          <a href="/whoop/login" class="connect-btn">Connect Whoop</a>
        </div>

        <div v-else class="whoop-connected">
          <div class="whoop-meta">
            <span v-if="whoopStatus.last_sync">Last sync: {{ whoopStatus.last_sync }}</span>
            <button class="sync-btn" @click="handleWhoopSync" :disabled="whoopSyncing">
              {{ whoopSyncing ? 'Syncing…' : 'Sync Now' }}
            </button>
            <button class="disconnect-btn" @click="handleWhoopDisconnect">Disconnect</button>
          </div>

          <div v-if="hrvLoading" class="loading-inline">Loading HRV data…</div>
          <div v-else-if="hrvData.length === 0" class="empty-hint">No HRV data yet. Try syncing.</div>
          <div v-else class="chart-wrap">
            <canvas ref="hrvCanvas"></canvas>
          </div>
        </div>
      </div>

      <!-- Card 3: FTP History -->
      <div class="card">
        <h2 class="card-title">FTP History</h2>

        <p v-if="stravaFtp" class="ftp-info">
          Current FTP from Strava: <strong>{{ stravaFtp }}w</strong>
          <span class="ftp-hint">(re-authorise to refresh)</span>
        </p>

        <table class="ftp-table" v-if="ftpHistory.length > 0">
          <thead>
            <tr>
              <th>Valid From</th>
              <th>FTP (W)</th>
              <th>LTHR (bpm)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in ftpHistory" :key="entry.id">
              <td>{{ entry.valid_from }}</td>
              <td>{{ entry.ftp }}</td>
              <td>{{ entry.lthr ?? '—' }}</td>
              <td>
                <button class="delete-btn" @click="handleDeleteFtp(entry.id)">Delete</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-hint">No FTP entries yet.</p>

        <form class="ftp-form" @submit.prevent="handleAddFtp">
          <h3 class="form-title">Add Entry</h3>
          <div class="form-row">
            <label>
              Date
              <input type="date" v-model="newFtp.valid_from" required />
            </label>
            <label>
              FTP (W)
              <input type="number" v-model="newFtp.ftp" min="1" required placeholder="e.g. 300" />
            </label>
            <label>
              LTHR (opt.)
              <input type="number" v-model="newFtp.lthr" min="1" placeholder="e.g. 168" />
            </label>
            <button type="submit" class="add-btn">Add</button>
          </div>
        </form>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  Chart,
  LineController, LineElement, PointElement, BarController, BarElement,
  LinearScale, CategoryScale, Title, Tooltip, Legend,
} from 'chart.js';
import {
  getAthleteProfile, addFtpEntry, deleteFtpEntry,
  getPmc, getHrv, getWhoopStatus, syncWhoop, disconnectWhoop,
} from '../services/api.js';

Chart.register(
  LineController, LineElement, PointElement, BarController, BarElement,
  LinearScale, CategoryScale, Title, Tooltip, Legend
);

const router = useRouter();

// ── FTP History ────────────────────────────────────────────────────────────
const stravaFtp = ref(null);
const ftpHistory = ref([]);
const newFtp = ref({ valid_from: '', ftp: '', lthr: '' });

const SEED_FTP = [
  { valid_from: '2026-02-18', ftp: 316 },
  { valid_from: '2026-01-29', ftp: 300 },
  { valid_from: '2025-12-19', ftp: 290 },
  { valid_from: '2025-05-31', ftp: 285 },
  { valid_from: '2025-04-05', ftp: 271 },
  { valid_from: '2025-03-08', ftp: 260 },
  { valid_from: '2025-02-07', ftp: 250 },
  { valid_from: '2024-12-31', ftp: 232 },
  { valid_from: '2022-10-10', ftp: 312 },
  { valid_from: '2022-09-25', ftp: 310 },
  { valid_from: '2022-01-23', ftp: 323 },
  { valid_from: '2021-12-24', ftp: 316 },
  { valid_from: '2021-10-29', ftp: 296 },
  { valid_from: '2021-09-26', ftp: 285 },
  { valid_from: '2021-01-09', ftp: 254 },
  { valid_from: '2020-02-10', ftp: 280 },
  { valid_from: '2019-11-19', ftp: 245 },
];

async function loadAthleteData() {
  try {
    const data = await getAthleteProfile();
    stravaFtp.value = data.ftp;
    ftpHistory.value = data.ftp_history || [];

    // Auto-seed if empty
    if (ftpHistory.value.length === 0) {
      for (const entry of SEED_FTP) {
        await addFtpEntry({ ftp: entry.ftp, lthr: null, valid_from: entry.valid_from });
      }
      const refreshed = await getAthleteProfile();
      ftpHistory.value = refreshed.ftp_history || [];
    }
  } catch (err) {
    console.error('Failed to load athlete profile:', err);
  }
}

async function handleAddFtp() {
  if (!newFtp.value.ftp || !newFtp.value.valid_from) return;
  try {
    await addFtpEntry({
      ftp: parseInt(newFtp.value.ftp),
      lthr: newFtp.value.lthr ? parseInt(newFtp.value.lthr) : null,
      valid_from: newFtp.value.valid_from,
    });
    newFtp.value = { valid_from: '', ftp: '', lthr: '' };
    const data = await getAthleteProfile();
    ftpHistory.value = data.ftp_history || [];
    await nextTick();
    await loadPmc();
  } catch (err) {
    console.error('Failed to add FTP entry:', err);
  }
}

async function handleDeleteFtp(id) {
  try {
    await deleteFtpEntry(id);
    ftpHistory.value = ftpHistory.value.filter(e => e.id !== id);
    await loadPmc();
  } catch (err) {
    console.error('Failed to delete FTP entry:', err);
  }
}

// ── PMC Chart ──────────────────────────────────────────────────────────────
const pmcCanvas = ref(null);
const pmcLoading = ref(true);
const pmcError = ref('');
const pmcMeta = ref(null);
const activeRange = ref('1 year');
const ranges = [
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year',   days: 365 },
  { label: 'All',      days: null },
];
let pmcAllPoints = [];
let pmcChart = null;

async function loadPmc() {
  try {
    pmcLoading.value = true;
    pmcError.value = '';
    const data = await getPmc();
    pmcAllPoints = data.points || [];
    pmcMeta.value = { powerRideCount: data.powerRideCount, hrRideCount: data.hrRideCount };
    await nextTick();
    renderPmcChart();
  } catch (err) {
    pmcError.value = 'Failed to load PMC data.';
    console.error(err);
  } finally {
    pmcLoading.value = false;
  }
}

function setRange(label) {
  activeRange.value = label;
  renderPmcChart();
}

function renderPmcChart() {
  if (!pmcCanvas.value || pmcAllPoints.length === 0) return;

  const rangeObj = ranges.find(r => r.label === activeRange.value);
  let points = pmcAllPoints;
  if (rangeObj?.days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeObj.days);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    points = pmcAllPoints.filter(p => p.date >= cutoffStr);
  }

  if (pmcChart) pmcChart.destroy();

  const ctx = pmcCanvas.value.getContext('2d');
  pmcChart = new Chart(ctx, {
    data: {
      labels: points.map(p => p.date),
      datasets: [
        {
          type: 'bar',
          label: 'TSS',
          data: points.map(p => p.tss),
          backgroundColor: 'rgba(251,146,60,0.4)',
          borderColor: 'rgba(251,146,60,0.8)',
          borderWidth: 1,
          yAxisID: 'y2',
          order: 2,
        },
        {
          type: 'line',
          label: 'CTL (Fitness)',
          data: points.map(p => p.ctl),
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'line',
          label: 'ATL (Fatigue)',
          data: points.map(p => p.atl),
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        {
          type: 'line',
          label: 'TSB (Form)',
          data: points.map(p => p.tsb),
          borderColor: '#22c55e',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 12, maxRotation: 0 },
        },
        y: {
          position: 'left',
          title: { display: true, text: 'CTL / ATL / TSB' },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Daily TSS' },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Whoop / HRV ────────────────────────────────────────────────────────────
const whoopStatus = ref(null);
const whoopSyncing = ref(false);
const hrvLoading = ref(false);
const hrvData = ref([]);
const hrvCanvas = ref(null);
let hrvChart = null;

async function loadWhoopStatus() {
  try {
    whoopStatus.value = await getWhoopStatus();
    if (whoopStatus.value?.connected) {
      await loadHrv();
    }
  } catch (err) {
    console.error('Failed to load Whoop status:', err);
    whoopStatus.value = { connected: false };
  }
}

async function loadHrv() {
  try {
    hrvLoading.value = true;
    const data = await getHrv();
    hrvData.value = data.recoveries || [];
    await nextTick();
    renderHrvChart();
  } catch (err) {
    console.error('Failed to load HRV data:', err);
  } finally {
    hrvLoading.value = false;
  }
}

function renderHrvChart() {
  if (!hrvCanvas.value || hrvData.value.length === 0) return;
  if (hrvChart) hrvChart.destroy();

  // Build 7-day rolling average of RMSSD
  const records = hrvData.value;
  const rollingAvg = records.map((_, i) => {
    const window = records.slice(Math.max(0, i - 6), i + 1);
    const vals = window.map(r => r.hrv_rmssd).filter(v => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });

  // Point colours based on recovery score
  const pointColors = records.map(r => {
    if (r.score == null) return '#94a3b8';
    if (r.score >= 67) return '#22c55e';
    if (r.score >= 34) return '#f59e0b';
    return '#ef4444';
  });

  const ctx = hrvCanvas.value.getContext('2d');
  hrvChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: records.map(r => r.date),
      datasets: [
        {
          label: '7-day avg HRV (ms)',
          data: rollingAvg,
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 5,
          pointBackgroundColor: pointColors,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const r = records[ctx.dataIndex];
              return r.score != null ? `Recovery: ${r.score}%` : '';
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, maxRotation: 0 } },
        y: { title: { display: true, text: 'HRV RMSSD (ms)' }, beginAtZero: false },
      },
    },
  });
}

async function handleWhoopSync() {
  whoopSyncing.value = true;
  try {
    await syncWhoop();
    await loadWhoopStatus();
  } catch (err) {
    console.error('Whoop sync failed:', err);
  } finally {
    whoopSyncing.value = false;
  }
}

async function handleWhoopDisconnect() {
  try {
    await disconnectWhoop();
    whoopStatus.value = { connected: false };
    hrvData.value = [];
    if (hrvChart) { hrvChart.destroy(); hrvChart = null; }
  } catch (err) {
    console.error('Whoop disconnect failed:', err);
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadAthleteData();
  await Promise.all([loadPmc(), loadWhoopStatus()]);
});

watch(activeRange, () => renderPmcChart());
</script>

<style scoped>
.fitness {
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
  padding: 0 2rem;
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
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.card-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
  color: #1f2937;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

/* FTP table */
.ftp-info {
  margin: 0 0 1rem 0;
  color: #374151;
}

.ftp-hint {
  font-size: 0.85rem;
  color: #9ca3af;
  margin-left: 0.5rem;
}

.ftp-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
}

.ftp-table th,
.ftp-table td {
  padding: 0.6rem 1rem;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.95rem;
}

.ftp-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
}

.delete-btn {
  padding: 0.25rem 0.75rem;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.delete-btn:hover {
  background: #fca5a5;
}

.ftp-form {
  border-top: 1px solid #e5e7eb;
  padding-top: 1.25rem;
}

.form-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 0.75rem 0;
  color: #374151;
}

.form-row {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 1rem;
}

.form-row label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.form-row input {
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.95rem;
  width: 160px;
}

.add-btn {
  padding: 0.55rem 1.5rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.add-btn:hover {
  background: #5568d3;
}

/* PMC */
.range-toggles {
  display: flex;
  gap: 0.4rem;
}

.range-btn {
  padding: 0.3rem 0.9rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.range-btn.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.pmc-meta {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 1rem 0;
}

.chart-wrap {
  height: 420px;
  position: relative;
}

/* Whoop */
.whoop-connect {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
}

.whoop-connect p {
  color: #4b5563;
  margin: 0;
}

.connect-btn {
  display: inline-block;
  padding: 0.6rem 1.5rem;
  background: #1a1a1a;
  color: white;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: background 0.2s;
}

.connect-btn:hover {
  background: #333;
}

.whoop-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #4b5563;
}

.sync-btn {
  padding: 0.4rem 1.2rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.sync-btn:disabled {
  background: #a5b4fc;
  cursor: not-allowed;
}

.sync-btn:not(:disabled):hover {
  background: #5568d3;
}

.disconnect-btn {
  padding: 0.4rem 1.2rem;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.disconnect-btn:hover {
  background: #fca5a5;
}

/* Shared */
.loading-inline {
  color: #6b7280;
  padding: 1rem 0;
}

.error-inline {
  color: #dc2626;
  padding: 1rem 0;
}

.empty-hint {
  color: #9ca3af;
  font-style: italic;
}
</style>
