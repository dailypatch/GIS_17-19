import { getStats } from '../api/index'
import { CLASS_MAP, CLASS_ORDER } from '../config/colorMap'

export const DISTRICT_MAP = {
  0: '全市',
  1: '芙蓉区',
  2: '天心区',
  3: '岳麓区',
  4: '开福区',
  5: '雨花区',
  6: '望城区',
  7: '长沙县',
  8: '浏阳市',
  9: '宁乡市'
}

export { CLASS_MAP, CLASS_ORDER }

export const DISTRICT_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316'
]

export async function loadStatsData(year) {
  try {
    const result = {}
    const districtIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    
    const promises = districtIds.map(async (districtId) => {
      try {
        const data = await getStats(districtId, year)
        
        const classes = {}
        const stats = data && data.stats ? data.stats : data
        if (stats && stats.classes) {
          Object.entries(stats.classes).forEach(([key, cls]) => {
            const classValue = parseInt(key)
            if (CLASS_ORDER.includes(classValue)) {
              const area_m2 = cls.area_m2 || (cls.pixel_count ? cls.pixel_count * 100 : 0)
              const area_sqkm = area_m2 / 1000000
              classes[classValue] = {
                pixel_value: classValue,
                area_sqkm: parseFloat(area_sqkm.toFixed(4)),
                area_m2: area_m2,
                pixel_count: cls.pixel_count || 0
              }
            }
          })
        }
        
        result[districtId] = {
          district_id: districtId,
          district_name: DISTRICT_MAP[districtId],
          classes
        }
        
        return true
      } catch (error) {
        console.warn(`⚠️ API加载${year}年${DISTRICT_MAP[districtId]}数据异常:`, error.message)
        return null
      }
    })
    
    await Promise.all(promises)
    
    const hasData = Object.values(result).some(d => d && d.classes && Object.keys(d.classes).length > 0)
    
    if (!hasData) {
      console.error('❌ API未加载到任何统计数据')
      return null
    }
    
    return result
  } catch (error) {
    console.error('❌ API统计数据加载失败:', error)
    return null
  }
}

export function aggregateCityData(statsData) {
  if (!statsData) return {}
  
  const result = {}
  
  CLASS_ORDER.forEach(classValue => {
    result[classValue] = { pixel_value: classValue, area_sqkm: 0, area_m2: 0, pixel_count: 0 }
  })
  
  let totalArea = 0
  
  for (let i = 1; i <= 9; i++) {
    const districtData = statsData[i]
    if (districtData && districtData.classes) {
      Object.entries(districtData.classes).forEach(([key, cls]) => {
        const classValue = parseInt(key)
        if (CLASS_ORDER.includes(classValue)) {
          result[classValue].area_sqkm += cls.area_sqkm || 0
          result[classValue].area_m2 += cls.area_m2 || 0
          result[classValue].pixel_count += cls.pixel_count || 0
          totalArea += cls.area_sqkm || 0
        }
      })
    }
  }
  
  CLASS_ORDER.forEach(classValue => {
    result[classValue].area_sqkm = parseFloat(result[classValue].area_sqkm.toFixed(4))
    result[classValue].ratio = totalArea > 0 ? parseFloat(((result[classValue].area_sqkm / totalArea) * 100).toFixed(2)) : 0
  })
  
  return {
    district_id: 0,
    district_name: '全市',
    classes: result
  }
}

export function getDistrictStats(statsData, districtId) {
  if (!statsData) return null
  
  if (districtId === 0) {
    return aggregateCityData(statsData)
  }
  
  return statsData[districtId] || null
}

export function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  
  return '#' + (0x1000000 +
    (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1)
}

export function formatPercent(value) {
  if (value === Infinity) return '∞'
  if (value === -Infinity) return '-∞'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function getTopDistricts(statsData, classValue, limit = 3) {
  if (!statsData) return []
  
  const districts = []
  
  for (let i = 1; i <= 9; i++) {
    const data = statsData[i]
    if (data && data.classes) {
      const cls = data.classes[classValue]
      if (cls) {
        districts.push({
          id: i,
          name: DISTRICT_MAP[i],
          area: cls.area_sqkm
        })
      }
    }
  }
  
  return districts.sort((a, b) => b.area - a.area).slice(0, limit)
}

export function getDistrictClassData(statsData, districtIds) {
  if (!statsData) return []
  
  return districtIds.map(id => {
    const data = statsData[id]
    const classes = {}
    
    CLASS_ORDER.forEach(classValue => {
      const cls = data?.classes?.[classValue]
      classes[classValue] = cls ? cls.area_sqkm : 0
    })
    
    return {
      id,
      name: DISTRICT_MAP[id],
      classes
    }
  })
}

export function generateHeatmapData(statsData) {
  if (!statsData) return []
  
  const result = []
  
  CLASS_ORDER.forEach((classValue, yIndex) => {
    const districtIds = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    
    districtIds.forEach((districtId, xIndex) => {
      const data = statsData[districtId]
      const cls = data?.classes?.[classValue]
      const area = cls ? cls.area_sqkm : 0
      
      result.push([xIndex, yIndex, area])
    })
  })
  
  return result
}
