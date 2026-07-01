<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">长沙地表覆盖分析</h1>
        <p class="app-subtitle">长沙市土地利用分类统计</p>
      </div>
      <div class="header-center">
        <DistrictSelector v-model="districtId" :district-list="districts" />
        <YearSwitch v-model="currentYear" />
      </div>
      <div class="header-right">
        <button class="header-btn" @click="handleToggleFullscreen">
          <span>{{ isFullscreen ? '⛶' : '⛶' }}</span>
          <span>{{ isFullscreen ? '退出全屏' : '全屏' }}</span>
        </button>
        <button class="header-btn" @click="handleTogglePlaybar">
          <span>{{ isPlaybarVisible ? '⏸' : '▶' }}</span>
          <span>{{ isPlaybarVisible ? '隐藏播放条' : '显示播放条' }}</span>
        </button>
        <div class="layer-settings-container">
          <button 
            class="header-btn" 
            :class="{ active: isLayerSettingsOpen }"
            @click="toggleLayerSettings"
          >
            <span>🗺️</span>
            <span>图层设置</span>
          </button>
          <div v-show="isLayerSettingsOpen" class="layer-settings-panel">
            <div class="panel-title">🗺️ 图层设置</div>
            <div class="panel-divider"></div>
            <div class="panel-section">
              <div class="section-label">图层显隐</div>
              <label class="toggle-item">
                <input type="checkbox" v-model="cogVisible" />
                <span class="toggle-icon">{{ cogVisible ? '☑' : '☐' }}</span>
                <span class="toggle-text">地表覆盖分类图</span>
              </label>
              <label class="toggle-item">
                <input type="checkbox" v-model="districtBoundaryVisible" />
                <span class="toggle-icon">{{ districtBoundaryVisible ? '☑' : '☐' }}</span>
                <span class="toggle-text">区县边界</span>
              </label>
              <label class="toggle-item">
                <input type="checkbox" v-model="labelsVisible" />
                <span class="toggle-icon">{{ labelsVisible ? '☑' : '☐' }}</span>
                <span class="toggle-text">地名注记</span>
              </label>
            </div>
            <div class="panel-divider"></div>
            <div class="panel-section">
              <div class="section-label">分类图透明度</div>
              <div class="slider-container">
                <input 
                  type="range" 
                  v-model="cogOpacity" 
                  min="0.1" 
                  max="1.0" 
                  step="0.05" 
                  class="opacity-slider"
                />
                <span class="opacity-value">{{ cogOpacity }}</span>
              </div>
            </div>
          </div>
        </div>
        <button class="export-btn" :disabled="isExporting" @click="handleExport">
          <span class="export-icon">{{ isExporting ? '⏳' : '📄' }}</span>
          <span>{{ isExporting ? '生成中...' : '导出报告' }}</span>
        </button>
      </div>
    </header>
    <div class="app-body">
      <LeftToolPanel
        :filter-value="filterValue"
        :highlight-value="highlightValue"
        :visible-map="visibleMap"
        :existing-values="existingValues"
        @filter="handleLegendFilter"
        @toggle-visibility="handleToggleVisibility"
        @reset-view="handleResetView"
        @toggle-pick-mode="handleTogglePickMode"
      />
      <div class="map-wrapper">
        <BaseMap
          ref="baseMapRef"
          :year="currentYear"
          :district-id="districtId"
          :filter-value="filterValue"
          :highlight-value="highlightValue"
          :visible-map="visibleMap"
          :is-pick-mode="isPickMode"
          :cog-visible="cogVisible"
          :labels-visible="labelsVisible"
          :district-boundary-visible="districtBoundaryVisible"
          :cog-opacity="cogOpacity"
          @update-existing-values="handleUpdateExistingValues"
        />
        <div v-show="isPlaybarVisible" class="timeline-overlay">
          <TimelinePlayer 
            ref="timelinePlayerRef"
            v-model="currentYear" 
            @animate-to="handleAnimateTo"
            @play="handlePlay"
            @pause="handlePause"
          />
        </div>
      </div>
      <div class="side-panel">
        <TabPanel @tab-change="handleTabChange" @tab-transition="handleTabTransition">
          <template #overview>
            <MetricCards
              :district-id="districtId"
              :year="currentYear"
            />
            <StatsPanel
              ref="chartRef"
              :year="currentYear"
              :district-id="districtId"
              :filter-value="filterValue"
              @highlight="handleChartHighlight"
              @update:stats-data="handleStatsDataUpdate"
            />
          </template>
          <template #compare>
            <div class="compare-sub-tabs">
              <button :class="['sub-tab', { active: compareSubTab === 'group' }]" @click="compareSubTab = 'group'">分组对比</button>
              <button :class="['sub-tab', { active: compareSubTab === 'rate' }]" @click="compareSubTab = 'rate'">变化率</button>
              <button :class="['sub-tab', { active: compareSubTab === 'split' }]" @click="compareSubTab = 'split'">双屏对比</button>
            </div>
            <ChangeComparison v-show="compareSubTab === 'group'" ref="changeComparisonRef" :district-id="districtId" />
            <TemporalChange v-show="compareSubTab === 'rate'" ref="temporalChangeRef" :district-id="districtId" />
            <SplitCompare v-show="compareSubTab === 'split'" ref="splitCompareRef" :district-id="districtId" />
          </template>
          <template #spatial>
            <SpatialComparison 
              ref="spatialComparisonRef"
              @district-select="handleDistrictSelect" 
            />
          </template>
        </TabPanel>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import BaseMap from './components/BaseMap.vue'
