<template>
  <div class="split-compare">
    <div class="sc-header">
      <h3 class="sc-title">双年对比</h3>
      <div class="sc-mode-switch">
        <button :class="['mode-btn', { active: mode === 'split' }]" @click="mode = 'split'">
          ◫ 分屏对比
        </button>
        <button :class="['mode-btn', { active: mode === 'overlay' }]" @click="mode = 'overlay'">
          ◐ 叠加对比
        </button>
      </div>
    </div>

    <!-- 区县选择 -->
    <div class="sc-controls">
      <label class="control-label">区县：</label>
      <select v-model="districtId" class="district-select" @change="loadData">
        <option v-for="d in districts" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </div>

    <!-- 加载/错误 -->
    <div v-if="loading" class="status-overlay"><div class="spinner"></div>加载中...</div>
    <div v-else-if="error" class="status-overlay error">{{ error }}</div>

    <!-- 分屏模式 -->
    <div v-else-if="mode === 'split'" class="split-view">
      <div class="split-pane left">
        <div class="pane-label">2020</div>
        <div ref="leftChartRef" class="pane-chart"></div>
      </div>
      <div class="split-divider"></div>
      <div class="split-pane right">
        <div class="pane-label">2021</div>
        <div ref="rightChartRef" class="pane-chart"></div>
      </div>
    </div>

    <!-- 叠加模式 -->
    <div v-else class="overlay-view">
      <div ref="overlayChartRef" class="overlay-chart"></div>
      <div class="legend-hint">
        <span class="hint-2020">■ 2020</span>
        <span class="hint-2021">■ 2021</span>
      </div>
    </div>

    <!-- 变化摘要 -->
    <div v-if="!loading && !error" class="change-summary">
      <div class="summary-item up" v-if="maxUp">
        📈 增长最多：<strong>{{ maxUp }}</strong>
      </div>
      <div class="summary-item down" v-if="maxDown">
        📉 减少最多：<strong>{{ maxDown }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDataCache } from '../composables/useDataCache'
import { CLASS_MAP, CLASS_ORDER } from '../config/colorMap'
import { DISTRICT_MAP } from '../utils/comparisonHelpers'
import { getColorByValue, getNameByValue } from '../config/colorMap'

const { getCachedStats } = useDataCache()

const districts = Object.entries(DISTRICT_MAP).map(([id, name]) => ({
  id: parseInt(id),
  name,
}))

const mode = ref('split')
const districtId = ref(0)
const loading = ref(false)
const error = ref('')
const maxUp = ref('')
const maxDown = ref('')

const leftChartRef = ref(null)
const rightChartRef = ref(null)
const overlayChartRef = ref(null)

let leftChart = null
let rightChart = null
let overlayChart = null

let data2020 = null
let data2021 = null

function parseData(raw) {
  const result = {}
  const classes = raw?.stats?.classes || raw?.classes || {}
  Object.entries(classes).forEach(([key, cls]) => {
    const val = parseInt(key)
    if (CLASS_ORDER.includes(val)) {
      result[val] = (cls.area_m2 || (cls.pixel_count || 0) * 100) / 1_000_000
    }
  })
  return result
}

async function loadData() {
  loading.value = true
  error.value = ''
  disposeAll()

  try {
    const [r2020, r2021] = await Promise.all([
      getCachedStats(districtId.value, 2020),
      getCachedStats(districtId.value, 2021),
    ])
    data2020 = parseData(r2020)
    data2021 = parseData(r2021)

    await nextTick()
    if (mode.value === 'split') {
      renderSplit()
    } else {
      renderOverlay()
    }
    computeSummary()
  } catch (e) {
    error.value = '数据加载失败: ' + e.message
  } finally {
    loading.value = false
  }
}

function computeSummary() {
  const changes = CLASS_ORDER.map((v) => {
    const a0 = data2020?.[v] || 0
    const a1 = data2021?.[v] || 0
    const diff = a1 - a0
    const rate = a0 > 0 ? (diff / a0) * 100 : diff > 0 ? Infinity : -Infinity
    return { name: CLASS_MAP[v], diff, rate }
  }).filter((c) => Math.abs(c.diff) > 0.01)

  const up = changes.filter((c) => c.rate > 0).sort((a, b) => b.rate - a.rate)[0]
  const down = changes.filter((c) => c.rate < 0).sort((a, b) => a.rate - b.rate)[0]

  maxUp.value = up ? `${up.name} ↑${up.rate.toFixed(1)}% (+${up.diff.toFixed(1)} km²)` : ''
  maxDown.value = down
    ? `${down.name} ↓${Math.abs(down.rate).toFixed(1)}% (${down.diff.toFixed(1)} km²)`
    : ''
}

