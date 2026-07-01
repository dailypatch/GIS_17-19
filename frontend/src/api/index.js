/**
 * API 层 —— 后端优先 + 本地文件自动降级
 */
import axios from 'axios'
import {
  DISTRICT_LIST,
  getStatsFileName,
  getBoundaryFileName,
  getDistrictChineseName,
} from '../config/districtMap'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const USE_API = import.meta.env.VITE_USE_API !== 'false'

const http = axios.create({ baseURL: API_BASE, timeout: 10000 })

// ==================== 区县列表 ====================
export async function getDistricts() {
  if (USE_API) {
    try {
      const res = await http.get('/api/districts')
      if (res.data?.code === 0 && res.data?.data?.length) {
        return res.data.data
      }
    } catch (e) {
      console.warn('[API] 后端 /api/districts 不可用，降级本地')
    }
  }
  return DISTRICT_LIST
}

// ==================== 统计数据 ====================
export async function getStats(districtId, year) {
  if (USE_API) {
    try {
      const res = await http.get('/api/stats', {
        params: { district_id: districtId, year },
      })
      if (res.data?.code === 0 && res.data?.data) {
        return enrichStats(res.data.data, districtId, year)
      }
    } catch (e) {
      console.warn(`[API] 后端 /api/stats 不可用，降级本地文件`)
    }
  }
  // 降级：读取本地 JSON
  const fileName = getStatsFileName(districtId, year)
  const filePath = `${import.meta.env.BASE_URL}data/district_stats/stats_${year}/${fileName}`
  const response = await fetch(filePath)
  if (!response.ok) throw new Error(`统计数据不存在: ${filePath}`)
  const raw = await response.json()
  return enrichStats(raw.stats || raw.data || raw, districtId, year)
}

/** 补全后端可能缺失的字段，兼容多种输入格式 */
function enrichStats(data, districtId, year) {
  // 统一转为数组格式
  let rawClasses = data.classes || []
  if (!Array.isArray(rawClasses)) {
    // 本地 JSON 格式：{ "10": { area_m2, pixel_count }, "50": { ... } }
    rawClasses = Object.entries(rawClasses).map(([key, val]) => ({
      pixel_value: parseInt(key),
      class_name: val.class_name || '',
      area_sqkm: (val.area_m2 || 0) / 1_000_000,
      pixel_count: val.pixel_count || 0,
    }))
  }

  const total = rawClasses.reduce((s, c) => s + (c.area_sqkm || 0), 0)

  // 1. 数组格式（新组件使用）
  const classesArray = rawClasses.map((c) => ({
    pixel_value: c.pixel_value,
    class_name: c.class_name,
    area_sqkm: c.area_sqkm || 0,
    pixel_count: c.pixel_count || 0,
    ratio: c.ratio ?? (total > 0 ? +((c.area_sqkm / total) * 100).toFixed(2) : 0),
  }))

  // 2. 对象格式（StatsPanel/MetricCards 兼容，key=pixel_value）
  const classesObj = {}
  for (const c of classesArray) {
    classesObj[String(c.pixel_value)] = {
      pixel_count: c.pixel_count,
      area_m2: c.area_sqkm * 1_000_000,
      area_sqkm: c.area_sqkm,
      class_name: c.class_name,
    }
  }

  return {
    district_id: data.district_id ?? districtId,
    district_name: data.district_name || getDistrictChineseName(districtId),
    year: data.year ?? year,
    total_area_sqkm: data.total_area_sqkm || +total.toFixed(2),
    classes: classesArray,
    stats: {
      district: data.district_name || getDistrictChineseName(districtId),
      classes: classesObj,
    },
  }
}

// ==================== 区县边界 ====================
export async function getDistrictBounds(districtId) {
  if (USE_API) {
    try {
      const res = await http.get(`/api/districts/${districtId}/bounds`)
      if (res.data?.code === 0 && res.data?.data) return res.data.data
    } catch (e) {
      console.warn('[API] 后端 bounds 不可用，降级本地')
    }
  }
  const fileName = getBoundaryFileName(districtId)
  const filePath =
    districtId === 0
      ? `${import.meta.env.BASE_URL}data/boundary/${fileName}`
      : `${import.meta.env.BASE_URL}data/boundary/split_districts/${fileName}`
  const response = await fetch(filePath)
  if (!response.ok) throw new Error(`边界数据不存在: ${filePath}`)
  return response.json()
}

// ==================== 点选查询 ====================
export async function queryPoint(lat, lng) {
  if (USE_API) {
    try {
      const res = await http.get('/api/query', { params: { lat, lng } })
      if (res.data?.code === 0 && res.data?.data) return res.data.data
    } catch (e) {
      console.warn('[API] 后端 /api/query 不可用')
    }
  }
  return { pixel_value: 0, category: null }
}