import YearSwitch from './components/YearSwitch.vue'
import StatsPanel from './components/StatsPanel.vue'
import DistrictSelector from './components/DistrictSelector.vue'
import TabPanel from './components/TabPanel.vue'
import MetricCards from './components/MetricCards.vue'
import TimelinePlayer from './components/TimelinePlayer.vue'
import TemporalChange from './components/TemporalChange.vue'
import SpatialComparison from './components/SpatialComparison.vue'
import LeftToolPanel from './components/LeftToolPanel.vue'
import ChangeComparison from './components/ChangeComparison.vue'
import SplitCompare from './components/SplitCompare.vue'
import { COLOR_MAP } from './config/colorMap'
import { getDistrictChineseName } from './config/districtMap'
import { generateReport } from './utils/export'
import { getDistricts } from './api/index'

const currentYear = ref(2021)
const districtId = ref(0)
const filterValue = ref(null)
const highlightValue = ref(null)
const statsData = ref([])
const prevStatsData = ref([])
const isPickMode = ref(false)
const cogVisible = ref(true)
const labelsVisible = ref(true)
const districtBoundaryVisible = ref(true)
const cogOpacity = ref(0.85)
const isFullscreen = ref(false)
const isPlaybarVisible = ref(false)
const isLayerSettingsOpen = ref(false)
const baseMapRef = ref(null)
const chartRef = ref(null)
const timelinePlayerRef = ref(null)
const temporalChangeRef = ref(null)
const spatialComparisonRef = ref(null)
const changeComparisonRef = ref(null)
const splitCompareRef = ref(null)
const compareSubTab = ref('group')
const isExporting = ref(false)
const districts = ref([])

const visibleMap = reactive({})
const existingValues = ref([])

Object.keys(COLOR_MAP).forEach(key => {
  visibleMap[key] = true
})

function handleUpdateExistingValues(values) {
  existingValues.value = values
  console.log('📊 已更新实际存在的类别:', values)
  
  Object.keys(COLOR_MAP).forEach(key => {
    const value = parseInt(key)
    visibleMap[key] = values.includes(value)
  })
}

function handleLegendFilter(value) {
  filterValue.value = filterValue.value === value ? null : value
  console.log('🔍 图例筛选状态变化:', filterValue.value === null ? '取消筛选' : `筛选类别 ${value}`)
}

function handleChartHighlight(value) {
  highlightValue.value = value
  console.log('✨ 图表高亮状态变化:', highlightValue.value === null ? '取消高亮' : `高亮类别 ${value}`)
}

async function handleExport() {
  if (isExporting.value) return
  
  const districtName = districtId.value === 0 ? '全市' : getDistrictChineseName(districtId.value)
  
  isExporting.value = true
  
  try {
    const mapElement = document.getElementById('map-container')
    const chartElement = chartRef.value?.$el || document.querySelector('.stats-panel')
    const temporalChartElement = document.querySelector('.temporal-change .chart-container')
    
    await generateReport({
      districtName,
      year: currentYear.value,
      districtId: districtId.value,
      statsData: statsData.value,
      mapElement,
      chartElement,
      temporalChartElement
    })
    
    console.log('✅ 报告导出成功')
  } catch (error) {
    console.error('❌ 报告导出失败:', error)
    alert('报告导出失败，请稍后重试')
  } finally {
    isExporting.value = false
  }
}

function handleStatsDataUpdate(data) {
  prevStatsData.value = statsData.value
  statsData.value = data
  console.log('📊 统计数据更新:', data)
}

function handleToggleVisibility({ value, visible }) {
  visibleMap[value] = visible
  console.log('👁 图例显隐切换:', COLOR_MAP[value]?.name, visible ? '显示' : '隐藏')
}

function handleResetView() {
  baseMapRef.value?.resetView()
}

function handleTogglePickMode(value) {
  isPickMode.value = value
}

function toggleLayerSettings() {
  isLayerSettingsOpen.value = !isLayerSettingsOpen.value
  console.log('⚙️ 图层设置面板:', isLayerSettingsOpen.value ? '已打开' : '已关闭')
}

