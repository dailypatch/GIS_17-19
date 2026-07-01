<template>
  <div class="stats-panel">
    <div class="stats-header">
      <h3 class="stats-title">面积统计</h3>
      <div class="chart-toggle">
        <button 
          class="toggle-btn" 
          :class="{ active: chartType === 'bar' }"
          @click="chartType = 'bar'"
        >柱状图</button>
        <button 
          class="toggle-btn" 
          :class="{ active: chartType === 'pie' }"
          @click="chartType = 'pie'"
        >饼图</button>
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-wrapper">
        <div ref="chartRef" class="chart-item"></div>
      </div>
      <div v-show="loading" class="loading-overlay">
        <div class="loading-text">加载数据中...</div>
      </div>
      <div v-show="error" class="error-overlay">
        <div class="error-text">{{ error }}</div>
      </div>
      <div v-show="!loading && !error && chartData.length === 0" class="empty-overlay">
        <div class="empty-text">暂无数据</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getNameByValue, getColorByValue } from '../config/colorMap'
import { getDistrictChineseName } from '../config/districtMap'
import { useDataCache } from '../composables/useDataCache'

const { getCachedStats } = useDataCache()

const props = defineProps({
  year: {
    type: Number,
    default: 2021
  },
  districtId: {
    type: Number,
    default: 0
  },
  filterValue: {
    type: [Number, null],
    default: null
  }
})

const emit = defineEmits(['highlight', 'update:statsData'])

const chartRef = ref(null)
const chartType = ref('bar')
const loading = ref(false)
const error = ref('')
const chartData = ref([])
let chartInstance = null

function getDisplayColor(item) {
  if (props.filterValue !== null && item.value !== props.filterValue) {
    return '#9ca3af'
  }
  return item.color
}

const fetchStats = async () => {
  loading.value = true
  error.value = ''
  disposeChart()

  try {
    const districtName = getDistrictChineseName(props.districtId)
    
    const data = await getCachedStats(props.districtId, props.year)
    
    const stats = data.stats || data
    const classes = stats.classes
    
    if (!classes) {
      throw new Error(`未找到区县 ${districtName} 的统计数据`)
    }
    
    const totalArea = Object.values(classes).reduce((sum, cls) => sum + (cls.area_m2 || 0), 0)
    
    const filteredData = Object.entries(classes)
      .map(([key, item]) => ({
        value: parseInt(key),
        name: getNameByValue(parseInt(key)),
        color: getColorByValue(parseInt(key)),
        area: item.area_m2 ? item.area_m2 / 1000000 : 0,
        ratio: totalArea > 0 ? (item.area_m2 / totalArea) * 100 : 0
      }))
      .filter(item => item.area > 0)
      .sort((a, b) => b.area - a.area)

    chartData.value = filteredData
    console.log('📊 处理后数据:', filteredData)
    emit('update:statsData', filteredData)
    
  } catch (err) {
    error.value = `数据加载失败: ${err.message}`
    console.error('❌ 统计数据加载失败:', err)
  } finally {
    loading.value = false
    await nextTick()
    renderChart()
  }
}

function disposeChart() {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
}

async function renderChart() {
  await nextTick()
  
  if (!chartRef.value) {
    console.error('❌ 图表容器不存在')
    return
  }

  if (chartData.value.length === 0) {
    console.log('📊 数据为空，跳过图表渲染')
    return
  }

  console.log('📊 filterValue:', props.filterValue)
  console.log('📊 chartType:', chartType.value)

  disposeChart()

  chartInstance = echarts.init(chartRef.value)
  
  const option = chartType.value === 'bar' ? buildBarOption() : buildPieOption()
  chartInstance.setOption(option, true)
  bindChartEvents(chartInstance)
  
  setTimeout(() => {
    chartInstance?.resize()
  }, 50)
  
  console.log(`✅ ${chartType.value === 'bar' ? '柱状图' : '饼图'}渲染完成`)
}

