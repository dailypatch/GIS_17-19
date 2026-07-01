<template>
  <div class="spatial-comparison">
    <div class="comparison-header">
      <h3 class="comparison-title">对比分析</h3>
      <span class="comparison-subtitle">空间维度：区县间横向对比</span>
    </div>
    
    <div class="mode-switch">
      <button 
        :class="['mode-btn', { active: currentMode === 'ranking' }]"
        @click="switchMode('ranking')"
      >
        横向排名
      </button>
      <button 
        :class="['mode-btn', { active: currentMode === 'comparison' }]"
        @click="switchMode('comparison')"
      >
        自由对比
      </button>
    </div>
    
    <div class="control-bar">
      <div v-if="currentMode === 'ranking'" class="control-group">
        <label class="control-label">指标：</label>
        <select v-model="selectedClass" class="class-select">
          <option v-for="(name, value) in CLASS_MAP" :key="value" :value="parseInt(value)">
            {{ name }}
          </option>
        </select>
      </div>
      
      <div v-if="currentMode === 'comparison'" class="comparison-controls">
        <div class="control-group">
          <label class="control-label">区县：</label>
          <div class="district-checkboxes">
            <button 
              v-for="(name, id) in DISTRICT_MAP" 
              :key="id"
              v-show="parseInt(id) > 0"
              :class="['district-chip', { active: selectedDistricts.includes(parseInt(id)) }]"
              :style="selectedDistricts.includes(parseInt(id)) ? { backgroundColor: getDistrictColor(parseInt(id)) } : {}"
              @click="toggleDistrict(parseInt(id))"
            >
              {{ name }}
            </button>
          </div>
        </div>
        
        <div class="control-group">
          <label class="control-label">指标：</label>
          <div class="class-checkboxes">
            <button 
              v-for="(name, value) in CLASS_MAP" 
              :key="value"
              :class="['class-chip', { active: selectedClasses.includes(parseInt(value)) }]"
              :style="selectedClasses.includes(parseInt(value)) ? { backgroundColor: getColorByValue(parseInt(value)) || '#3b82f6' } : {}"
              @click="toggleClass(parseInt(value))"
            >
              {{ name }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载数据中...</div>
    </div>
    
    <div v-else-if="error" class="error-overlay">
      <div class="error-icon">❌</div>
      <div class="error-text">{{ error }}</div>
    </div>
    
    <div v-else class="comparison-content">
      <div class="chart-container">
        <div ref="mainChartRef" class="main-chart"></div>
      </div>
      
      <div v-if="currentMode === 'ranking'" class="summary-section">
        <div class="summary-row">
          <span class="summary-label">{{ CLASS_MAP[selectedClass] }} TOP3：</span>
          <span class="summary-value">{{ top3Text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getColorByValue } from '../config/colorMap'
import { useDataCache } from '../composables/useDataCache'
import {
  DISTRICT_MAP,
  CLASS_MAP,
  DISTRICT_COLORS,
  getTopDistricts
} from '../utils/comparisonHelpers'
import { convertApiStats } from '../utils/dataConverter'

const { getCachedStats } = useDataCache()

const emit = defineEmits(['district-select'])

const currentMode = ref('ranking')
const selectedClass = ref(50)
const selectedDistricts = ref([3, 5, 1])
const selectedClasses = ref([50, 40])
const loading = ref(false)
const error = ref('')
const statsData = ref(null)
const mainChartRef = ref(null)
let mainChartInstance = null

const top3Text = computed(() => {
  if (!statsData.value) return '加载中...'
  
  const top3 = getTopDistricts(statsData.value, selectedClass.value, 3)
  if (!top3.length) return '无数据'
  
  return top3.map(d => d.name).join(' > ')
})

function getDistrictColor(districtId) {
  const index = (districtId - 1) % DISTRICT_COLORS.length
  return DISTRICT_COLORS[index]
}

async function loadData() {
  loading.value = true
  error.value = ''
  
  try {
    const districtIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    
    const promises = districtIds.map(async (districtId) => {
      try {
        const data = await getCachedStats(districtId, 2021)
        
        return {
          districtId,
          data
        }
      } catch (err) {
        console.warn(`⚠️ API加载${DISTRICT_MAP[districtId]}数据异常:`, err.message)
        return { districtId, data: null }
      }
    })
    
    const results = await Promise.all(promises)
    
    const result = {}
    results.forEach(({ districtId, data }) => {
      if (data) {
        const converted = convertApiStats(data, districtId, DISTRICT_MAP[districtId])
        if (converted) {
          result[districtId] = converted
        }
      }
    })
    
    console.log('🔄 转换后统计数据:', Object.keys(result).length, '个区县')
    
    const hasData = Object.values(result).some(d => d && d.classes && Object.keys(d.classes).length > 0)
    
    if (!hasData) {
      error.value = '统计数据加载失败'
      return
    }
    
    statsData.value = result
    
    await nextTick()
    setTimeout(() => {
      renderMainChart()
    }, 300)
  } catch (err) {
    error.value = '数据加载异常：' + err.message
    console.error('❌ 数据加载失败:', err)
  } finally {
    loading.value = false
  }
}

function switchMode(mode) {
  currentMode.value = mode
  nextTick(() => {
    renderMainChart()
  })
}

function toggleDistrict(districtId) {
  const index = selectedDistricts.value.indexOf(districtId)
  
  if (index > -1) {
    if (selectedDistricts.value.length > 1) {
      selectedDistricts.value.splice(index, 1)
    }
  } else {
    if (selectedDistricts.value.length < 5) {
      selectedDistricts.value.push(districtId)
    }
  }
  
  nextTick(renderMainChart)
}

function toggleClass(classValue) {
  const index = selectedClasses.value.indexOf(classValue)
  
  if (index > -1) {
    if (selectedClasses.value.length > 1) {
      selectedClasses.value.splice(index, 1)
    }
  } else {
    if (selectedClasses.value.length < 5) {
      selectedClasses.value.push(classValue)
    }
  }
  
  nextTick(renderMainChart)
}

function disposeMainChart() {
  if (mainChartInstance) {
    mainChartInstance.dispose()
    mainChartInstance = null
  }
}

async function renderMainChart() {
  await nextTick()
  
  if (!mainChartRef.value || !statsData.value) {
    return
  }
  
  disposeMainChart()
  
  mainChartInstance = echarts.init(mainChartRef.value)
  
  if (currentMode.value === 'ranking') {
    renderRankingChart(mainChartInstance)
  } else {
    renderComparisonChart(mainChartInstance)
  }
  
  setTimeout(() => {
    mainChartInstance?.resize()
  }, 50)
}

function renderRankingChart(chart) {
  const districts = []
  for (let i = 1; i <= 9; i++) {
    const data = statsData.value[i]
    if (data && data.classes) {
      const cls = data.classes[selectedClass.value]
      if (cls) {
        districts.push({
          id: i,
          name: DISTRICT_MAP[i],
          area: cls.area_sqkm
        })
      }
    }
  }
  
  districts.sort((a, b) => b.area - a.area)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const item = params[0]
        const district = districts[item.dataIndex]
        return `${district.name}<br/>${CLASS_MAP[selectedClass.value]}: ${district.area.toFixed(2)} km²`
      }
    },
    grid: {
      left: '25%',
      right: '8%',
      top: '10%',
      bottom: '10%'
    },
    xAxis: {
      type: 'value',
      name: '面积 (km²)',
      nameTextStyle: { fontSize: 11, color: '#6b7280' },
      axisLabel: { fontSize: 11, color: '#6b7280' },
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: districts.map(d => d.name),
      axisLabel: { fontSize: 12, color: '#374151' },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } }
    },
    series: [{
      type: 'bar',
      itemStyle: {
        color: getColorByValue(selectedClass.value) || '#3b82f6',
        borderRadius: [0, 4, 4, 0]
      },
      label: {
        show: true,
        position: 'right',
        fontSize: 11,
        color: '#6b7280',
        formatter: (params) => params.value.toFixed(1)
      },
      barWidth: '60%',
      data: districts.map(d => d.area)
    }]
  }
  
  chart.setOption(option, true)
  
  chart.on('click', (params) => {
    const district = districts[params.dataIndex]
    if (district) {
      emit('district-select', district.id)
      console.log('📍 点击区县:', district.name, 'ID:', district.id)
    }
  })
}

