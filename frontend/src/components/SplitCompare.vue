<template>
  <div class="split-compare">
    <div class="sc-header">
      <h3 class="sc-title">双年对比</h3>
      <div class="sc-mode-switch">
        <button :class="['mode-btn', { active: mode === 'split' }]" @click="mode = 'split'">◫ 分屏</button>
        <button :class="['mode-btn', { active: mode === 'overlay' }]" @click="mode = 'overlay'">◐ 叠加</button>
        <button :class="['mode-btn', { active: mode === 'diff' }]" @click="mode = 'diff'">📊 差值</button>
      </div>
    </div>

    <!-- 加载/错误 -->
    <div v-if="loading" class="status-overlay"><div class="spinner"></div>加载中...</div>
    <div v-else-if="error" class="status-overlay error">{{ error }}</div>

    <!-- 分屏模式：可拖拽滑杆 -->
    <div v-else-if="mode === 'split'" class="split-view" ref="splitViewRef">
      <div class="split-left" :style="{ width: splitPos + '%' }">
        <div class="year-tag left">2020</div>
        <div ref="leftChartRef" class="pane-chart"></div>
      </div>
      <div class="slider-handle" @mousedown="startDrag">
        <div class="slider-grip">
          <span>◀</span><span>▶</span>
        </div>
      </div>
      <div class="split-right" :style="{ width: (100 - splitPos) + '%' }">
        <div class="year-tag right">2021</div>
        <div ref="rightChartRef" class="pane-chart"></div>
      </div>
    </div>

    <!-- 叠加模式 -->
    <div v-else-if="mode === 'overlay'" class="overlay-view">
      <div ref="overlayChartRef" class="overlay-chart"></div>
    </div>

    <!-- 差值模式 -->
    <div v-else class="diff-view">
      <div ref="diffChartRef" class="diff-chart"></div>
    </div>

    <!-- 变化摘要 -->
    <div v-if="!loading && !error" class="change-summary">
      <span class="cs-item up" v-if="summary.up">📈 {{ summary.up }}</span>
      <span class="cs-item down" v-if="summary.down">📉 {{ summary.down }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDataCache } from '../composables/useDataCache'
import { CLASS_MAP, CLASS_ORDER } from '../config/colorMap'
import { getColorByValue } from '../config/colorMap'

const { getCachedStats } = useDataCache()

const props = defineProps({
  districtId: { type: Number, default: 0 },
})

const mode = ref('split')
const loading = ref(false)
const error = ref('')
const splitPos = ref(50)
const summary = ref({ up: '', down: '' })

const splitViewRef = ref(null)
const leftChartRef = ref(null)
const rightChartRef = ref(null)
const overlayChartRef = ref(null)
const diffChartRef = ref(null)

let charts = []
let data2020 = null
let data2021 = null
let dragging = false

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
    const [r20, r21] = await Promise.all([
      getCachedStats(props.districtId, 2020),
      getCachedStats(props.districtId, 2021),
    ])
    data2020 = parseData(r20)
    data2021 = parseData(r21)
    await nextTick()
    if (mode.value === 'split') renderSplit()
    else if (mode.value === 'overlay') renderOverlay()
    else renderDiff()
    computeSummary()
  } catch (e) {
    error.value = '数据加载失败'
  } finally {
    loading.value = false
  }
}

function computeSummary() {
  const changes = CLASS_ORDER.map((v) => {
    const a0 = data2020?.[v] || 0
    const a1 = data2021?.[v] || 0
    return { name: CLASS_MAP[v], diff: a1 - a0, rate: a0 > 0 ? ((a1 - a0) / a0) * 100 : 0 }
  }).filter((c) => Math.abs(c.diff) > 0.01)

  const up = changes.filter((c) => c.rate > 0).sort((a, b) => b.rate - a.rate)[0]
  const down = changes.filter((c) => c.rate < 0).sort((a, b) => a.rate - b.rate)[0]
  summary.value = {
    up: up ? `${up.name} +${up.diff.toFixed(1)} km² (↑${up.rate.toFixed(1)}%)` : '',
    down: down ? `${down.name} ${down.diff.toFixed(1)} km² (↓${Math.abs(down.rate).toFixed(1)}%)` : '',
  }
}

// ========== 拖拽滑杆 ==========
function startDrag(e) {
  dragging = true
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

function onDrag(e) {
  if (!dragging || !splitViewRef.value) return
  const rect = splitViewRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  splitPos.value = Math.max(25, Math.min(75, (x / rect.width) * 100))
}

function stopDrag() {
  dragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// ========== 分屏 ==========
function renderSplit() {
  if (!leftChartRef.value || !rightChartRef.value) return
  const c1 = echarts.init(leftChartRef.value)
  const c2 = echarts.init(rightChartRef.value)
  charts = [c1, c2]

  const makeOption = (data, year) => {
    const items = CLASS_ORDER.filter((v) => (data[v] || 0) > 0).map((v) => ({
      name: CLASS_MAP[v],
      value: data[v] || 0,
      itemStyle: { color: getColorByValue(v) },
    }))
    return {
      title: { text: `${year} 年`, left: 'center', top: 2, textStyle: { fontSize: 13, fontWeight: 600 } },
      tooltip: { trigger: 'item', formatter: '{b}: {c} km² ({d}%)' },
      series: [{
        type: 'pie', radius: ['42%', '68%'], center: ['50%', '55%'],
        label: { fontSize: 9, formatter: '{b}\n{d}%' },
        animationDuration: 800,
        data: items,
      }],
    }
  }
  c1.setOption(makeOption(data2020, 2020))
  c2.setOption(makeOption(data2021, 2021))
}

// ========== 叠加 ==========
function renderOverlay() {
  if (!overlayChartRef.value) return
  const c = echarts.init(overlayChartRef.value)
  charts = [c]

  const vals = CLASS_ORDER.filter((v) => (data2020[v] || 0) > 0 || (data2021[v] || 0) > 0)
  c.setOption({
    title: { text: '2020 vs 2021', left: 'center', top: 2, textStyle: { fontSize: 13, fontWeight: 600 } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['2020', '2021'], bottom: 0 },
    grid: { left: '8%', right: '6%', top: '16%', bottom: '16%' },
    xAxis: { type: 'category', data: vals.map((v) => CLASS_MAP[v]), axisLabel: { rotate: 25, fontSize: 10 } },
    yAxis: { type: 'value', name: 'km²' },
    animationDuration: 600,
    series: [
      { name: '2020', type: 'bar', data: vals.map((v) => data2020[v] || 0), itemStyle: { color: '#93c5fd', borderRadius: [4, 4, 0, 0] }, barGap: '15%' },
      { name: '2021', type: 'bar', data: vals.map((v) => data2021[v] || 0), itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0], opacity: 0.78 } },
    ],
  })
}

