import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { COLOR_MAP, CLASS_MAP, CLASS_ORDER } from '../config/colorMap'
import { useDataCache } from '../composables/useDataCache'

const { getCachedStats } = useDataCache()

export async function generateReport({
  districtName,
  year,
  districtId,
  statsData,
  mapElement,
  chartElement,
  temporalChartElement
}) {
  let statsData2020 = []
  let statsData2021 = []
  let changesData = []

  try {
    const [res2020, res2021] = await Promise.all([
      getCachedStats(districtId, 2020),
      getCachedStats(districtId, 2021)
    ])
    statsData2020 = parseApiStatsData(res2020)
    statsData2021 = parseApiStatsData(res2021)
    changesData = calculateChanges(statsData2020, statsData2021)
  } catch (err) {
    console.warn('⚠️ 获取时序数据失败，报告仅包含现状分析')
  }

  const currentStats = year === 2021 ? statsData2021 : statsData2020
  const metrics = calculateMetrics(currentStats)
  const changeMetrics = calculateChangeMetrics(changesData)

  const mapImage = await captureMapImage(mapElement)
  const chartImage = chartElement ? await captureElement(chartElement, { backgroundColor: '#ffffff' }) : null
  const temporalChartImage = temporalChartElement ? await captureElement(temporalChartElement, { backgroundColor: '#ffffff' }) : null

  const reportHtml = buildReportHtml({
    districtName,
    year,
    districtId,
    metrics,
    changeMetrics,
    statsData2020,
    statsData2021,
    changesData,
    mapImage,
    chartImage,
    temporalChartImage
  })

  const reportElement = createReportElement(reportHtml)
  document.body.appendChild(reportElement)

  await new Promise(resolve => setTimeout(resolve, 300))

  const reportCanvas = await html2canvas(reportElement, {
    width: 600,
    backgroundColor: '#ffffff',
    scale: 2
  })

  document.body.removeChild(reportElement)

  const pdf = new jsPDF('p', 'mm', 'a4')
  const pageWidth = 210
  const pageHeight = 297
  const margin = 5

  const imgWidth = pageWidth - margin * 2
  const imgHeight = (reportCanvas.height / reportCanvas.width) * imgWidth

  const totalPages = Math.ceil(imgHeight / pageHeight)

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      pdf.addPage()
    }

    const yOffset = page * pageHeight

    pdf.addImage(
      reportCanvas.toDataURL('image/png'),
      'PNG',
      margin,
      -yOffset,
      imgWidth,
      imgHeight
    )
  }

  const fileName = `地表覆盖分析报告_${districtName}_${year}年.pdf`
  pdf.save(fileName)

  return fileName
}

function parseApiStatsData(apiData) {
  const result = []
  const classes = apiData?.stats?.classes || apiData?.classes || {}
  
  Object.entries(classes).forEach(([key, cls]) => {
    const classValue = parseInt(key)
    if (CLASS_ORDER.includes(classValue)) {
      const area_m2 = cls.area_m2 || (cls.pixel_count ? cls.pixel_count * 100 : 0)
      result.push({
        value: classValue,
        name: CLASS_MAP[classValue],
        area: area_m2 / 1000000,
        pixel_count: cls.pixel_count || 0
      })
    }
  })

  return result.sort((a, b) => b.area - a.area)
}

function calculateChanges(data2020, data2021) {
  const result = []

  CLASS_ORDER.forEach(classValue => {
    const item2020 = data2020.find(d => d.value === classValue)
    const item2021 = data2021.find(d => d.value === classValue)
    
    const area2020 = item2020?.area || 0
    const area2021 = item2021?.area || 0
    const diff = area2021 - area2020
    
    let rate = 0
    if (area2020 !== 0) {
      rate = parseFloat(((diff / area2020) * 100).toFixed(2))
    } else if (diff !== 0) {
      rate = diff > 0 ? Infinity : -Infinity
    }

    if (area2020 > 0 || area2021 > 0) {
      result.push({
        value: classValue,
        name: CLASS_MAP[classValue],
        area2020: parseFloat(area2020.toFixed(4)),
        area2021: parseFloat(area2021.toFixed(4)),
        diff: parseFloat(diff.toFixed(4)),
        rate
      })
    }
  })

  return result.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate))
}

