<template>
  <div class="change-comparison">
    <div class="cc-header">
      <h3>变化对比</h3>
      <span class="cc-badge">2020 → 2021</span>
    </div>

    <div class="cc-controls">
      <label>区县：</label>
      <select v-model="districtId" @change="loadData">
        <option v-for="(name, id) in DISTRICT_MAP" :key="id" :value="parseInt(id)">{{ name }}</option>
      </select>
      <label class="sort-label">排序：</label>
      <select v-model="sortBy" @change="renderChart">
        <option value="change">按变化量</option>
        <option value="name">按名称</option>
      </select>
    </div>

    <div v-if="loading" class="status-msg"><div class="spinner"></div>加载中...</div>
    <div v-else-if="error" class="status-msg err">{{ error }}</div>
    <div v-else class="chart-wrap"><div ref="chartRef" class="chart-el"></div></div>

    <div v-if="!loading && !error" class="cc-insights">
      <div class="insight" v-if="topInc">
        <span class="dot" :style="{background: topInc.color}"></span>
        增长最快：<b>{{ topInc.name }}</b> +{{ topInc.diff.toFixed(1) }} km²
      </div>
      <div class="insight" v-if="topDec">
        <span class="dot" :style="{background: topDec.color}"></span>
        减少最多：<b>{{ topDec.name }}</b> {{ topDec.diff.toFixed(1) }} km²
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useDataCache } from '../composables/useDataCache'
import { DISTRICT_MAP, CLASS_MAP, CLASS_ORDER } from '../utils/comparisonHelpers'
import { convertApiStats, calculateAreaChanges } from '../utils/dataConverter'
import { getColorByValue } from '../config/colorMap'

const { getCachedStats } = useDataCache()

const districtId = ref(0)
const sortBy = ref('change')
const loading = ref(false)
const error = ref('')
const chartRef = ref(null)
let chartInstance = null
let changesData = []
const topInc = ref(null)
const topDec = ref(null)

async function loadData() {
  loading.value = true; error.value = ''
  try {
    const [d20, d21] = await Promise.all([
      getCachedStats(districtId.value, 2020),
      getCachedStats(districtId.value, 2021),
    ])
    const s20 = convertApiStats(d20, districtId.value, DISTRICT_MAP[districtId.value])
    const s21 = convertApiStats(d21, districtId.value, DISTRICT_MAP[districtId.value])
    changesData = calculateAreaChanges(s20, s21)
    computeInsights()
    await nextTick(); renderChart()
  } catch (e) { error.value = '加载失败: ' + e.message
  } finally { loading.value = false }
}

function computeInsights() {
  const inc = changesData.filter((c) => c.diff > 0).sort((a, b) => b.diff - a.diff)[0]
  const dec = changesData.filter((c) => c.diff < 0).sort((a, b) => a.diff - b.diff)[0]
  topInc.value = inc ? { name: inc.name, diff: inc.diff, color: getColorByValue(inc.value) } : null
  topDec.value = dec ? { name: dec.name, diff: dec.diff, color: getColorByValue(dec.value) } : null
}

function renderChart() {
  if (!chartRef.value || !changesData.length) return
  if (chartInstance) chartInstance.dispose()
  chartInstance = echarts.init(chartRef.value)

  let data = [...changesData]
  if (sortBy.value === 'change') data.sort((a, b) => b.diff - a.diff)
  else data.sort((a, b) => a.name.localeCompare(b.name))

  chartInstance.setOption({
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p) => {
        const d = data[p[0]?.dataIndex]; if (!d) return ''
        return `<b>${d.name}</b><br/>2020: ${d.area2020.toFixed(1)} km²<br/>2021: ${d.area2021.toFixed(1)} km²<br/><span style="color:${d.diff >= 0 ? '#ef4444' : '#22c55e'}">变化: ${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(1)} km² (${d.rate >= 0 ? '+' : ''}${d.rate.toFixed(1)}%)</span>`
      },
    },
    legend: { data: ['2020', '2021'], bottom: 0, textStyle: { fontSize: 10 } },
    grid: { left: '10%', right: '8%', top: '8%', bottom: '16%' },
    xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { rotate: 25, fontSize: 10 } },
    yAxis: { type: 'value', name: 'km²', nameTextStyle: { fontSize: 10 } },
    animationDuration: 600,
    series: [
      { name: '2020', type: 'bar', barWidth: '35%', itemStyle: { color: '#93c5fd', borderRadius: [4, 4, 0, 0] }, data: data.map((d) => d.area2020) },
      { name: '2021', type: 'bar', barWidth: '35%', itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }, data: data.map((d) => d.area2021) },
    ],
  }, true)

  setTimeout(() => chartInstance?.resize(), 50)
}

function handleResize() { chartInstance?.resize() }
onMounted(() => { loadData(); window.addEventListener('resize', handleResize) })
onUnmounted(() => { window.removeEventListener('resize', handleResize); chartInstance?.dispose() })
defineExpose({ refreshChart: renderChart })
</script>

<style scoped>
.change-comparison { display: flex; flex-direction: column; gap: 8px; }
.cc-header { display: flex; align-items: center; gap: 8px; }
.cc-header h3 { font-size: 14px; font-weight: 600; margin: 0; }
.cc-badge { font-size: 10px; background: #f3f4f6; padding: 2px 8px; border-radius: 8px; color: #6b7280; }
.cc-controls { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
.cc-controls select { padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 5px; font-size: 12px; }
.sort-label { margin-left: 8px; }
.status-msg { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 30px; font-size: 13px; color: #6b7280; }
.status-msg.err { color: #ef4444; }
.spinner { width: 18px; height: 18px; border: 2px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.chart-wrap { min-height: 180px; }
.chart-el { width: 100%; height: 200px; }
.cc-insights { display: flex; gap: 12px; font-size: 11px; }
.insight { display: flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
</style>
