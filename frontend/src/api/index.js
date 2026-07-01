/**
 * API 层 —— 后端优先 + 本地文件自动降级
 *
 * 环境变量：
 *   VITE_API_BASE  - 后端地址，默认空（同域代理）
 *   VITE_USE_API   - 是否启用后端，默认 true
 */
import axios from 'axios'
import {
  DISTRICT_LIST,
  getStatsFileName,
  getBoundaryFileName,
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

// ==================== 统计数据（核心） ====================
export async function getStats(districtId, year) {
  if (USE_API) {
    try {
      const res = await http.get('/api/stats', {
        params: { district_id: districtId, year },
      })
      if (res.data?.code === 0 && res.data?.data) {
        return res.data.data
      }
    } catch (e) {
      console.warn(`[API] 后端 /api/stats 不可用，降级本地文件`)
    }
  }
  // 降级：读取 public/data/ 下的 JSON 文件
  const fileName = getStatsFileName(districtId, year)
  const filePath = `${import.meta.env.BASE_URL}data/district_stats/stats_${year}/${fileName}`
  const response = await fetch(filePath)
  if (!response.ok) {
    throw new Error(`统计数据不存在: ${filePath}`)
  }
  return response.json()
}

// ==================== 区县边界 ====================
export async function getDistrictBounds(districtId) {
  if (USE_API) {
    try {
      const res = await http.get(`/api/districts/${districtId}/bounds`)
      if (res.data?.code === 0 && res.data?.data) {
        return res.data.data
      }
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
  if (!response.ok) {
    throw new Error(`边界数据不存在: ${filePath}`)
  }
  return response.json()
}

// ==================== 点选查询 ====================
export async function queryPoint(lat, lng) {
  if (USE_API) {
    try {
      const res = await http.get('/api/query', { params: { lat, lng } })
      if (res.data?.code === 0 && res.data?.data) {
        return res.data.data
      }
    } catch (e) {
      console.warn('[API] 后端 /api/query 不可用')
    }
  }
  return { pixel_value: 0, category: null }
}