function calculateMetrics(statsData) {
  const totalArea = statsData.reduce((sum, item) => sum + (item.area || 0), 0)
  
  const builtUp = statsData.find(item => item.value === 50) || { area: 0 }
  const water = statsData.find(item => item.value === 80) || { area: 0 }
  const forest = statsData.find(item => item.value === 10) || { area: 0 }
  const shrub = statsData.find(item => item.value === 20) || { area: 0 }
  const grass = statsData.find(item => item.value === 30) || { area: 0 }
  const wetland = statsData.find(item => item.value === 90) || { area: 0 }
  const farmland = statsData.find(item => item.value === 40) || { area: 0 }
  const bare = statsData.find(item => item.value === 60) || { area: 0 }

  const greenArea = forest.area + shrub.area + grass.area + wetland.area
  const greenRate = totalArea > 0 ? (greenArea / totalArea) * 100 : 0

  return {
    builtUpArea: builtUp.area,
    builtUpRatio: totalArea > 0 ? (builtUp.area / totalArea) * 100 : 0,
    greenRate,
    waterArea: water.area,
    waterRatio: totalArea > 0 ? (water.area / totalArea) * 100 : 0,
    forestArea: forest.area,
    forestRatio: totalArea > 0 ? (forest.area / totalArea) * 100 : 0,
    farmlandArea: farmland.area,
    farmlandRatio: totalArea > 0 ? (farmland.area / totalArea) * 100 : 0,
    bareArea: bare.area,
    bareRatio: totalArea > 0 ? (bare.area / totalArea) * 100 : 0,
    totalArea,
    dominantClass: statsData.length > 0 ? statsData[0] : null
  }
}

function calculateChangeMetrics(changesData) {
  const growingClasses = changesData.filter(d => d.rate > 0)
  const shrinkingClasses = changesData.filter(d => d.rate < 0)
  
  const maxGrowth = changesData.reduce((max, item) => item.rate > max.rate ? item : max, { rate: -Infinity })
  const maxShrink = changesData.reduce((min, item) => item.rate < min.rate ? item : min, { rate: Infinity })
  
  const totalGrowth = growingClasses.reduce((sum, item) => sum + item.diff, 0)
  const totalShrink = Math.abs(shrinkingClasses.reduce((sum, item) => sum + item.diff, 0))

  return {
    growingCount: growingClasses.length,
    shrinkingCount: shrinkingClasses.length,
    maxGrowth,
    maxShrink,
    totalGrowth: parseFloat(totalGrowth.toFixed(4)),
    totalShrink: parseFloat(totalShrink.toFixed(4)),
    netChange: parseFloat((totalGrowth - totalShrink).toFixed(4))
  }
}

async function captureMapImage(mapElement) {
  if (!mapElement) return null

  try {
    const canvas = await html2canvas(mapElement, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: 1
    })

    const dataUrl = canvas.toDataURL('image/png')

    const isBlank = await isCanvasBlank(canvas)
    if (isBlank) {
      console.warn('⚠️ 地图截图为空白，可能是跨域限制')
      return null
    }

    return dataUrl
  } catch (error) {
    console.error('❌ 地图截图失败:', error)
    return null
  }
}

async function isCanvasBlank(canvas) {
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255 || data[i + 3] !== 255) {
      return false
    }
  }
  return true
}

export async function captureElement(element, options = {}) {
  if (!element) return null

  try {
    const canvas = await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      ...options
    })
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('❌ 截图失败:', error)
    return null
  }
}