function renderComparisonChart(chart) {
  if (selectedDistricts.value.length < 1 || selectedClasses.value.length < 1) return
  
  const classNames = selectedClasses.value.map(v => CLASS_MAP[v])
  const series = selectedDistricts.value.map((districtId, index) => {
    const color = getDistrictColor(districtId)
    const districtData = statsData.value[districtId]
    
    const data = selectedClasses.value.map(classValue => {
      const cls = districtData?.classes?.[classValue]
      return cls ? cls.area_sqkm : 0
    })
    
    return {
      name: DISTRICT_MAP[districtId],
      type: 'bar',
      barWidth: `${Math.min(80 / selectedDistricts.value.length, 20)}%`,
      itemStyle: {
        color,
        borderRadius: [4, 4, 0, 0]
      },
      label: {
        show: true,
        position: 'top',
        fontSize: 9,
        color: '#6b7280',
        formatter: (params) => params.value > 0 ? params.value.toFixed(1) : ''
      },
      data
    }
  })
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        if (!params.length) return ''
        const classValue = selectedClasses.value[params[0].dataIndex]
        let result = `<div style="font-weight:bold;margin-bottom:8px;">${CLASS_MAP[classValue]}</div>`
        params.forEach(p => {
          if (p.value > 0) {
            result += `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:4px;background:${p.color};"></span>
              <span>${p.seriesName}: ${p.value.toFixed(2)} km²</span>
            </div>`
          }
        })
        return result
      }
    },
    legend: {
      data: selectedDistricts.value.map(id => DISTRICT_MAP[id]),
      bottom: 0,
      textStyle: { fontSize: 11, color: '#6b7280' },
      itemWidth: 14,
      itemHeight: 14
    },
    grid: {
      left: '8%',
      right: '8%',
      top: '10%',
      bottom: '20%'
    },
    xAxis: {
      type: 'category',
      data: classNames,
      axisLabel: { 
        rotate: 0, 
        fontSize: 11, 
        color: '#6b7280',
        interval: 0,
        formatter: (val) => val.split('').join('\n')
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } }
    },
    yAxis: {
      type: 'value',
      name: '面积 (km²)',
      nameTextStyle: { fontSize: 11, color: '#6b7280' },
      axisLabel: { fontSize: 11, color: '#6b7280' },
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    series
  }
  
  chart.setOption(option, true)
  
  chart.on('click', (params) => {
    const districtId = selectedDistricts.value[params.seriesIndex]
    emit('district-select', districtId)
    console.log('📍 点击区县:', DISTRICT_MAP[districtId], 'ID:', districtId)
  })
}

