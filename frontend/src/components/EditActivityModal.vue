<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="$emit('cancel')">
      <div class="modal">
        <h2 class="modal-title">Edit Activity</h2>

        <div v-if="isLoadingDetails" class="modal-loading">
          <div class="spinner"></div>
          <p>Loading activity details...</p>
        </div>

        <template v-else>
          <div class="field">
            <label class="field-label">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="field-input"
              placeholder="Activity name"
            />
          </div>

          <div class="field">
            <label class="field-label">Description</label>
            <textarea
              v-model="form.description"
              class="field-textarea"
              rows="4"
              placeholder="Activity description"
            ></textarea>
          </div>

          <div class="field">
            <label class="field-label">Gear</label>
            <select v-model="form.gear_id" class="field-select">
              <option value="">None</option>
              <option
                v-for="item in gear"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
            </select>
          </div>

          <div v-if="saveError" class="save-error">{{ saveError }}</div>

          <div class="modal-actions">
            <button @click="$emit('cancel')" class="btn-cancel" :disabled="isSaving">
              Cancel
            </button>
            <button @click="save" class="btn-save" :disabled="isSaving">
              {{ isSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getActivity, getEquipment, updateActivity } from '../services/api';

const props = defineProps({
  activity: { type: Object, required: true },
});

const emit = defineEmits(['cancel', 'saved']);

const form = ref({ name: '', description: '', gear_id: '' });
const gear = ref([]);
const isLoadingDetails = ref(true);
const isSaving = ref(false);
const saveError = ref('');

onMounted(async () => {
  // Fetch full activity details (for description) and gear list in parallel
  const [activityDetails, equipmentData] = await Promise.all([
    getActivity(props.activity.id),
    getEquipment(),
  ]);

  form.value = {
    name: activityDetails.name ?? '',
    description: activityDetails.description ?? '',
    gear_id: activityDetails.gear_id ?? '',
  };
  gear.value = equipmentData.gear ?? [];
  isLoadingDetails.value = false;
});

async function save() {
  isSaving.value = true;
  saveError.value = '';
  try {
    const updated = await updateActivity(props.activity.id, {
      name: form.value.name,
      description: form.value.description,
      gear_id: form.value.gear_id || null,
    });
    emit('saved', updated);
  } catch (err) {
    console.error('Failed to update activity:', err);
    saveError.value = 'Failed to save. Please try again.';
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  width: 480px;
  max-width: calc(100vw - 2rem);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  margin: 0 0 1.5rem 0;
}

.modal-loading {
  text-align: center;
  padding: 2rem 0;
  color: #666;
}

.spinner {
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input,
.field-textarea,
.field-select {
  padding: 0.625rem 0.875rem;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  color: #111;
  background: white;
  transition: border-color 0.2s;
  font-family: inherit;
}

.field-input:focus,
.field-textarea:focus,
.field-select:focus {
  outline: none;
  border-color: #667eea;
}

.field-textarea {
  resize: vertical;
}

.save-error {
  color: #dc2626;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  padding: 0.625rem 1.5rem;
  background: #f3f4f6;
  color: #374151;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-cancel:hover:not(:disabled) {
  background: #e5e7eb;
}

.btn-save {
  padding: 0.625rem 1.5rem;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-save:hover:not(:disabled) {
  background: #5568d3;
}

.btn-cancel:disabled,
.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