function buildReportHtml({
  districtName,
  year,
  districtId,
  metrics,
  changeMetrics,
  statsData2020,
  statsData2021,
  changesData,
  mapImage,
  chartImage,
  temporalChartImage
}) {
  const today = new Date().toLocaleDateString('zh-CN')

  const sortedStats2021 = [...statsData2021].sort((a, b) => b.area - a.area)

  return `
    <div class="report-container">
      <div class="report-header">
        <h1 class="report-title">长沙市地表覆盖分析报告</h1>
        <p class="report-subtitle">${districtName} - ${year}年度综合分析</p>
      </div>

      <div class="summary-section">
        <h2 class="section-title">报告摘要</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">报告生成日期</span>
            <span class="summary-value">${today}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">分析年份</span>
            <span class="summary-value">${year}年</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">分析区县</span>
            <span class="summary-value">${districtName}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">数据来源</span>
            <span class="summary-value">ESA WorldCover 10m v200</span>
          </div>
        </div>
      </div>

      <div class="metrics-section">
        <h2 class="section-title">现状关键指标</h2>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-value">${metrics.totalArea.toFixed(2)}</div>
            <div class="metric-unit">km²</div>
            <div class="metric-label">总面积</div>
            <div class="metric-ratio">合计</div>
          </div>
          <div class="metric-card blue">
            <div class="metric-value">${metrics.builtUpArea.toFixed(2)}</div>
            <div class="metric-unit">km²</div>
            <div class="metric-label">建成区面积</div>
            <div class="metric-ratio">占比 ${metrics.builtUpRatio.toFixed(2)}%</div>
          </div>
          <div class="metric-card green">
            <div class="metric-value">${metrics.greenRate.toFixed(2)}</div>
            <div class="metric-unit">%</div>
            <div class="metric-label">绿地率</div>
            <div class="metric-ratio">林地+灌木+草地+湿地</div>
          </div>
          <div class="metric-card cyan">
            <div class="metric-value">${metrics.waterArea.toFixed(2)}</div>
            <div class="metric-unit">km²</div>
            <div class="metric-label">水体面积</div>
            <div class="metric-ratio">占比 ${metrics.waterRatio.toFixed(2)}%</div>
          </div>
          <div class="metric-card dark-green">
            <div class="metric-value">${metrics.forestArea.toFixed(2)}</div>
            <div class="metric-unit">km²</div>
            <div class="metric-label">林地面积</div>
            <div class="metric-ratio">占比 ${metrics.forestRatio.toFixed(2)}%</div>
          </div>
          <div class="metric-card purple">
            <div class="metric-value">${metrics.farmlandArea.toFixed(2)}</div>
            <div class="metric-unit">km²</div>
            <div class="metric-label">耕地面积</div>
            <div class="metric-ratio">占比 ${metrics.farmlandRatio.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      <div class="overview-section">
        <h2 class="section-title">现状分析</h2>
        <div class="overview-content">
          <p class="overview-text">${districtName}${year}年总用地面积 ${metrics.totalArea.toFixed(2)} km²。主要地类构成为：${metrics.dominantClass ? metrics.dominantClass.name : '无'}占比最高（${metrics.dominantClass ? (metrics.dominantClass.area / metrics.totalArea * 100).toFixed(2) : 0}%），其次为建成区（${metrics.builtUpRatio.toFixed(2)}%）和耕地（${metrics.farmlandRatio.toFixed(2)}%）。</p>
        </div>
        ${chartImage ? `<img src="${chartImage}" class="chart-image" />` : ''}
      </div>

      <div class="table-section">
        <h2 class="section-title">现状地类面积明细（${year}年）</h2>
        <table class="area-table">
          <thead>
            <tr>
              <th>地类</th>
              <th>面积（km²）</th>
              <th>占比（%）</th>
            </tr>
          </thead>
          <tbody>
            ${sortedStats2021.map(item => {
              const ratio = metrics.totalArea > 0 ? (item.area / metrics.totalArea) * 100 : 0
              return `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.area.toFixed(2)}</td>
                  <td>${ratio.toFixed(2)}</td>
                </tr>
              `
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="change-section">
        <h2 class="section-title">时序变化分析（2020 → 2021）</h2>
        
        <div class="change-summary">
          <div class="change-summary-grid">
            <div class="change-summary-item">
              <span class="change-summary-label">增长地类</span>
              <span class="change-summary-value increase">${changeMetrics.growingCount} 种</span>
            </div>
            <div class="change-summary-item">
              <span class="change-summary-label">减少地类</span>
              <span class="change-summary-value decrease">${changeMetrics.shrinkingCount} 种</span>
            </div>
            <div class="change-summary-item">
              <span class="change-summary-label">总增长面积</span>
              <span class="change-summary-value increase">+${changeMetrics.totalGrowth.toFixed(2)} km²</span>
            </div>
            <div class="change-summary-item">
              <span class="change-summary-label">总减少面积</span>
              <span class="change-summary-value decrease">-${changeMetrics.totalShrink.toFixed(2)} km²</span>
            </div>
          </div>
        </div>

        ${temporalChartImage ? `<img src="${temporalChartImage}" class="chart-image" />` : ''}

        <div class="change-highlight">
          <div class="highlight-item increase">
            <span class="highlight-icon">📈</span>
            <span class="highlight-content">增幅最大：${changeMetrics.maxGrowth.name}，变化率 ${formatRate(changeMetrics.maxGrowth.rate)}（${changeMetrics.maxGrowth.diff > 0 ? '+' : ''}${changeMetrics.maxGrowth.diff.toFixed(2)} km²）</span>
          </div>
          <div class="highlight-item decrease">
            <span class="highlight-icon">📉</span>
            <span class="highlight-content">降幅最大：${changeMetrics.maxShrink.name}，变化率 ${formatRate(changeMetrics.maxShrink.rate)}（${changeMetrics.maxShrink.diff > 0 ? '+' : ''}${changeMetrics.maxShrink.diff.toFixed(2)} km²）</span>
          </div>
        </div>

        <div class="change-table-section">
          <h3 class="sub-section-title">地类变化详情</h3>
          <table class="change-table">
            <thead>
              <tr>
                <th>地类</th>
                <th>2020年（km²）</th>
                <th>2021年（km²）</th>
                <th>变化量（km²）</th>
                <th>变化率（%）</th>
              </tr>
            </thead>
            <tbody>
              ${changesData.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td>${item.area2020.toFixed(2)}</td>
                  <td>${item.area2021.toFixed(2)}</td>
                  <td ${item.diff > 0 ? 'class="increase"' : item.diff < 0 ? 'class="decrease"' : ''}>${item.diff > 0 ? '+' : ''}${item.diff.toFixed(2)}</td>
                  <td ${item.rate > 0 ? 'class="increase"' : item.rate < 0 ? 'class="decrease"' : ''}>${formatRate(item.rate)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="analysis-section">
        <h2 class="section-title">趋势分析与建议</h2>
        <div class="analysis-content">
          <div class="analysis-item">
            <h4>📊 主要变化趋势</h4>
            <p>${generateTrendAnalysis(changesData, districtName)}</p>
          </div>
          <div class="analysis-item">
            <h4>🌿 生态保护评估</h4>
            <p>${generateEcoAssessment(metrics, changeMetrics)}</p>
          </div>
          <div class="analysis-item">
            <h4>🏙️ 城市发展评估</h4>
            <p>${generateUrbanAssessment(metrics, changeMetrics)}</p>
          </div>
        </div>
      </div>

      <div class="map-section" v-if="mapImage">
        <h2 class="section-title">地图展示</h2>
        ${mapImage ? `<img src="${mapImage}" class="map-image" />` : '<div class="no-data">地图暂不可用（跨域限制）</div>'}
      </div>

      <div class="legend-section">
        <h2 class="section-title">图例</h2>
        <div class="legend-grid">
          ${Object.entries(CLASS_MAP).map(([key, name]) => `
            <div class="legend-item">
              <span class="legend-color" style="background-color: ${COLOR_MAP[key]?.color || '#cccccc'}"></span>
              <span class="legend-name">${name}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="report-footer">
        <span class="footer-text">本报告由长沙地表覆盖分析平台自动生成</span>
        <span class="footer-page">第 1 页 / 共 1 页</span>
      </div>
    </div>
  `
}

function formatRate(rate) {
  if (rate === Infinity) return '新增'
  if (rate === -Infinity) return '消失'
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`
}

