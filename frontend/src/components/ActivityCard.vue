<template>
  <div class="activity-card">
    <div class="activity-header">
      <div class="header-text">
        <h3 class="activity-name">{{ extractWorkoutName(activity.name) }}</h3>
        <span class="activity-type" :class="`type-${activity.sport_type?.toLowerCase() || 'other'}`">
          {{ activity.sport_type || activity.type }}
        </span>
      </div>
      <a
        v-if="hasMap"
        :href="stravaUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="map-thumbnail"
        title="View on Strava"
      >
        <svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="150" fill="#f0f0f0"/>
          <path
            :d="svgPath"
            fill="none"
            stroke="#667eea"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <div class="map-overlay">
          <svg class="external-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"/>
          </svg>
        </div>
      </a>
    </div>

    <div class="activity-details">
      <div class="detail-item">
        <span class="detail-label">Distance</span>
        <span class="detail-value">{{ formatDistance(activity.distance) }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">Duration</span>
        <span class="detail-value">{{ formatDuration(activity.moving_time) }}</span>
      </div>

      <div class="detail-item">
        <span class="detail-label">Elevation</span>
        <span class="detail-value">{{ Math.round(activity.total_elevation_gain) }}m</span>
      </div>

      <div class="detail-item" v-if="activity.average_speed">
        <span class="detail-label">Avg Speed</span>
        <span class="detail-value">{{ formatSpeed(activity.average_speed) }}</span>
      </div>

      <div class="detail-item" v-if="activity.weighted_average_watts">
        <span class="detail-label">NP</span>
        <span class="detail-value">{{ activity.weighted_average_watts }}W</span>
      </div>
    </div>

    <div class="activity-footer">
      <span class="activity-date">{{ formatDate(activity.start_date) }}</span>
      <button @click="showEdit = true" class="edit-button" title="Edit activity">
        <svg viewBox="0 0 24 24" fill="currentColor" class="edit-icon">
          <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"/>
        </svg>
      </button>
    </div>
  </div>

  <EditActivityModal
    v-if="showEdit"
    :activity="activity"
    @cancel="showEdit = false"
    @saved="onSaved"
  />
</template>

<script setup>
import { ref, computed } from 'vue';
import { decodePolyline, polylineToSvgPath } from '../utils/polyline.js';
import { extractWorkoutName } from '../utils/workoutName.js';
import EditActivityModal from './EditActivityModal.vue';

const props = defineProps({
  activity: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['updated']);

const showEdit = ref(false);

function onSaved(updated) {
  showEdit.value = false;
  emit('updated', updated);
}

const hasMap = computed(() => {
  return props.activity.map && props.activity.map.summary_polyline;
});

const svgPath = computed(() => {
  if (!hasMap.value) return '';

  const polyline = props.activity.map.summary_polyline;
  const points = decodePolyline(polyline);
  return polylineToSvgPath(points);
});

const stravaUrl = computed(() => {
  return `https://www.strava.com/activities/${props.activity.id}`;
});

function formatDistance(meters) {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

function formatSpeed(metersPerSecond) {
  const kmPerHour = metersPerSecond * 3.6;
  return `${kmPerHour.toFixed(1)} km/h`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<style scoped>
.activity-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s;
}

.activity-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 1rem;
  gap: 1rem;
}

.header-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-name {
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.activity-type {
  padding: 0.25rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: capitalize;
  white-space: nowrap;
  align-self: flex-start;
}

.map-thumbnail {
  position: relative;
  flex-shrink: 0;
  width: 150px;
  height: 100px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background: #f0f0f0;
  cursor: pointer;
  transition: all 0.3s;
  display: block;
  text-decoration: none;
}

.map-thumbnail:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transform: scale(1.05);
}

.map-thumbnail svg {
  width: 100%;
  height: 100%;
  display: block;
}

.map-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s;
}

.map-thumbnail:hover .map-overlay {
  background: rgba(0, 0, 0, 0.1);
}

.external-icon {
  width: 24px;
  height: 24px;
  color: white;
  opacity: 0;
  transition: opacity 0.3s;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.map-thumbnail:hover .external-icon {
  opacity: 1;
}

.type-run {
  background: #fef3c7;
  color: #92400e;
}

.type-ride {
  background: #dbeafe;
  color: #1e40af;
}

.type-swim {
  background: #ccfbf1;
  color: #115e59;
}

.type-other {
  background: #f3f4f6;
  color: #374151;
}

.activity-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem 0;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.activity-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.activity-date {
  font-size: 0.875rem;
  color: #6b7280;
}

.edit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #9ca3af;
  transition: color 0.2s, background 0.2s;
}

.edit-button:hover {
  color: #667eea;
  background: #eef2ff;
}

.edit-icon {
  width: 18px;
  height: 18px;
}
</style>
