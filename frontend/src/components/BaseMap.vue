<template>
  <div id="map-container" ref="mapContainer">
    <div v-if="mapLoading" class="map-loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ loadingText }}</div>
      <div v-if="loadingProgress > 0" class="loading-progress-bar">
        <div class="loading-progress-fill" :style="{ width: loadingProgress + '%' }"></div>
      </div>
      <div v-if="loadingProgress > 0" class="loading-progress-text">{{ loadingProgress }}%</div>
    </div>
    <div v-if="showCoords && mouseCoords" class="coords-display">
      {{ mouseCoords.lat.toFixed(6) }}, {{ mouseCoords.lng.toFixed(6) }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch, reactive, onUnmounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fromArrayBuffer } from 'geotiff'
import { COLOR_MAP } from '../config/colorMap'
import { getDistrictEnglishName, getDistrictChineseName, getCOGFileName, getBoundaryFileName } from '../config/districtMap'
import { getDistrictBounds } from '../api/index'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
})

const props = defineProps({
  year: {
    type: Number,
    default: 2021
  },
  districtId: {
    type: Number,
    default: 0
  },
  filterValue: {
    type: [Number, null],
    default: null
  },
  highlightValue: {
    type: [Number, null],
    default: null
  },
  visibleMap: {
    type: Object,
    default: () => ({})
  },
  isPickMode: {
    type: Boolean,
    default: false
  },
  cogVisible: {
    type: Boolean,
    default: true
  },
  labelsVisible: {
    type: Boolean,
    default: true
  },
  districtBoundaryVisible: {
    type: Boolean,
    default: true
  },
  cogOpacity: {
    type: Number,
    default: 0.85
  }
})

const mapContainer = ref(null)
const mapLoading = ref(false)
const loadingText = ref('正在加载数据...')
const loadingProgress = ref(0)
const currentYear = ref(2021)
const showCoords = ref(false)
const mouseCoords = reactive({ lat: 0, lng: 0 })
const TIANDITU_KEY = import.meta.env.VITE_TIANDITU_KEY || 'ce8fcee047e1c8e4b40daaf712dbe934'
const CHANGSHA_CENTER = [28.15, 112.95]
const CITY_BOUNDS = L.latLngBounds([[27.8, 112.6], [28.5, 113.4]])

let map = null
let cogLayer = null
let nextCogLayer = null
let highlightLayer = null
let districtBoundaryLayer = null
let highlightAnimationTimer = null
let fadeAnimationFrame = null
let originalPixelValues = null
let nextPixelValues = null
let imageBounds = null
let imageWidth = 0
let imageHeight = 0
let geoOriginX = 0
let geoOriginY = 0
let geoPixelWidth = 0
let geoPixelHeight = 0
let vectorLayer = null
let labelLayer = null
let renderWorker = null

const dataCache = {}
const layerCache = {}

const emit = defineEmits(['update-existing-values'])

function countExistingValues(pixelValues) {
  const counts = {}
  for (let i = 0; i < pixelValues.length; i++) {
    const val = pixelValues[i]
    const intVal = Math.round(val)
    if (val !== 0 && val !== undefined && val !== null && !isNaN(val)) {
      counts[intVal] = (counts[intVal] || 0) + 1
    }
  }
  const existingValues = Object.keys(counts).map(Number).sort((a, b) => a - b)
  console.log('📊 实际存在的类别:', existingValues)
  emit('update-existing-values', existingValues)
  return existingValues
}

function initWorker() {
  if (renderWorker) {
    renderWorker.terminate()
  }
  renderWorker = new Worker(new URL('../workers/renderWorker.js', import.meta.url))
  
  renderWorker.onmessage = function(e) {
    const { type, blob, width, height, targetLayer } = e.data
    
    if (type === 'renderComplete') {
      const url = URL.createObjectURL(blob)
      const isNextLayer = targetLayer === 'next'
      
      if (isNextLayer) {
        if (nextCogLayer) {
          map.removeLayer(nextCogLayer)
          nextCogLayer = null
        }
        nextCogLayer = L.imageOverlay(url, imageBounds, {
          opacity: 0,
          interactive: false
        }).addTo(map)
        console.log('✅ 下一层COG图层预加载完成')
      } else {
        if (cogLayer) {
          map.removeLayer(cogLayer)
          cogLayer = null
        }
        cogLayer = L.imageOverlay(url, imageBounds, {
          opacity: props.cogVisible ? props.cogOpacity : 0,
          interactive: false
        }).addTo(map)
        console.log('✅ COG图层更新完成 (Web Worker)')
      }
    } else if (type === 'highlightComplete') {
      const url = URL.createObjectURL(blob)
      if (highlightLayer) {
        map.removeLayer(highlightLayer)
        highlightLayer = null
      }
      highlightLayer = L.imageOverlay(url, imageBounds, {
        opacity: 0.3,
        interactive: false,
        zIndex: 1000
      }).addTo(map)
      startBreathingAnimation()
      console.log('✅ 高亮图层更新完成 (Web Worker)')
    }
  }
  
  renderWorker.onerror = function(error) {
    console.error('❌ Worker错误:', error)
    renderWorker = null
  }
}

