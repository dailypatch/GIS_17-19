<template>
  <div class="change-comparison">
    <div class="comparison-header">
      <h3 class="comparison-title">变化对比</h3>
      <span class="comparison-subtitle">时间维度：2020 → 2021</span>
    </div>
    
    <div class="district-selector">
      <label class="selector-label">区县：</label>
      <select v-model="selectedDistrict" class="district-select" @change="onDistrictChange">
        <option v-for="(name, id) in DISTRICT_MAP" :key="id" :value="parseInt(id)">
          {{ name }}
        </option>
      </select>
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
        <div ref="chartRef" class="chart-item"></div>
      </div>
      
      <div class="summary-section">
        <div class="summary-row">
          <span class="summary-label">变化最大：</span>
          <span class="summary-value increase">{{ maxIncreaseText }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">减少最多：</span>
          <span class="summary-value decrease">{{ maxDecreaseText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDataCache } from '../composables/useDataCache'
import { DISTRICT_MAP, CLASS_MAP, CLASS_ORDER } from '../utils/comparisonHelpers'
import { convertApiStats, calculateAreaChanges } from '../utils/dataConverter'

const { getCachedStats } = useDataCache()

const props = defineProps({
  districtId: {
    type: Number,
    default: 0
  }
})

const selectedDistrict = ref(props.districtId)
const loading = ref(false)
const error = ref('')
const stats2020 = ref(null)
const stats2021 = ref(null)
const chartRef = ref(null)
let chartInstance = null
let renderTimeout = null

watch(() => props.districtId, (newVal) => {
  selectedDistrict.value = newVal
  scheduleLoadData()
})

const changes = computed(() => {
  if (!stats2020.value || !stats2021.value) return []
  return calculateAreaChanges(stats2020.value, stats2021.value)
})

const maxIncreaseText = computed(() => {
  const sorted = [...changes.value].filter(c => c.rate > 0).sort((a, b) => b.rate - a.rate)
  const max = sorted[0]
  if (!max) return '无'
  return `${max.name} ↑ ${Math.abs(max.rate).toFixed(1)}%（+${max.diff.toFixed(1)} km²）`
})

const maxDecreaseText = computed(() => {
  const sorted = [...changes.value].filter(c => c.rate < 0).sort((a, b) => a.rate - b.rate)
  const max = sorted[0]
  if (!max) return '无'
  return `${max.name} ↓ ${Math.abs(max.rate).toFixed(1)}%（${max.diff.toFixed(1)} km²）`
})

function onDistrictChange() {
  scheduleLoadData()
}

function scheduleLoadData() {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }
  renderTimeout = setTimeout(() => {
    nextTick(() => {
      loadData()
    })
  }, 100)
}

async function loadData() {
  loading.value = true
  error.value = ''
  
  try {
    const districtName = DISTRICT_MAP[selectedDistrict.value]
    
    const [d2020, d2021] = await Promise.all([
      getCachedStats(selectedDistrict.value, 2020),
      getCachedStats(selectedDistrict.value, 2021)
    ])
    
    if (!d2020 || !d2021) {
      error.value = '统计数据加载失败'
      return
    }
    
    stats2020.value = convertApiStats(d2020, selectedDistrict.value, districtName)
    stats2021.value = convertApiStats(d2021, selectedDistrict.value, districtName)
    
    console.log(`[ChangeComparison] 2020转换地类数:`, stats2020.value ? Object.keys(stats2020.value.classes).length : 0)
    console.log(`[ChangeComparison] 2021转换地类数:`, stats2021.value ? Object.keys(stats2021.value.classes).length : 0)
    
    if (!stats2020.value || !stats2021.value) {
      error.value = '数据转换失败'
      return
    }
    
    console.log(`[ChangeComparison] 变化数据条数:`, changes.value.length)
    
    scheduleRenderChart()
  } catch (err) {
    error.value = '数据加载异常：' + err.message
    console.error('[ChangeComparison] 数据加载失败:', err)
  } finally {
    loading.value = false
  }
}

function scheduleRenderChart() {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }
  renderTimeout = setTimeout(() => {
    nextTick(() => {
      tryRenderChart()
    })
  }, 150)
}

