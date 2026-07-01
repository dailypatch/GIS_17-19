<template>
  <div class="metric-cards">
    <div class="metric-card" v-for="card in metrics" :key="card.label">
      <div class="metric-value" :style="{ color: card.color }">{{ card.value }}</div>
      <div class="metric-label">{{ card.label }}</div>
      <div class="metric-ratio">{{ card.ratio }}</div>
      <div v-if="card.change" :class="['metric-change', card.changeClass]">
        {{ card.change }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useDataCache } from '../composables/useDataCache'

const props = defineProps({
  districtId: {
    type: Number,
    default: 0
  },
  year: {
    type: Number,
    default: 2021
  }
})

const statsData = ref(null)
const prevStatsData = ref(null)
const loading = ref(false)

const { getCachedStats } = useDataCache()

function convertStats(data) {
  if (!data) return {}
  const stats = data.stats || data
  if (!stats.classes) return {}
  
  const result = {}
  Object.entries(stats.classes).forEach(([key, cls]) => {
    const classValue = parseInt(key)
    const area_m2 = cls.area_m2 || (cls.pixel_count ? cls.pixel_count * 100 : 0)
    result[classValue] = area_m2 / 1000000
  })
  return result
}

function getArea(data, pixelValue) {
  if (!data) return 0
  return data[pixelValue] || 0
}

function getTotalArea(data) {
  if (!data) return 0
  return Object.values(data).reduce((sum, val) => sum + val, 0)
}

async function loadData() {
  loading.value = true
  
  try {
    const prevYear = props.year === 2021 ? 2020 : 2021
    
    const [currData, prevData] = await Promise.all([
      getCachedStats(props.districtId, props.year),
      getCachedStats(props.districtId, prevYear)
    ])
    
    statsData.value = convertStats(currData)
    prevStatsData.value = convertStats(prevData)
  } catch (error) {
    console.error('❌ MetricCards数据加载失败:', error)
    statsData.value = null
    prevStatsData.value = null
  } finally {
    loading.value = false
  }
}

const metrics = computed(() => {
  if (!statsData.value) {
    return [
      { label: '建成区面积', value: '--', ratio: '--', color: '#fa0000', change: null },
      { label: '绿地率', value: '--', ratio: '--', color: '#22c55e', change: null },
      { label: '水体面积', value: '--', ratio: '--', color: '#0064c8', change: null },
      { label: '林地面积', value: '--', ratio: '--', color: '#006400', change: null }
    ]
  }

  const curr = statsData.value
  const prev = prevStatsData.value
  const currTotal = getTotalArea(curr)
  const prevTotal = getTotalArea(prev)

  const builtUp = getArea(curr, 50)
  const forest = getArea(curr, 10)
  const shrub = getArea(curr, 20)
  const grass = getArea(curr, 30)
  const wetland = getArea(curr, 90)
  const water = getArea(curr, 80)

  const greenArea = forest + shrub + grass + wetland
  const greenRatio = currTotal > 0 ? (greenArea / currTotal) * 100 : 0

  const prevBuiltUp = getArea(prev, 50)
  const prevGreenArea = prev ? (getArea(prev, 10) + getArea(prev, 20) + getArea(prev, 30) + getArea(prev, 90)) : 0
  const prevWater = getArea(prev, 80)
  const prevForest = getArea(prev, 10)
  const prevGreenRatio = prevTotal > 0 ? (prevGreenArea / prevTotal) * 100 : 0

  function calcChange(currVal, prevVal) {
    if (prevVal === 0) return null
    const diff = currVal - prevVal
    const pct = (diff / prevVal) * 100
    const sign = diff >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
  }

  function getChangeClass(currVal, prevVal) {
    if (prevVal === 0) return ''
    return currVal >= prevVal ? 'increase' : 'decrease'
  }

  return [
    {
      label: '建成区面积',
      value: `${builtUp.toFixed(1)} km²`,
      ratio: currTotal > 0 ? `占比 ${(builtUp / currTotal * 100).toFixed(1)}%` : '--',
      color: '#fa0000',
      change: calcChange(builtUp, prevBuiltUp),
      changeClass: getChangeClass(builtUp, prevBuiltUp)
    },
    {
      label: '绿地率',
      value: `${greenRatio.toFixed(1)}%`,
      ratio: `${greenArea.toFixed(1)} km²`,
      color: '#22c55e',
      change: calcChange(greenRatio, prevGreenRatio),
      changeClass: getChangeClass(greenRatio, prevGreenRatio)
    },
    {
      label: '水体面积',
      value: `${water.toFixed(1)} km²`,
      ratio: currTotal > 0 ? `占比 ${(water / currTotal * 100).toFixed(1)}%` : '--',
      color: '#0064c8',
      change: calcChange(water, prevWater),
      changeClass: getChangeClass(water, prevWater)
    },
    {
      label: '林地面积',
      value: `${forest.toFixed(1)} km²`,
      ratio: currTotal > 0 ? `占比 ${(forest / currTotal * 100).toFixed(1)}%` : '--',
      color: '#006400',
      change: calcChange(forest, prevForest),
      changeClass: getChangeClass(forest, prevForest)
    }
  ]
})

watch([() => props.districtId, () => props.year], () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.metric-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.metric-card {
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  transition: transform 0.2s, box-shadow 0.2s;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.metric-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 4px;
}

.metric-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}

.metric-ratio {
  font-size: 11px;
  color: #9ca3af;
  margin-bottom: 6px;
}

.metric-change {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
}

.metric-change.increase {
  color: #16a34a;
  background: #dcfce7;
}

.metric-change.decrease {
  color: #dc2626;
  background: #fee2e2;
}
</style>