function updateCOGLayer(filterValue, pixelData = originalPixelValues, targetLayer = 'current') {
  if (!pixelData || !imageBounds) {
    console.log('⚠️ 原始数据未加载，跳过更新')
    return
  }

  console.log('🔍 更新COG图层，筛选值:', filterValue, '目标图层:', targetLayer)

  if (!renderWorker) {
    initWorker()
  }

  renderWorker.postMessage({
    type: 'render',
    targetLayer,
    data: {
      pixelValues: pixelData,
      imageWidth,
      imageHeight,
      filterValue,
      visibleMap: { ...props.visibleMap }
    }
  })
}

function stopFadeAnimation() {
  if (fadeAnimationFrame) {
    cancelAnimationFrame(fadeAnimationFrame)
    fadeAnimationFrame = null
  }
}

function fadeBetweenLayers(duration = 1000) {
  return new Promise((resolve) => {
    stopFadeAnimation()
    
    if (!cogLayer || !nextCogLayer) {
      console.log('⚠️ 图层不完整，跳过淡入淡出')
      resolve()
      return
    }
    
    const startTime = performance.now()
    const targetOpacity = props.cogVisible ? props.cogOpacity : 0
    
    function animate(currentTime) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      const easeProgress = 1 - Math.pow(1 - progress, 3)
      
      const currentOpacity = targetOpacity * (1 - easeProgress)
      const nextOpacity = targetOpacity * easeProgress
      
      cogLayer.setOpacity(currentOpacity)
      nextCogLayer.setOpacity(nextOpacity)
      
      if (progress < 1) {
        fadeAnimationFrame = requestAnimationFrame(animate)
      } else {
        if (cogLayer) {
          map.removeLayer(cogLayer)
          cogLayer = null
        }
        cogLayer = nextCogLayer
        nextCogLayer = null
        originalPixelValues = nextPixelValues
        nextPixelValues = null
        fadeAnimationFrame = null
        console.log('✅ 淡入淡出动画完成')
        resolve()
      }
    }
    
    fadeAnimationFrame = requestAnimationFrame(animate)
    console.log('🎬 开始淡入淡出过渡，时长:', duration, 'ms')
  })
}

