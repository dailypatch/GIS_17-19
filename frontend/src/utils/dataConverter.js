import { CLASS_ORDER, CLASS_MAP } from './comparisonHelpers'

export function convertApiStats(apiData, districtId, districtName) {
  if (!apiData) {
    console.warn('⚠️ API数据为空')
    return null
  }
  
  console.log(`[convertApiStats] 原始API数据结构:`, Object.keys(apiData))
  
  let stats = apiData
  if (apiData.stats) {
    stats = apiData.stats
  } else if (apiData.classes) {
    stats = apiData
  }
  
  if (!stats || !stats.classes) {
    console.warn('⚠️ 数据中没有classes字段，完整数据:', JSON.stringify(apiData))
    return null
  }
  
  const classes = {}
  
  Object.entries(stats.classes).forEach(([key, cls]) => {
    const classValue = parseInt(key)
    
    if (CLASS_ORDER.includes(classValue)) {
      const pixel_count = cls.pixel_count || 0
      const area_m2 = cls.area_m2 || (pixel_count * 100)
      const area_sqkm = area_m2 / 1000000
      
      classes[classValue] = {
        pixel_value: classValue,
        area_sqkm: parseFloat(area_sqkm.toFixed(4)),
        area_m2: parseFloat(area_m2.toFixed(2)),
        pixel_count: pixel_count
      }
    }
  })
  
  const result = {
    district_id: districtId,
    district_name: districtName,
    classes
  }
  
  console.log(`✅ 数据转换完成: ${districtName}, 地类数量: ${Object.keys(classes).length}`)
  
  return result
}

export function convertMultipleDistricts(apiResults, districtMap) {
  const result = {}
  
  apiResults.forEach(({ districtId, data }) => {
    if (data) {
      const converted = convertApiStats(data, districtId, districtMap[districtId])
      if (converted) {
        result[districtId] = converted
      }
    }
  })
  
  return result
}

export function calculateAreaChanges(data2020, data2021) {
  if (!data2020 || !data2021 || !data2020.classes || !data2021.classes) {
    console.warn('⚠️ 计算变化数据不完整')
    return []
  }
  
  const result = []
  
  CLASS_ORDER.forEach(classValue => {
    const area2020 = data2020.classes[classValue]?.area_sqkm || 0
    const area2021 = data2021.classes[classValue]?.area_sqkm || 0
    
    const diff = area2021 - area2020
    let rate = 0
    if (area2020 !== 0) {
      rate = parseFloat(((diff / area2020) * 100).toFixed(2))
    } else if (diff !== 0) {
      rate = diff > 0 ? Infinity : -Infinity
    }
    
    result.push({
      value: classValue,
      name: CLASS_MAP[classValue],
      area2020: parseFloat(area2020.toFixed(4)),
      area2021: parseFloat(area2021.toFixed(4)),
      diff: parseFloat(diff.toFixed(4)),
      rate
    })
  })
  
  return result
}

export function generateHeatmapData(statsData) {
  if (!statsData) {
    console.warn('⚠️ 热力图数据为空')
    return []
  }
  
  const result = []
  const districtIds = [1, 2, 3, 4, 5, 6, 7, 8, 9]
  
  CLASS_ORDER.forEach((classValue, yIndex) => {
    districtIds.forEach((districtId, xIndex) => {
      const districtData = statsData[districtId]
      const cls = districtData?.classes?.[classValue]
      const area = cls ? cls.area_sqkm : 0
      
      result.push([xIndex, yIndex, area])
    })
  })
  
  return result
}