function generateTrendAnalysis(changesData, districtName) {
  const growing = changesData.filter(d => d.rate > 0).sort((a, b) => b.rate - a.rate)
  const shrinking = changesData.filter(d => d.rate < 0).sort((a, b) => a.rate - b.rate)

  let analysis = `${districtName}在2020-2021年间地表覆盖发生了显著变化。`
  
  if (growing.length > 0) {
    analysis += `主要增长地类为：${growing.slice(0, 2).map(d => d.name).join('、')}。`
  }
  if (shrinking.length > 0) {
    analysis += `主要减少地类为：${shrinking.slice(0, 2).map(d => d.name).join('、')}。`
  }
  
  const builtUp = changesData.find(d => d.value === 50)
  if (builtUp) {
    analysis += `建成区${builtUp.rate > 0 ? '呈现扩张趋势' : '有所收缩'}，变化率为${formatRate(builtUp.rate)}。`
  }
  
  return analysis
}

function generateEcoAssessment(metrics, changeMetrics) {
  const forest = metrics.forestRatio
  const green = metrics.greenRate
  const water = metrics.waterRatio

  let assessment = ''
  
  if (green >= 50) {
    assessment += '该区域绿地覆盖率较高（≥50%），生态环境良好。'
  } else if (green >= 30) {
    assessment += '该区域绿地覆盖率处于中等水平（30%-50%），生态状况一般。'
  } else {
    assessment += '该区域绿地覆盖率较低（<30%），建议加强生态保护和绿化建设。'
  }

  if (changeMetrics.maxShrink && changeMetrics.maxShrink.value === 10) {
    assessment += '林地面积减少较为明显，需关注森林资源保护。'
  }
  if (changeMetrics.maxShrink && changeMetrics.maxShrink.value === 90) {
    assessment += '湿地面积减少，需加强湿地保护与恢复工作。'
  }

  return assessment
}