// ========== 差值 ==========
function renderDiff() {
  if (!diffChartRef.value) return
  const c = echarts.init(diffChartRef.value)
  charts = [c]

  const vals = CLASS_ORDER.filter((v) => (data2020[v] || 0) > 0 || (data2021[v] || 0) > 0)
  const diffs = vals.map((v) => {
    const d = (data2021[v] || 0) - (data2020[v] || 0)
    return { name: CLASS_MAP[v], value: d, color: d >= 0 ? '#ef4444' : '#22c55e' }
  })

  c.setOption({
    title: { text: '面积变化量 (2021 - 2020)', left: 'center', top: 2, textStyle: { fontSize: 13, fontWeight: 600 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}<br/>${p[0].value >= 0 ? '+' : ''}${p[0].value.toFixed(2)} km²` },
    grid: { left: '12%', right: '6%', top: '14%', bottom: '8%' },
    xAxis: { type: 'value', name: 'km²', axisLabel: { formatter: (v) => (v >= 0 ? '+' : '') + v.toFixed(0) } },
    yAxis: { type: 'category', data: diffs.map((d) => d.name) },
    animationDuration: 600,
    series: [{
      type: 'bar',
      data: diffs.map((d) => ({ value: d.value, itemStyle: { color: d.color, borderRadius: d.value >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      markLine: { data: [{ xAxis: 0, lineStyle: { color: '#6b7280', type: 'dashed' } }], symbol: 'none', label: { show: false } },
    }],
  })
}

function disposeAll() {
  charts.forEach((c) => c.dispose())
  charts = []
}

function handleResize() { charts.forEach((c) => c.resize()) }

watch(mode, () => { disposeAll(); nextTick(() => { if (mode.value === 'split') renderSplit(); else if (mode.value === 'overlay') renderOverlay(); else renderDiff() }) })
watch(() => props.districtId, () => loadData())

onMounted(() => { loadData(); window.addEventListener('resize', handleResize) })
onUnmounted(() => { window.removeEventListener('resize', handleResize); disposeAll() })

defineExpose({ refresh: loadData })
</script>

<style scoped>
.split-compare { display: flex; flex-direction: column; gap: 8px; height: 100%; padding: 10px; }
.sc-header { display: flex; justify-content: space-between; align-items: center; }
.sc-title { font-size: 15px; font-weight: 600; color: #374151; margin: 0; }
.sc-mode-switch { display: flex; background: #f3f4f6; border-radius: 6px; padding: 2px; }
.mode-btn { padding: 4px 10px; border: none; border-radius: 4px; font-size: 11px; cursor: pointer; background: transparent; color: #6b7280; transition: all 0.2s; }
.mode-btn.active { background: #fff; color: #3b82f6; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
.sc-controls { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
.sc-controls select { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 12px; }
.status-overlay { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 40px; color: #6b7280; font-size: 13px; }
.status-overlay.error { color: #ef4444; }
.spinner { width: 20px; height: 20px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 分屏 ---- */
.split-view { display: flex; flex: 1; min-height: 280px; position: relative; user-select: none; }
.split-left, .split-right { position: relative; overflow: hidden; }
.split-left { border-right: 1px solid #e5e7eb; }
.year-tag { position: absolute; top: 6px; z-index: 2; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 600; }
.year-tag.left { left: 6px; background: #dbeafe; color: #1e40af; }
.year-tag.right { right: 6px; background: #e0f2fe; color: #0c4a6e; }
.pane-chart { width: 100%; height: 100%; }

/* ---- 拖拽滑杆 ---- */
.slider-handle { width: 20px; flex-shrink: 0; cursor: col-resize; display: flex; align-items: center; justify-content: center; background: #f9fafb; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; z-index: 3; }
.slider-handle:hover { background: #f3f4f6; }
.slider-grip { display: flex; gap: 1px; color: #9ca3af; font-size: 8px; }

/* ---- 叠加 & 差值 ---- */
.overlay-view, .diff-view { flex: 1; min-height: 280px; }
.overlay-chart, .diff-chart { width: 100%; height: 280px; }

/* ---- 摘要 ---- */
.change-summary { display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e5e7eb; font-size: 11px; }
.cs-item.up { color: #dc2626; }
.cs-item.down { color: #16a34a; }
</style>
