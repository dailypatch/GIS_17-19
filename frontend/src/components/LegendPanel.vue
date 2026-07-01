<template>
  <div class="legend-panel">
    <div class="legend-grid">
      <div
        v-for="item in legendItems"
        :key="item.value"
        class="legend-item"
        :class="{ 
          'legend-item-selected': filterValue === item.value,
          'legend-item-highlight': highlightValue === item.value,
          'legend-item-hidden': !visibleMap[item.value]
        }"
      >
        <input 
          type="checkbox" 
          class="legend-checkbox"
          :checked="visibleMap[item.value] !== false"
          @change="toggleVisibility(item.value)"
        />
        <div 
          class="legend-color" 
          :style="{ backgroundColor: item.color }"
          @click="handleFilter(item.value)"
        ></div>
        <span class="legend-name" @click="handleFilter(item.value)">{{ item.name }}</span>
        <span v-if="filterValue === item.value" class="legend-check">✓</span>
      </div>
    </div>
    <div v-if="filterValue !== null" class="filter-hint">
      点击已选中项取消筛选
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { COLOR_MAP } from '../config/colorMap'

const props = defineProps({
  filterValue: {
    type: [Number, null],
    default: null
  },
  highlightValue: {
    type: [Number, null],
    default: null
  },
  visibleMap: {
    type: Object,
    default: () => ({})
  },
  existingValues: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['filter', 'toggle-visibility'])

const legendItems = computed(() => {
  return Object.entries(COLOR_MAP)
    .map(([key, value]) => ({
      value: parseInt(key),
      name: value.name,
      color: value.color
    }))
    .sort((a, b) => a.value - b.value)
})

function handleFilter(value) {
  emit('filter', value)
}

function toggleVisibility(value) {
  emit('toggle-visibility', value)
}
</script>

<style scoped>
.legend-panel {
  padding: 4px 0;
}

.legend-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: transparent;
  border: 2px solid transparent;
}

.legend-item:hover {
  background-color: #f3f4f6;
}

.legend-item-selected {
  background-color: #eff6ff;
  border-color: #3b82f6;
}

.legend-item-highlight {
  background-color: #fef3c7;
  border-color: #f59e0b;
}

.legend-item-highlight .legend-name {
  text-decoration: underline;
  text-decoration-color: #f59e0b;
  text-decoration-thickness: 2px;
}

.legend-item-hidden {
  opacity: 0.4;
}

.legend-item-hidden .legend-color {
  filter: grayscale(100%);
}

.legend-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: #3b82f6;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.legend-name {
  font-size: 13px;
  color: #4b5563;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  cursor: pointer;
}

.legend-check {
  font-size: 14px;
  font-weight: bold;
  color: #3b82f6;
  flex-shrink: 0;
}

.filter-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  padding: 8px;
  background-color: #f3f4f6;
  border-radius: 6px;
}
</style>