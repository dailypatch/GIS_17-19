<template>
  <div class="year-switch">
    <button
      v-for="year in years"
      :key="year"
      :class="['year-btn', { active: modelValue === year }]"
      @click="$emit('update:modelValue', year)"
    >
      {{ year }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Number,
    default: 2021
  }
})

defineEmits(['update:modelValue'])

const years = [2020, 2021]
</script>

<style scoped>
.year-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.year-btn {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.year-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.year-btn.active {
  background: #ffffff;
  color: #1890ff;
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
}
</style>