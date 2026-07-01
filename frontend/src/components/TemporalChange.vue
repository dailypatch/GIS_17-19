<template>
  <div class="temporal-change">
    <div class="tc-header">
      <h3 class="tc-title">时序变化（2020 → 2021 变化率）</h3>
    </div>

    <div class="tc-controls">
      <label class="control-label">区县：</label>
      <select v-model="selectedDistrict" @change="loadData" class="district-select">
        <option v-for="d in districtOptions" :key="d.id" :value="d.id">
          {{ d.name }}
        </option>
      </select>
    </div>

    <div ref="chartRef" class="chart-container"></div>

    <div v-if="loading" class="loading-overlay">加载中...</div>
    <div v-else-if="error" class="error-overlay">{{ error }}</div>

    <div class="summary" v-if="summary && !loading && !error">
      <span class="summary-item increase">📈 {{ summary.maxUp }}</span>
      <span class="summary-item decrease">📉 {{ summary.maxDown }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDataCache } from '../composables/useDataCache'
import { CLASS_MAP, CLASS_ORDER } from '../config/colorMap'
import { DISTRICT_MAP } from '../utils/comparisonHelpers'

const { getCachedStats } = useDataCache()

const districtOptions = Object.entries(DISTRICT_MAP).map(([id, name]) => ({
  id: parseInt(id),
  name
}))

const selectedDistrict = ref(3)
const chartRef = ref(null)
const loading = ref(false)
const error = ref('')
const summary = ref(null)
let chartInstance = null

function parseApiData(apiData) {
  const result = {}
  const classes = apiData?.stats?.classes || apiData?.classes || {}
  Object.entries(classes).forEach(([key, cls]) => {
    const classValue = parseInt(key)
    if (CLASS_MAP[classValue] !== undefined) {
      const area_m2 = cls.area_m2 || (cls.pixel_count ? cls.pixel_count * 100 : 0)
      result[classValue] = area_m2 / 1000000
    }
  })
  return result
}

function calculateChanges(data2020, data2021) {
  const result = []
  CLASS_ORDER.forEach(classValue => {
    const area2020 = data2020[classValue] || 0
    const area2021 = data2021[classValue] || 0
    const diff = area2021 - area2020
    let rate = 0
    if (area2020 !== 0) {
      rate = parseFloat(((diff / area2020) * 100).toFixed(2))
    } else if (diff !== 0) {
      rate = diff > 0 ? Infinity : -Infinity
    }
    if (area2020 > 0 || area2021 > 0) {
      result.push({
        value: classValue,
        name: CLASS_MAP[classValue],
        area2020: parseFloat(area2020.toFixed(4)),
        area2021: parseFloat(area2021.toFixed(4)),
        diff: parseFloat(diff.toFixed(4)),
        rate
      })
    }
  })
  return result.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
}

function buildSummary(changes) {
  const maxUp = changes.reduce((max, item) => item.rate > max.rate ? item : max, { rate: -Infinity })
  const maxDown = changes.reduce((min, item) => item.rate < min.rate ? item : min, { rate: Infinity })

  const formatRate = (item) => {
    if (item.rate === Infinity) return '新增'
    if (item.rate === -Infinity) return '消失'
    return item.rate >= 0 ? `↑ ${item.rate.toFixed(1)}%` : `↓ ${Math.abs(item.rate).toFixed(1)}%`
  }

  summary.value = {
    maxUp: maxUp.rate !== -Infinity ? `${maxUp.name} ${formatRate(maxUp)}` : '无',
    maxDown: maxDown.rate !== Infinity ? `${maxDown.name} ${formatRate(maxDown)}` : '无'
  }
}