function handleResize() {
  mainChartInstance?.resize()
}

watch(selectedClass, () => {
  nextTick(renderMainChart)
})

watch(selectedDistricts, () => {
  nextTick(renderMainChart)
}, { deep: true })

watch(selectedClasses, () => {
  nextTick(renderMainChart)
}, { deep: true })

async function refreshChart() {
  await nextTick()
  if (mainChartInstance) {
    mainChartInstance.resize()
  }
  renderMainChart()
}

function resize() {
  if (mainChartInstance) {
    mainChartInstance.resize()
  }
}

defineExpose({ refreshChart, resize })

onMounted(() => {
  setTimeout(() => {
    loadData()
  }, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  disposeMainChart()
})
</script>

<style scoped>
.spatial-comparison {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.comparison-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.comparison-title {
  font-size: 16px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.comparison-subtitle {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 4px 10px;
  border-radius: 4px;
}

.mode-switch {
  display: flex;
  gap: 8px;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}

.mode-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: #ffffff;
  color: #374151;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.control-bar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.control-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

.control-label {
  font-size: 13px;
  color: #6b7280;
  flex-shrink: 0;
  padding-top: 4px;
}

.class-select {
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  min-width: 120px;
}

.class-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.district-checkboxes,
.class-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.district-chip,
.class-chip {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  border-radius: 16px;
  font-size: 12px;
  color: #6b7280;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s;
}

.district-chip.active,
.class-chip.active {
  color: #ffffff;
  border-color: transparent;
}

.district-chip:hover,
.class-chip:hover {
  transform: scale(1.05);
}

.loading-overlay,
.error-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #6b7280;
}

.error-icon {
  font-size: 32px;
}

.error-text {
  font-size: 14px;
  color: #ef4444;
  text-align: center;
}

.comparison-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.chart-container {
  flex: 1;
  min-height: 0;
}

.main-chart {
  width: 100%;
  height: 100%;
  min-height: 250px;
}

.summary-section {
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.summary-label {
  font-size: 13px;
  color: #6b7280;
  flex-shrink: 0;
}

.summary-value {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}
</style>