function generateUrbanAssessment(metrics, changeMetrics) {
  const builtUp = metrics.builtUpRatio

  let assessment = ''

  if (builtUp >= 40) {
    assessment += '该区域城镇化水平较高（建成区占比≥40%），城市开发强度较大。'
  } else if (builtUp >= 20) {
    assessment += '该区域处于中等城镇化水平（建成区占比20%-40%），城市发展空间较大。'
  } else {
    assessment += '该区域城镇化水平较低（建成区占比<20%），城市发展潜力较大。'
  }

  const farmlandChange = changeMetrics.maxShrink?.value === 40 ? changeMetrics.maxShrink : null
  if (farmlandChange && farmlandChange.rate < -5) {
    assessment += '耕地面积减少超过5%，需关注耕地保护和基本农田红线。'
  }

  return assessment
}

function createReportElement(html) {
  const element = document.createElement('div')
  element.innerHTML = html
  element.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    width: 600px;
    background: #ffffff;
    padding: 30px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  `

  const style = document.createElement('style')
  style.textContent = `
    .report-container {
      width: 600px;
      background: #ffffff;
      padding: 30px;
      box-sizing: border-box;
    }

    .report-header {
      text-align: center;
      margin-bottom: 25px;
      padding-bottom: 15px;
      border-bottom: 2px solid #3b82f6;
    }

    .report-title {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 8px 0;
    }

    .report-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin: 25px 0 12px 0;
      padding-left: 8px;
      border-left: 4px solid #3b82f6;
    }

    .sub-section-title {
      font-size: 14px;
      font-weight: 600;
      color: #374151;
      margin: 18px 0 10px 0;
    }

    .summary-section {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .summary-label {
      font-size: 13px;
      color: #6b7280;
    }

    .summary-value {
      font-size: 13px;
      font-weight: 500;
      color: #1f2937;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .metric-card {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      border-radius: 8px;
      padding: 15px;
      text-align: center;
      color: #ffffff;
    }

    .metric-card.blue {
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    }

    .metric-card.green {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }

    .metric-card.cyan {
      background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
    }

    .metric-card.dark-green {
      background: linear-gradient(135deg, #166534 0%, #14532d 100%);
    }

    .metric-card.purple {
      background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);
    }

    .metric-value {
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
    }

    .metric-unit {
      font-size: 11px;
      opacity: 0.8;
      margin-top: 4px;
    }

    .metric-label {
      font-size: 12px;
      margin-top: 8px;
    }

    .metric-ratio {
      font-size: 10px;
      opacity: 0.7;
      margin-top: 4px;
    }

    .overview-section, .change-section {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
    }

    .overview-text {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .chart-image, .map-image {
      width: 100%;
      height: auto;
      border-radius: 4px;
    }

    .area-table, .change-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .area-table th, .change-table th {
      background: #f3f4f6;
      padding: 10px;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
    }

    .area-table td, .change-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
      color: #4b5563;
    }

    .area-table tbody tr:hover, .change-table tbody tr:hover {
      background: #f9fafb;
    }

    .change-table td.increase {
      color: #ef4444;
      font-weight: 500;
    }

    .change-table td.decrease {
      color: #22c55e;
      font-weight: 500;
    }

    .change-summary {
      margin-bottom: 15px;
    }

    .change-summary-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .change-summary-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #ffffff;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }

    .change-summary-label {
      font-size: 12px;
      color: #6b7280;
    }

    .change-summary-value {
      font-size: 13px;
      font-weight: 600;
    }

    .change-summary-value.increase {
      color: #ef4444;
    }

    .change-summary-value.decrease {
      color: #22c55e;
    }

    .change-highlight {
      margin-top: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .highlight-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      background: #ffffff;
      border-radius: 4px;
      border-left: 3px solid;
    }

    .highlight-item.increase {
      border-left-color: #ef4444;
      background: #fef2f2;
    }

    .highlight-item.decrease {
      border-left-color: #22c55e;
      background: #f0fdf4;
    }

    .highlight-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .highlight-content {
      font-size: 13px;
      color: #374151;
      line-height: 1.5;
    }

    .change-table-section {
      margin-top: 15px;
    }

    .analysis-section {
      background: #f8fafc;
      padding: 15px;
      border-radius: 6px;
    }

    .analysis-content {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .analysis-item {
      background: #ffffff;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e5e7eb;
    }

    .analysis-item h4 {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 8px 0;
    }

    .analysis-item p {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
      margin: 0;
    }

    .legend-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.1);
    }

    .legend-name {
      font-size: 13px;
      color: #4b5563;
    }

    .report-footer {
      margin-top: 25px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #6b7280;
    }

    .no-data {
      text-align: center;
      padding: 30px;
      color: #9ca3af;
      font-size: 13px;
      background: #f9fafb;
      border-radius: 4px;
    }
  `

  element.appendChild(style)
  return element
}