function renderChart(changes) {
  if (!chartRef.value) return
  const dom = chartRef.value
  if (dom.offsetWidth === 0 || dom.offsetHeight === 0) return

  if (chartInstance) {
    chartInstance.dispose()
  }
  chartInstance = echarts.init(dom)

  const names = changes.map(d => d.name)
  const rates = changes.map(d => d.rate === Infinity ? 9999 : d.rate === -Infinity ? -9999 : d.rate)
  const maxRate = Math.max(...rates.map(Math.abs)) * 1.1

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#fff',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#374151', fontSize: 12 },
      formatter: (params) => {
        const d = changes[params[0]?.dataIndex]
        if (!d) return ''
        const rateStr = d.rate === Infinity ? '新增' : d.rate === -Infinity ? '消失' : `${d.rate >= 0 ? '+' : ''}${d.rate.toFixed(1)}%`
        return `<div style="font-weight:600;">${d.name}</div>
          <div>2020: ${d.area2020.toFixed(2)} km²</div>
          <div>2021: ${d.area2021.toFixed(2)} km²</div>
          <div style="color:${d.rate >= 0 ? '#ff4d4f' : '#52c41a'};margin-top:4px;">
            变化: ${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(2)} km² (${rateStr})
          </div>`
      }
    },
    grid: { left: 60, right: 130, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      min: -maxRate,
      max: maxRate,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#6b7280', formatter: (val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } }
    },
    yAxis: {
      type: 'category',
      data: names,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: '#374151', fontWeight: 500 }
    },
    series: [{
      type: 'bar',
      barWidth: '60%',
      itemStyle: {
        color: (params) => changes[params.dataIndex]?.rate > 0 ? '#ff4d4f' : '#52c41a',
        borderRadius: [0, 4, 4, 0]
      },
      label: {
        show: true,
        position: 'right',
        fontSize: 11,
        fontWeight: 'bold',
        color: '#374151',
        formatter: (params) => {
          const d = changes[params.dataIndex]
          if (!d) return ''
          const rateText = d.rate === Infinity ? '↑ 新增' : d.rate === -Infinity ? '↓ 消失' : d.rate > 0 ? `↑ ${d.rate.toFixed(1)}%` : d.rate < 0 ? `↓ ${Math.abs(d.rate).toFixed(1)}%` : '—'
          const diffText = d.diff !== 0 ? `(${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(1)} km²)` : ''
          return `${rateText} ${diffText}`
        }
      },
      data: rates
    }]
  }, true)
}

async function tryRenderChart(changes, retryCount = 0) {
  await nextTick()
  if (!chartRef.value) return
  const dom = chartRef.value
  if (dom.offsetWidth === 0 || dom.offsetHeight === 0) {
    if (retryCount < 3) {
      setTimeout(() => tryRenderChart(changes, retryCount + 1), 100)
    }
    return
  }
  renderChart(changes)
}

async function loadData() {
  loading.value = true
  error.value = ''
  summary.value = null

  try {
    const [res2020, res2021] = await Promise.all([
      getCachedStats(selectedDistrict.value, 2020),
      getCachedStats(selectedDistrict.value, 2021)
    ])

    const data2020 = parseApiData(res2020)
    const data2021 = parseApiData(res2021)
    const changes = calculateChanges(data2020, data2021)

    if (changes.length === 0) {
      error.value = '该区县暂无数据'
      return
    }

    buildSummary(changes)
    loading.value = false
    await tryRenderChart(changes)
  } catch (err) {
    error.value = '数据加载失败'
    loading.value = false
  }
}

function refresh() {
  loadData()
}

function handleResize() {
  chartInstance?.resize()
}

defineExpose({ refresh, handleResize })

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})
</script>

<style scoped>
.temporal-change {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  height: 100%;
  box-sizing: border-box;
}

.tc-header {
  margin-bottom: 4px;
}

.tc-title {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.tc-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
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
  min-width: 100px;
}

.district-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.chart-container {
  width: 100%;
  height: 350px;
  position: relative;
}

.loading-overlay, .error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  font-size: 14px;
  z-index: 10;
}

.error-overlay {
  color: #ef4444;
}

.summary {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.summary-item {
  font-size: 13px;
  font-weight: 500;
}

.summary-item.increase {
  color: #ff4d4f;
}

.summary-item.decrease {
  color: #52c41a;
}
</style>
