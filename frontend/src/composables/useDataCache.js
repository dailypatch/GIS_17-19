import { ref } from 'vue'
import { getStats } from '../api/index'

const cache = ref({})
const pendingRequests = ref({})

export function useDataCache() {
  function getCacheKey(districtId, year) {
    return `stats_${districtId}_${year}`
  }

  async function getCachedStats(districtId, year) {
    const key = getCacheKey(districtId, year)
    
    if (cache.value[key]) {
      return cache.value[key]
    }
    
    if (pendingRequests.value[key]) {
      return await pendingRequests.value[key]
    }
    
    const promise = getStats(districtId, year)
      .then(data => {
        cache.value[key] = data
        return data
      })
      .catch(err => {
        console.error('❌ 数据缓存请求失败:', err)
        throw err
      })
      .finally(() => {
        delete pendingRequests.value[key]
      })
    
    pendingRequests.value[key] = promise
    return await promise
  }

  function clearCache() {
    cache.value = {}
    pendingRequests.value = {}
  }

  function clearDistrictCache(districtId) {
    Object.keys(cache.value).forEach(key => {
      if (key.startsWith(`stats_${districtId}_`)) {
        delete cache.value[key]
      }
    })
  }

  function getCacheStats() {
    return {
      size: Object.keys(cache.value).length,
      keys: Object.keys(cache.value)
    }
  }

  return {
    getCachedStats,
    clearCache,
    clearDistrictCache,
    getCacheStats
  }
}