function bindChartEvents(chart) {
  chart.off('mouseover')
  chart.off('mouseout')

  chart.on('mouseover', (params) => {
    const item = chartData.value.find(d => d.name === params.name)
    if (item) {
      emit('highlight', item.value)
    }
  })

  chart.on('mouseout', () => {
    emit('highlight', null)
  })
}

function buildBarOption() {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const item = params[0]
        const ratio = chartData.value.find(d => d.name === item.name)?.ratio || 0
        return `${item.name}<br/>面积: ${item.value.toFixed(2)} km²<br/>占比: ${ratio.toFixed(1)}%`
      }
    },
    grid: {
      left: '15%',
      right: '8%',
      top: '15%',
      bottom: '35%'
    },
    xAxis: {
      type: 'category',
      data: chartData.value.map(item => item.name),
      axisLabel: { 
        rotate: 0, 
        fontSize: 10, 
        color: '#6b7280',
        interval: 0,
        formatter: (val) => val.split('').join('\n')
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } }
    },
    yAxis: {
      type: 'value',
      name: '面积(km²)',
      nameTextStyle: { fontSize: 11, color: '#6b7280' },
      axisLabel: { fontSize: 10, color: '#6b7280' },
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    series: [{
      type: 'bar',
      data: chartData.value.map(item => ({
        value: item.area,
        itemStyle: { 
          color: getDisplayColor(item), 
          borderRadius: [4, 4, 0, 0],
          opacity: props.filterValue !== null && item.value !== props.filterValue ? 0.5 : 1
        }
      })),
      barWidth: '50%'
    }]
  }
}

function buildPieOption() {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        return `${params.name}: ${params.value.toFixed(2)} km² (${params.percent.toFixed(1)}%)`
      }
    },
    legend: { show: false },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { 
        show: true, 
        fontSize: 10, 
        formatter: '{b}\n{d}%',
        opacity: (params) => {
          if (props.filterValue !== null && chartData.value.find(item => item.name === params.name)?.value !== props.filterValue) {
            return 0.5
          }
          return 1
        }
      },
      labelLine: { 
        length: 8, 
        length2: 4,
        lineStyle: {
          opacity: (params) => {
            if (props.filterValue !== null && chartData.value.find(item => item.name === params.name)?.value !== props.filterValue) {
              return 0.3
            }
            return 1
          }
        }
      },
      data: chartData.value.map(item => ({
        value: item.area,
        name: item.name,
        itemStyle: { 
          color: getDisplayColor(item),
          opacity: props.filterValue !== null && item.value !== props.filterValue ? 0.5 : 1
        }
      }))
    }]
  }
}

function handleResize() {
  chartInstance?.resize()
}

watch(() => props.year, fetchStats)
watch(() => props.districtId, fetchStats)
watch(() => props.filterValue, renderChart)
watch(chartType, renderChart)

async function refreshChart() {
  await nextTick()
  if (chartInstance) {
    chartInstance.resize()
  }
  renderChart()
}

function resize() {
  if (chartInstance) {
    chartInstance.resize()
  }
}

defineExpose({ refreshChart, resize })

onMounted(() => {
  console.log('📊 StatsPanel mounted')
  setTimeout(() => {
    fetchStats()
  }, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  disposeChart()
})
</script>

<style scoped>
.stats-panel {
  margin-top: auto;
  flex-shrink: 0;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stats-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.chart-toggle {
  display: flex;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
}

.toggle-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn:hover {
  color: #374151;
}

.toggle-btn.active {
  background: #ffffff;
  color: #3b82f6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.chart-container {
  position: relative;
}

.chart-wrapper {
  width: 100%;
}

.chart-item {
  width: 100%;
  height: 280px;
  min-height: 280px;
}

.loading-overlay,
.error-overlay,
.empty-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-text,
.error-text,
.empty-text {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}

.error-text {
  color: #ef4444;
}
</style>