// ==================== 分屏模式 ====================
function renderSplit() {
  if (!leftChartRef.value || !rightChartRef.value) return

  leftChart = echarts.init(leftChartRef.value)
  rightChart = echarts.init(rightChartRef.value)

  const makePieOption = (data, year) => {
    const items = CLASS_ORDER.filter((v) => (data[v] || 0) > 0).map((v) => ({
      name: CLASS_MAP[v],
      value: data[v] || 0,
      itemStyle: { color: getColorByValue(v) },
    }))
    return {
      title: { text: `${year}`, left: 'center', top: 5, textStyle: { fontSize: 13, fontWeight: 600 } },
      tooltip: { trigger: 'item', formatter: '{b}: {c} km² ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '65%'],
          center: ['50%', '55%'],
          label: { fontSize: 10, formatter: '{b}\n{d}%' },
          data: items,
        },
      ],
    }
  }

  leftChart.setOption(makePieOption(data2020, 2020))
  rightChart.setOption(makePieOption(data2021, 2021))
}

// ==================== 叠加模式 ====================
function renderOverlay() {
  if (!overlayChartRef.value) return

  overlayChart = echarts.init(overlayChartRef.value)

  const categories = CLASS_ORDER.filter(
    (v) => (data2020[v] || 0) > 0 || (data2021[v] || 0) > 0
  ).map((v) => CLASS_MAP[v])

  const d2020 = CLASS_ORDER.filter((v) => (data2020[v] || 0) > 0 || (data2021[v] || 0) > 0).map(
    (v) => data2020[v] || 0
  )
  const d2021 = CLASS_ORDER.filter((v) => (data2020[v] || 0) > 0 || (data2021[v] || 0) > 0).map(
    (v) => data2021[v] || 0
  )

  overlayChart.setOption({
    title: {
      text: '2020 vs 2021 叠加对比',
      left: 'center',
      top: 5,
      textStyle: { fontSize: 14, fontWeight: 600 },
    },
    tooltip: { trigger: 'axis' },
    legend: { data: ['2020', '2021'], bottom: 0 },
    grid: { left: '8%', right: '8%', top: '18%', bottom: '18%' },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis: { type: 'value', name: '面积 (km²)' },
    series: [
      {
        name: '2020',
        type: 'bar',
        data: d2020,
        itemStyle: { color: '#93c5fd', borderRadius: [4, 4, 0, 0] },
        barGap: '10%',
      },
      {
        name: '2021',
        type: 'bar',
        data: d2021,
        itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0], opacity: 0.75 },
      },
    ],
  })
}

function disposeAll() {
  leftChart?.dispose()
  rightChart?.dispose()
  overlayChart?.dispose()
  leftChart = null
  rightChart = null
  overlayChart = null
}

function handleResize() {
  leftChart?.resize()
  rightChart?.resize()
  overlayChart?.resize()
}

watch(mode, () => {
  nextTick(() => {
    disposeAll()
    if (mode.value === 'split') renderSplit()
    else renderOverlay()
  })
})

onMounted(() => {
  loadData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  disposeAll()
})

defineExpose({ refresh: loadData })
</script>

<style scoped>
.split-compare {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 12px;
}

.sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sc-title {
  font-size: 15px;
  font-weight: 600;
  color: #374151;
  margin: 0;
}

.sc-mode-switch {
  display: flex;
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: transparent;
  color: #6b7280;
  transition: all 0.2s;
}

.mode-btn.active {
  background: #fff;
  color: #3b82f6;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.sc-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  font-size: 13px;
  color: #6b7280;
}

.district-select {
  padding: 5px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}

.status-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px 20px;
  color: #6b7280;
  font-size: 14px;
}

.status-overlay.error { color: #ef4444; }

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 分屏 ---- */
.split-view {
  display: flex;
  flex: 1;
  min-height: 300px;
}

.split-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.pane-label {
  position: absolute;
  top: 8px;
  z-index: 2;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.left .pane-label {
  left: 8px;
  background: #dbeafe;
  color: #1e40af;
}

.right .pane-label {
  right: 8px;
  background: #e8f4f8;
  color: #0c4a6e;
}

.pane-chart {
  flex: 1;
  width: 100%;
}

.split-divider {
  width: 2px;
  background: #d1d5db;
  flex-shrink: 0;
}

/* ---- 叠加 ---- */
.overlay-view {
  flex: 1;
  min-height: 320px;
}

.overlay-chart {
  width: 100%;
  height: 320px;
}

.legend-hint {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 8px;
  font-size: 12px;
}

.hint-2020 { color: #93c5fd; }
.hint-2021 { color: #3b82f6; }

/* ---- 摘要 ---- */
.change-summary {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.summary-item {
  font-size: 13px;
}

.summary-item.up { color: #dc2626; }
.summary-item.down { color: #16a34a; }
</style>
