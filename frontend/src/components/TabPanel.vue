<template>
  <div class="tab-panel">
    <div class="tab-header">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="switchTab(tab.id)"
      >
        {{ tab.name }}
      </button>
    </div>
    <div class="tab-content">
      <div :class="['tab-pane']" v-show="activeTab === 'overview'">
        <slot name="overview"></slot>
      </div>
      <div :class="['tab-pane']" v-show="activeTab === 'compare'">
        <slot name="compare"></slot>
      </div>
      <div :class="['tab-pane']" v-show="activeTab === 'spatial'">
        <slot name="spatial"></slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const emit = defineEmits(['tab-change', 'tab-transition'])

const activeTab = ref('overview')

const tabs = [
  { id: 'overview', name: '现状概览' },
  { id: 'compare', name: '时序变化' },
  { id: 'spatial', name: '区域对比' }
]

async function switchTab(tabId) {
  activeTab.value = tabId
  await nextTick()
  emit('tab-change', tabId)
  setTimeout(() => {
    emit('tab-transition', tabId)
  }, 50)
}

defineExpose({ activeTab })
</script>

<style scoped>
.tab-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.tab-header {
  display: flex;
  border-bottom: 2px solid #e5e7eb;
  position: relative;
  padding-bottom: 0;
}

.tab-btn {
  flex: 1;
  padding: 12px 8px;
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
}

.tab-btn:hover {
  color: #374151;
}

.tab-btn.active {
  color: #2563eb;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 15%;
  right: 15%;
  height: 2px;
  background-color: #2563eb;
  border-radius: 1px;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  position: relative;
}

.tab-pane {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  bottom: 0;
}
</style>