function handleClickOutside(event) {
  const panel = document.querySelector('.layer-settings-panel')
  const button = document.querySelector('.layer-settings-container .header-btn')
  if (panel && button && !panel.contains(event.target) && !button.contains(event.target)) {
    isLayerSettingsOpen.value = false
    console.log('⚙️ 图层设置面板: 点击外部关闭')
  }
}

function handleToggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

function handleLayerSettings() {
  console.log('⚙️ 图层设置功能开发中...')
}

function handleTogglePlaybar() {
  isPlaybarVisible.value = !isPlaybarVisible.value
  console.log('🎬 播放条显隐切换:', isPlaybarVisible.value ? '显示' : '隐藏')
}

function handleTabChange(tabId) {
  console.log('📑 Tab切换:', tabId)
}

function handleTabTransition(tabId) {
  nextTick(() => {
    if (tabId === 'overview' && chartRef.value?.resize) {
      chartRef.value.resize()
    } else if (tabId === 'compare' && temporalChangeRef.value?.handleResize) {
      temporalChangeRef.value.handleResize()
    } else if (tabId === 'spatial' && spatialComparisonRef.value?.resize) {
      spatialComparisonRef.value.resize()
    }
  })
}

async function handleAnimateTo(newYear) {
  timelinePlayerRef.value?.setAnimating(true)
  
  try {
    await baseMapRef.value?.animateToYear(newYear, districtId.value, 1000)
    currentYear.value = newYear
  } catch (error) {
    console.error('❌ 动画切换失败:', error)
  } finally {
    timelinePlayerRef.value?.setAnimating(false)
  }
}

function handlePlay() {
  console.log('🎬 TimelinePlayer 开始播放')
}

function handlePause() {
  console.log('⏸️ TimelinePlayer 暂停播放')
}

function handleDistrictSelect(districtId) {
  console.log('📍 从对比分析选择区县:', districtId)
  baseMapRef.value?.flyToDistrict(districtId)
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

async function loadDistricts() {
  try {
    console.log('📍 正在通过API加载区县列表...')
    const data = await getDistricts()
    console.log('✅ API加载区县列表成功:', data)
    
    if (data && data.length > 0) {
      districts.value = data.map(d => ({
        id: d.id,
        name: d.name || d.district_name
      }))
    }
  } catch (error) {
    console.error('❌ API加载区县列表失败:', error)
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('click', handleClickOutside)
  loadDistricts()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
}

.app-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  transition: all 0.2s;
}

.header-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #3b82f6;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.export-btn:hover {
  background: #2563eb;
  transform: translateY(-1px);
}

.export-icon {
  font-size: 14px;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.map-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
}

.timeline-overlay {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

.side-panel {
  width: 360px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
  flex-shrink: 0;
}

.custom-popup .leaflet-popup-content-wrapper {
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.custom-popup .leaflet-popup-content {
  margin: 0;
  width: auto !important;
  min-width: 200px;
}

.custom-popup .leaflet-popup-tip {
  background-color: #ffffff;
  border-color: #e5e7eb;
}

.popup-wrapper {
  background: #ffffff;
  padding: 12px 16px;
  min-width: 200px;
}

.popup-header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f3f4f6;
}

.popup-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.popup-body {
  font-size: 13px;
}

.popup-category {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.popup-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.popup-name {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
}

.popup-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 4px 0;
}

.popup-info:last-child {
  margin-bottom: 0;
}

.popup-label {
  color: #6b7280;
  flex-shrink: 0;
}

.popup-value {
  color: #1f2937;
  font-weight: 500;
  text-align: right;
}

.popup-message {
  color: #6b7280;
  margin-bottom: 8px;
  font-size: 13px;
}

.popup-coords {
  color: #9ca3af;
  font-size: 12px;
}

.feature-coming {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.coming-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.feature-coming h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}

.feature-coming p {
  font-size: 14px;
  color: #6b7280;
}

.layer-settings-container {
  position: relative;
}

.layer-settings-container .header-btn.active {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

.layer-settings-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid #e5e7eb;
  z-index: 1000;
  padding: 16px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 12px;
}

.panel-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 12px 0;
}

.panel-section {
  margin-bottom: 16px;
}

.panel-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.toggle-item:hover {
  background: #f3f4f6;
}

.toggle-item input[type="checkbox"] {
  display: none;
}

.toggle-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.toggle-text {
  font-size: 13px;
  color: #374151;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.opacity-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e7eb;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.opacity-value {
  font-size: 13px;
  font-weight: 600;
  color: #3b82f6;
  min-width: 40px;
  text-align: right;
  font-family: monospace;
}

.compare-sub-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 3px;
}

.sub-tab {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.sub-tab.active {
  background: #fff;
  color: #3b82f6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
</style>
