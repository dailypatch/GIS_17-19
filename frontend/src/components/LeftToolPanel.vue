<template>
  <div class="left-tool-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="toggleCollapse">
      <span class="panel-title">🛠 工具箱</span>
      <button class="collapse-btn">{{ isCollapsed ? '▶' : '◀' }}</button>
    </div>

    <div class="panel-body" v-show="!isCollapsed">
      <div class="section">
        <div class="section-title">地表覆盖分类</div>
        <LegendPanel
          :visible-map="visibleMap"
          :filter-value="filterValue"
          :highlight-value="highlightValue"
          :existing-values="existingValues"
          @toggle-visibility="onToggleVisibility"
          @filter="onFilter"
        />
      </div>

      <div class="section">
        <div class="section-title">地图工具</div>
        <button class="tool-btn" @click="resetView">
          <span class="tool-icon">🗺</span>
          <span>重置视图</span>
        </button>
        <button class="tool-btn" :class="{ active: isPickMode }" @click="togglePickMode">
          <span class="tool-icon">📍</span>
          <span>坐标拾取</span>
        </button>
      </div>

      
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import LegendPanel from './LegendPanel.vue'

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

const emit = defineEmits(['filter', 'toggle-visibility', 'reset-view', 'toggle-pick-mode'])

const isCollapsed = ref(false)
const isPickMode = ref(false)

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  console.log('📦 左侧面板', isCollapsed.value ? '已折叠' : '已展开')
}

function onToggleVisibility(value) {
  const newValue = !props.visibleMap[value]
  emit('toggle-visibility', { value, visible: newValue })
}

function onFilter(value) {
  emit('filter', value)
}

function resetView() {
  emit('reset-view')
  console.log('🗺 重置视图')
}

function togglePickMode() {
  isPickMode.value = !isPickMode.value
  emit('toggle-pick-mode', isPickMode.value)
  console.log('📍 坐标拾取', isPickMode.value ? '已开启' : '已关闭')
}
</script>

<style scoped>
.left-tool-panel {
  width: 240px;
  background: #ffffff;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.left-tool-panel.collapsed {
  width: 48px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: all 0.2s;
}

.panel-header:hover {
  background: #f1f5f9;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
}

.collapsed .panel-title {
  display: none;
}

.collapse-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: #e5e7eb;
  color: #374151;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  padding-left: 6px;
  border-left: 3px solid #3b82f6;
}

.tool-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 8px;
}

.tool-btn:last-child {
  margin-bottom: 0;
}

.tool-btn:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.tool-btn.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #3b82f6;
}

.tool-icon {
  font-size: 14px;
  flex-shrink: 0;
}
</style>