function disposeChart() {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
}

function tryRenderChart() {
  if (!chartRef.value) {
    console.warn('[ChangeComparison] chartRef为空，继续等待...')
    scheduleRenderChart()
    return
  }
  
  const rect = chartRef.value.getBoundingClientRect()
  console.log('[ChangeComparison] chartRef尺寸:', rect.width, 'x', rect.height)
  
  if (rect.width === 0 || rect.height === 0) {
    console.log('[ChangeComparison] 容器尺寸为0，继续等待...')
    scheduleRenderChart()
    return
  }
  
  if (!changes.value.length) {
    console.warn('[ChangeComparison] changes数据为空')
    return
  }
  
  disposeChart()
  
  try {
    chartInstance = echarts.init(chartRef.value)
    
    const classNames = CLASS_ORDER.map(v => CLASS_MAP[v])
    const area2020 = CLASS_ORDER.map(v => {
      const change = changes.value.find(c => c.value === v)
      return change ? change.area2020 : 0
    })
    const area2021 = CLASS_ORDER.map(v => {
      const change = changes.value.find(c => c.value === v)
      return change ? change.area2021 : 0
    })
    
    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const validParams = params.filter(p => p.value !== null && p.value !== 0.1)
          if (!validParams.length) return ''
          
          const index = validParams[0].dataIndex
          const change = changes.value[index]
          if (!change) return ''
          
          return `${change.name}<br/>
            <span style="display:inline-block;margin-right:4px;border-radius:4px;width:10px;height:10px;background-color:#93c5fd;"></span>
            2020: ${change.area2020.toFixed(1)} km²<br/>
            <span style="display:inline-block;margin-right:4px;border-radius:4px;width:10px;height:10px;background-color:#3b82f6;"></span>
            2021: ${change.area2021.toFixed(1)} km²<br/>
            <span style="color:${change.diff >= 0 ? '#ef4444' : '#22c55e'}">
            变化: ${change.diff >= 0 ? '+' : ''}${change.diff.toFixed(1)} km² (${change.rate >= 0 ? '+' : ''}${change.rate.toFixed(1)}%)
            </span>`
        }
      },
      legend: {
        data: ['2020', '2021'],
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
      series: [
        {
          name: '2020',
          type: 'bar',
          barWidth: '35%',
          itemStyle: {
            color: '#93c5fd',
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            color: '#6b7280',
            formatter: (params) => params.value > 0 ? params.value.toFixed(1) : ''
          },
          data: area2020
        },
        {
          name: '2021',
          type: 'bar',
          barWidth: '35%',
          itemStyle: {
            color: '#3b82f6',
            borderRadius: [4, 4, 0, 0]
          },
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            color: '#374151',
            formatter: (params) => params.value > 0 ? params.value.toFixed(1) : ''
          },
          data: area2021
        }
      ]
    }
    
    chartInstance.setOption(option, true)
    
    setTimeout(() => {
      chartInstance?.resize()
    }, 50)
    
    console.log('[ChangeComparison] 图表渲染成功')
  } catch (err) {
    console.error('[ChangeComparison] ECharts初始化失败:', err)
    error.value = '图表渲染失败：' + err.message
  }
}

function handleResize() {
  if (chartInstance) {
    chartInstance.resize()
  }
}

function refreshChart() {
  scheduleRenderChart()
}

onMounted(() => {
  nextTick(() => {
    loadData()
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }
  disposeChart()
})

defineExpose({ refreshChart })
</script>

<style scoped>
.change-comparison {
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

.district-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-label {
  font-size: 13px;
  color: #6b7280;
}

.district-select {
  padding: 6px 12px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  min-width: 120px;
}

.district-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
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
  min-height: 250px;
}

.chart-item {
  width: 100%;
  height: 100%;
}

.summary-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
}

.summary-value.increase {
  color: #ef4444;
}

.summary-value.decrease {
  color: #22c55e;
}
</style>
