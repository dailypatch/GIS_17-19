<template>
  <div class="metric-cards">
    <div
      v-for="card in metrics"
      :key="card.label"
      class="metric-card"
      :style="{ borderTop: `3px solid ${card.color}` }"
    >
      <div class="card-top">
        <span class="metric-label">{{ card.label }}</span>
        <span v-if="card.trend" class="metric-trend" :class="card.trendClass">
          {{ card.trend }}
        </span>
      </div>
      <div class="metric-value" :style="{ color: card.color }">
        <span ref="valueRefs">{{ card.displayValue }}</span>
      </div>
      <div class="metric-sub">{{ card.sub }}</div>
      <div class="card-bar">
        <div
          class="card-bar-fill"
          :style="{ width: card.barWidth, background: card.color }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useDataCache } from '../composables/useDataCache'

const props = defineProps({
  districtId: { type: Number, default: 0 },
  year: { type: Number, default: 2021 },
})

const statsData = ref(null)
const prevStatsData = ref(null)
const displayValues = ref([0, 0, 0, 0])

const { getCachedStats } = useDataCache()

function convertStats(data) {
  if (!data) return {}
  const stats = data.stats || data
  if (!stats.classes) return {}
  const result = {}
  Object.entries(stats.classes).forEach(([key, cls]) => {
    const v = parseInt(key)
    result[v] = (cls.area_m2 || (cls.pixel_count || 0) * 100) / 1_000_000
  })
  return result
}

function getArea(data, pv) {
  return data?.[pv] || 0
}

function getTotal(data) {
  return data ? Object.values(data).reduce((s, v) => s + v, 0) : 0
}

async function loadData() {
  try {
    const prevYear = props.year === 2021 ? 2020 : 2021
    const [c, p] = await Promise.all([
      getCachedStats(props.districtId, props.year),
      getCachedStats(props.districtId, prevYear),
    ])
    statsData.value = convertStats(c)
    prevStatsData.value = convertStats(p)
    animateValues()
  } catch {
    statsData.value = null
    prevStatsData.value = null
  }
}

function animateValues() {
  const targets = metrics.value.map((m) => m.rawValue)
  const starts = [...displayValues.value]
  const duration = 600
  const start = performance.now()

  function step(now) {
    const elapsed = now - start
    const t = Math.min(elapsed / duration, 1)
    // ease-out
    const e = 1 - Math.pow(1 - t, 3)
    displayValues.value = starts.map((s, i) => s + (targets[i] - s) * e)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const metrics = computed(() => {
  const empty = [
    { label: '建成区面积', rawValue: 0, displayValue: '--', sub: '', color: '#fa0000', trend: '', trendClass: '', barWidth: '0%' },
    { label: '绿地率', rawValue: 0, displayValue: '--', sub: '', color: '#22c55e', trend: '', trendClass: '', barWidth: '0%' },
    { label: '水体面积', rawValue: 0, displayValue: '--', sub: '', color: '#0064c8', trend: '', trendClass: '', barWidth: '0%' },
    { label: '林地面积', rawValue: 0, displayValue: '--', sub: '', color: '#006400', trend: '', trendClass: '', barWidth: '0%' },
  ]

  if (!statsData.value) return empty

  const c = statsData.value
  const p = prevStatsData.value
  const cTotal = getTotal(c)
  const pTotal = getTotal(p)

  const built = getArea(c, 50)
  const forest = getArea(c, 10)
  const shrub = getArea(c, 20)
  const grass = getArea(c, 30)
  const wetland = getArea(c, 90)
  const water = getArea(c, 80)
  const green = forest + shrub + grass + wetland
  const greenPct = cTotal > 0 ? (green / cTotal) * 100 : 0

  const pBuilt = getArea(p, 50)
  const pGreen = p ? getArea(p, 10) + getArea(p, 20) + getArea(p, 30) + getArea(p, 90) : 0
  const pWater = getArea(p, 80)
  const pForest = getArea(p, 10)
  const pGreenPct = pTotal > 0 ? (pGreen / pTotal) * 100 : 0

  function trend(curr, prev) {
    if (!prev || prev === 0) return { text: '', cls: '' }
    const d = curr - prev
    const pct = ((d / prev) * 100)
    const arrow = d >= 0 ? '↑' : '↓'
    return {
      text: `${arrow} ${Math.abs(pct).toFixed(1)}%`,
      cls: d >= 0 ? 'up' : 'down',
    }
  }

  const items = [
    { label: '建成区面积', rawValue: built, unit: 'km²', sub: cTotal > 0 ? `占比 ${(built / cTotal * 100).toFixed(1)}%` : '', color: '#fa0000', barVal: built, barMax: cTotal, tr: trend(built, pBuilt) },
    { label: '绿地率', rawValue: greenPct, unit: '%', sub: `${green.toFixed(0)} km²`, color: '#22c55e', barVal: greenPct, barMax: 100, tr: trend(greenPct, pGreenPct) },
    { label: '水体面积', rawValue: water, unit: 'km²', sub: cTotal > 0 ? `占比 ${(water / cTotal * 100).toFixed(1)}%` : '', color: '#0064c8', barVal: water, barMax: cTotal, tr: trend(water, pWater) },
    { label: '林地面积', rawValue: forest, unit: 'km²', sub: cTotal > 0 ? `占比 ${(forest / cTotal * 100).toFixed(1)}%` : '', color: '#006400', barVal: forest, barMax: cTotal, tr: trend(forest, pForest) },
  ]

  return items.map((item) => {
    const dv = displayValues.value[items.indexOf(item)] || 0
    const animating = Math.abs(dv - item.rawValue) > 0.05
    const display = animating
      ? `${dv.toFixed(1)} ${item.unit}`
      : `${item.rawValue.toFixed(1)} ${item.unit}`
    return {
      label: item.label,
      rawValue: item.rawValue,
      displayValue: display,
      sub: item.sub,
      color: item.color,
      trend: item.tr.text,
      trendClass: item.tr.cls,
      barWidth: item.barMax > 0 ? `${Math.min((item.barVal / item.barMax) * 100, 100)}%` : '0%',
    }
  })
})

watch([() => props.districtId, () => props.year], loadData)
onMounted(loadData)
</script>

<style scoped>
.metric-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.metric-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  transition: transform 0.2s, box-shadow 0.2s;
}

.metric-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.metric-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 500;
}

.metric-trend {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
}

.metric-trend.up {
  color: #16a34a;
  background: #dcfce7;
}

.metric-trend.down {
  color: #dc2626;
  background: #fee2e2;
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
}

.metric-sub {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 8px;
}

.card-bar {
  height: 3px;
  background: #f1f5f9;
  border-radius: 2px;
  overflow: hidden;
}

.card-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.6;
}
</style>