async function preloadYearData(year, districtId) {
  console.log('📦 预加载数据，年份:', year, '区县:', districtId)
  
  const cacheKey = `${year}_${districtId}`
  
  if (dataCache[cacheKey]) {
    console.log('📦 使用缓存数据:', cacheKey)
    nextPixelValues = dataCache[cacheKey].pixelValues
    imageWidth = dataCache[cacheKey].imageWidth
    imageHeight = dataCache[cacheKey].imageHeight
    geoOriginX = dataCache[cacheKey].geoOriginX
    geoOriginY = dataCache[cacheKey].geoOriginY
    geoPixelWidth = dataCache[cacheKey].geoPixelWidth
    geoPixelHeight = dataCache[cacheKey].geoPixelHeight
    imageBounds = dataCache[cacheKey].imageBounds
    
    return new Promise((resolve) => {
      updateCOGLayer(props.filterValue, nextPixelValues, 'next')
      setTimeout(resolve, 300)
    })
  }
  
  try {
    const COG_URL = buildCOGPath(year, districtId)
    console.log('🔄 尝试预加载COG:', COG_URL)
    
    const response = await fetch(COG_URL)
    if (!response.ok) {
      throw new Error(`COG文件不存在: ${response.status}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const tiff = await fromArrayBuffer(arrayBuffer)
    const image = await tiff.getImage()
    
    const fileDirectory = image.fileDirectory
    imageWidth = Math.round(Number(fileDirectory.ImageWidth)) || 1248
    imageHeight = Math.round(Number(fileDirectory.ImageLength)) || 1765
    
    const tiepoint = fileDirectory.ModelTiepoint
    const pixelScale = fileDirectory.ModelPixelScale
    
    geoOriginX = Number(tiepoint[3])
    geoOriginY = Number(tiepoint[4])
    geoPixelWidth = Number(pixelScale[0])
    geoPixelHeight = Number(pixelScale[1])
    
    const xmin = geoOriginX
    const ymax = geoOriginY
    const xmax = geoOriginX + imageWidth * geoPixelWidth
    const ymin = geoOriginY - imageHeight * geoPixelHeight
    
    imageBounds = L.latLngBounds([[ymin, xmin], [ymax, xmax]])
    
    const data = await image.readRasters()
    nextPixelValues = data[0]
    
    dataCache[cacheKey] = {
      pixelValues: nextPixelValues,
      imageWidth,
      imageHeight,
      geoOriginX,
      geoOriginY,
      geoPixelWidth,
      geoPixelHeight,
      imageBounds
    }
    
    countExistingValues(nextPixelValues)
    
    return new Promise((resolve) => {
      updateCOGLayer(props.filterValue, nextPixelValues, 'next')
      setTimeout(resolve, 300)
    })
    
  } catch (error) {
    console.error('❌ 预加载失败:', error)
    throw error
  }
}

async function animateToYear(newYear, districtId = props.districtId, duration = 1000) {
  console.log('🎯 动画切换到年份:', newYear)
  
  if (newYear === currentYear.value) {
    console.log('⚠️ 已是目标年份，跳过')
    return
  }
  
  try {
    await preloadYearData(newYear, districtId)
    
    if (!nextCogLayer) {
      console.log('⚠️ 预加载图层未创建成功，直接切换')
      currentYear.value = newYear
      await loadCOGLayer(newYear, districtId)
      return
    }
    
    await fadeBetweenLayers(duration)
    
    currentYear.value = newYear
    
  } catch (error) {
    console.error('❌ 动画切换失败:', error)
    currentYear.value = newYear
    await loadCOGLayer(newYear, districtId)
  }
}

function createHighlightLayer(highlightValue) {
  if (!originalPixelValues || !imageBounds) {
    console.log('⚠️ 原始数据未加载，跳过高亮图层创建')
    return
  }

  console.log('✨ 创建高亮图层，高亮值:', highlightValue)

  if (!renderWorker) {
    initWorker()
  }

  renderWorker.postMessage({
    type: 'renderHighlight',
    data: {
      pixelValues: originalPixelValues,
      imageWidth,
      imageHeight,
      highlightValue
    }
  })
}

function startBreathingAnimation() {
  if (highlightAnimationTimer) {
    clearInterval(highlightAnimationTimer)
  }

  let time = 0
  const period = 1500
  const interval = 50

  highlightAnimationTimer = setInterval(() => {
    time += interval
    const opacity = 0.15 + 0.35 * (1 - Math.cos((time / period) * 2 * Math.PI))

    if (highlightLayer) {
      highlightLayer.setOpacity(opacity)
    }

    if (time >= period * 10) {
      time = 0
    }
  }, interval)
}

function stopHighlightAnimation() {
  if (highlightAnimationTimer) {
    clearInterval(highlightAnimationTimer)
    highlightAnimationTimer = null
  }

  if (highlightLayer) {
    map.removeLayer(highlightLayer)
    highlightLayer = null
  }
}

function handleMapClick(e) {
  const { lat, lng } = e.latlng
  
  console.log('📍 点击查询，坐标:', { lat, lng }, '年份:', currentYear.value, '区县:', props.districtId)
  
  if (!imageBounds || !imageBounds.contains(e.latlng)) {
    console.log('📍 点击位置不在地图范围内')
    return
  }

  if (!originalPixelValues) {
    console.log('⚠️ 原始数据未加载，无法进行本地查询')
    return
  }
  
  const col = Math.floor((lng - geoOriginX) / geoPixelWidth)
  const row = Math.floor((geoOriginY - lat) / geoPixelHeight)
  
  if (col < 0 || col >= imageWidth || row < 0 || row >= imageHeight) {
    console.log('📍 像素坐标超出范围:', col, row)
    return
  }
  
  const pixelIndex = row * imageWidth + col
  const pixelValue = originalPixelValues[pixelIndex]
  const intValue = Math.round(pixelValue)
  
  console.log('📍 本地查询结果:', { lat, lng, col, row, pixelValue: intValue })
  
  let popupContent = ''
  
  if (pixelValue === 0 || pixelValue === undefined || pixelValue === null || isNaN(pixelValue)) {
    popupContent = `
      <div class="popup-wrapper" style="border-left: 4px solid #cccccc">
        <div class="popup-header">
          <span class="popup-title">地表覆盖查询结果</span>
        </div>
        <div class="popup-body">
          <div class="popup-message">该位置无地表覆盖数据</div>
          <div class="popup-coords">坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        </div>
      </div>
    `
  } else if (COLOR_MAP[intValue]) {
    const category = COLOR_MAP[intValue]
    popupContent = `
      <div class="popup-wrapper" style="border-left: 4px solid ${category.color}">
        <div class="popup-header">
          <span class="popup-title">地表覆盖查询结果</span>
        </div>
        <div class="popup-body">
          <div class="popup-category">
            <span class="popup-color" style="background-color: ${category.color}"></span>
            <span class="popup-name">${category.name}</span>
          </div>
          <div class="popup-info">
            <span class="popup-label">像素值:</span>
            <span class="popup-value">${intValue}</span>
          </div>
          <div class="popup-info">
            <span class="popup-label">坐标:</span>
            <span class="popup-value">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
          </div>
        </div>
      </div>
    `
  } else {
    popupContent = `
      <div class="popup-wrapper" style="border-left: 4px solid #9ca3af">
        <div class="popup-header">
          <span class="popup-title">地表覆盖查询结果</span>
        </div>
        <div class="popup-body">
          <div class="popup-message">未知类别 (像素值: ${intValue})</div>
          <div class="popup-coords">坐标: ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
        </div>
      </div>
    `
  }

  L.popup({
    maxWidth: 280,
    className: 'custom-popup',
    closeButton: true
  })
  .setLatLng(e.latlng)
  .setContent(popupContent)
  .openOn(map)
}

function handleMouseMove(e) {
  if (props.isPickMode) {
    mouseCoords.lat = e.latlng.lat
    mouseCoords.lng = e.latlng.lng
    showCoords.value = true
  }
}

function resetView() {
  if (!map) return
  map.setView(CHANGSHA_CENTER, 12)
  console.log('🗺 视图已重置')
}

async function fetchDistrictBounds(districtId) {
  try {
    console.log(`📍 正在获取区县边界，ID: ${districtId}`)
    const geojson = await getDistrictBounds(districtId)
    console.log(`✅ 获取区县边界成功: ${getDistrictChineseName(districtId)}`)
    return geojson
  } catch (error) {
    console.error(`📍 获取区县边界失败: ${error.message}`)
    return null
  }
}

function fitDistrictBounds(geojson) {
  if (!geojson || !map) return
  
  try {
    const layer = L.geoJSON(geojson)
    const bounds = layer.getBounds()
    map.fitBounds(bounds, { padding: [30, 30] })
    console.log('📍 地图已跳转到区县范围')
  } catch (error) {
    console.error('📍 地图跳转失败:', error)
    map.fitBounds(CITY_BOUNDS, { padding: [20, 20] })
  }
}

function buildCOGPath(year, districtId) {
  const fileName = getCOGFileName(districtId, year)
  return `${import.meta.env.BASE_URL}data/district_cogs/${year}_cog/${fileName}`
}

async function loadCOGLayer(year = 2021, districtId = 0) {
  mapLoading.value = true
  loadingProgress.value = 0
  currentYear.value = year
  
  const districtName = getDistrictChineseName(districtId)
  loadingText.value = `正在加载 ${year}年 ${districtName} 数据...`
  
  console.log(`📅 开始加载数据，年份: ${year}，区县: ${districtName} (ID: ${districtId})`)
  
  stopHighlightAnimation()
  
  if (cogLayer) {
    map.removeLayer(cogLayer)
    cogLayer = null
  }
  
  if (highlightLayer) {
    map.removeLayer(highlightLayer)
    highlightLayer = null
  }
  
  originalPixelValues = null
  imageBounds = null
  
  const cacheKey = `${year}_${districtId}`
  if (dataCache[cacheKey]) {
    console.log('📦 使用缓存数据:', cacheKey)
    loadingProgress.value = 100
    const cached = dataCache[cacheKey]
    originalPixelValues = cached.pixelValues
    imageWidth = cached.imageWidth
    imageHeight = cached.imageHeight
    geoOriginX = cached.geoOriginX
    geoOriginY = cached.geoOriginY
    geoPixelWidth = cached.geoPixelWidth
    geoPixelHeight = cached.geoPixelHeight
    imageBounds = cached.imageBounds
    
    updateCOGLayer(props.filterValue)
    map.fitBounds(imageBounds, { padding: [20, 20] })
    
    setTimeout(() => {
      mapLoading.value = false
    }, 200)
    return
  }
  
  try {
    loadingProgress.value = 10
    const COG_URL = buildCOGPath(year, districtId)
    console.log('🔄 尝试加载COG:', COG_URL)
    
    let response = await fetch(COG_URL)
    
    if (!response.ok) {
      console.log(`⚠️ COG文件不存在(${response.status})`)
      throw new Error(`COG文件加载失败: ${response.status}`)
    }
    
    loadingProgress.value = 30
    const arrayBuffer = await response.arrayBuffer()
    console.log('✅ 获取到文件数据，大小:', arrayBuffer.byteLength, 'bytes')
    
    loadingProgress.value = 50
    const tiff = await fromArrayBuffer(arrayBuffer)
    const image = await tiff.getImage()
    console.log('✅ GeoTIFF 解析成功')
    
    loadingProgress.value = 60
    const fileDirectory = image.fileDirectory
    imageWidth = Math.round(Number(fileDirectory.ImageWidth)) || 1248
    imageHeight = Math.round(Number(fileDirectory.ImageLength)) || 1765
    
    console.log('📊 图像尺寸:', imageWidth, 'x', imageHeight)
    
    const tiepoint = fileDirectory.ModelTiepoint
    const pixelScale = fileDirectory.ModelPixelScale
    
    const originX = Number(tiepoint[3])
    const originY = Number(tiepoint[4])
    const pixelWidth = Number(pixelScale[0])
    const pixelHeight = Number(pixelScale[1])
    
    geoOriginX = originX
    geoOriginY = originY
    geoPixelWidth = pixelWidth
    geoPixelHeight = pixelHeight
    
    const xmin = originX
    const ymax = originY
    const xmax = originX + imageWidth * pixelWidth
    const ymin = originY - imageHeight * pixelHeight
    
    console.log('📊 地理范围:')
    console.log('   - 左上角:', [xmin, ymax])
    console.log('   - 右下角:', [xmax, ymin])
    
    loadingProgress.value = 80
    const data = await image.readRasters()
    originalPixelValues = data[0]
    console.log('✅ 像素数据读取成功，长度:', originalPixelValues.length)
    
    countExistingValues(originalPixelValues)
    
    imageBounds = L.latLngBounds([[ymin, xmin], [ymax, xmax]])
    
    dataCache[cacheKey] = {
      pixelValues: originalPixelValues,
      imageWidth,
      imageHeight,
      geoOriginX,
      geoOriginY,
      geoPixelWidth,
      geoPixelHeight,
      imageBounds
    }
    
    loadingProgress.value = 90
    updateCOGLayer(props.filterValue)
    
    map.fitBounds(imageBounds, { padding: [20, 20] })
    
    loadingProgress.value = 100
    console.log(`✅ ${year}年${districtName}数据加载完成`)
    
  } catch (error) {
    console.error('❌ COG加载失败:', error)
    loadingText.value = `数据加载失败: ${error.message}`
  } finally {
    setTimeout(() => {
      mapLoading.value = false
    }, 500)
  }
}

async function handleDistrictChange(newDistrictId) {
  const districtName = getDistrictChineseName(newDistrictId)
  console.log('📍 区县切换:', districtName)
  
  if (newDistrictId !== 0) {
    const geojson = await fetchDistrictBounds(newDistrictId)
    if (geojson) {
      fitDistrictBounds(geojson)
    }
  } else {
    map.fitBounds(CITY_BOUNDS, { padding: [20, 20] })
  }
  
  await loadCOGLayer(currentYear.value, newDistrictId)
}

watch(() => props.filterValue, (newValue) => {
  console.log('🔍 filterValue变化:', newValue)
  updateCOGLayer(newValue)
})

watch(() => props.highlightValue, (newValue) => {
  console.log('✨ highlightValue变化:', newValue)
  if (newValue !== null) {
    createHighlightLayer(newValue)
  } else {
    stopHighlightAnimation()
  }
})

watch(() => props.year, (newYear) => {
  console.log('📅 年份切换:', newYear)
  loadCOGLayer(newYear, props.districtId)
})

watch(() => props.districtId, (newDistrictId) => {
  handleDistrictChange(newDistrictId)
})

watch(() => props.visibleMap, () => {
  console.log('👁 visibleMap变化')
  updateCOGLayer(props.filterValue)
}, { deep: true })

watch(() => props.isPickMode, (newValue) => {
  console.log('📍 坐标拾取模式:', newValue ? '开启' : '关闭')
  showCoords.value = newValue
})

watch(() => props.cogVisible, (newValue) => {
  if (cogLayer) {
    cogLayer.setOpacity(newValue ? props.cogOpacity : 0)
  }
  console.log('🎨 分类图层显隐:', newValue ? '显示' : '隐藏')
})

watch(() => props.labelsVisible, (newValue) => {
  if (labelLayer) {
    labelLayer.setOpacity(newValue ? 1 : 0)
  }
  console.log('🏷 地名注记显隐:', newValue ? '显示' : '隐藏')
})

watch(() => props.districtBoundaryVisible, (newValue) => {
  if (districtBoundaryLayer) {
    if (newValue) {
      map.addLayer(districtBoundaryLayer)
    } else {
      map.removeLayer(districtBoundaryLayer)
    }
  }
  console.log('📍 区县边界显隐:', newValue ? '显示' : '隐藏')
})

watch(() => props.cogOpacity, (newValue) => {
  if (cogLayer && props.cogVisible) {
    cogLayer.setOpacity(newValue)
  }
  console.log('🎨 分类图层透明度:', newValue)
})

onMounted(async () => {
  await nextTick()
  
  if (!mapContainer.value) {
    console.error('❌ 地图容器不存在')
    return
  }

  map = L.map(mapContainer.value, {
    center: CHANGSHA_CENTER,
    zoom: 12,
    zoomControl: true,
    crs: L.CRS.EPSG3857
  })

  vectorLayer = L.tileLayer(
    `https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&x={x}&y={y}&l={z}&tk=${TIANDITU_KEY}`,
    {
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      maxZoom: 18,
      minZoom: 1,
      attribution: '&copy; 天地图',
      crossOrigin: 'anonymous'
    }
  ).addTo(map)

  labelLayer = L.tileLayer(
    `https://t{s}.tianditu.gov.cn/DataServer?T=cva_w&x={x}&y={y}&l={z}&tk=${TIANDITU_KEY}`,
    {
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      maxZoom: 18,
      minZoom: 1,
      attribution: '&copy; 天地图',
      crossOrigin: 'anonymous'
    }
  ).addTo(map)

  initWorker()
  await loadCOGLayer(2021, 0)
  await loadDistrictBoundaryLayer()

  map.on('click', handleMapClick)
  map.on('mousemove', handleMouseMove)

  window.__map = map
  window.__cogLayer = cogLayer
  
  console.log('✅ 天地图底图加载完成')
  console.log('📍 当前中心:', map.getCenter())
  console.log('🔍 当前缩放:', map.getZoom())
})

onUnmounted(() => {
  if (renderWorker) {
    renderWorker.terminate()
    renderWorker = null
  }
  if (highlightAnimationTimer) {
    clearInterval(highlightAnimationTimer)
  }
  stopFadeAnimation()
})

async function loadDistrictBoundaryLayer() {
  console.log('📍 加载区县边界图层')
  
  try {
    const geojson = await fetchDistrictBounds(0)
    
    if (geojson) {
      districtBoundaryLayer = L.geoJSON(geojson, {
        style: {
          color: '#ef4444',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0
        }
      }).addTo(map)
      
      console.log('✅ 区县边界图层加载完成')
    } else {
      console.log('⚠️ 区县边界数据未加载')
    }
  } catch (error) {
    console.error('❌ 区县边界图层加载失败:', error)
  }
}

async function flyToDistrict(districtId) {
  console.log('📍 跳转到区县:', getDistrictChineseName(districtId), '(ID:', districtId + ')')
  
  if (districtId === 0) {
    map.fitBounds(CITY_BOUNDS, { padding: [20, 20] })
    return
  }
  
  const geojson = await fetchDistrictBounds(districtId)
  if (geojson) {
    fitDistrictBounds(geojson)
  }
}

defineExpose({
  loadCOGLayer,
  resetView,
  animateToYear,
  flyToDistrict
})
</script>

<style scoped>
#map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  pointer-events: none;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #374151;
  font-weight: 500;
  margin-bottom: 12px;
}

.loading-progress-bar {
  width: 200px;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.loading-progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.loading-progress-text {
  font-size: 12px;
  color: #6b7280;
}

.coords-display {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-family: monospace;
  z-index: 1000;
  pointer-events: none;
}
</style>