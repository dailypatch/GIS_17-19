export const COLOR_MAP = {
  10: { name: '林地', color: '#006400', rgb: [0, 100, 0] },
  20: { name: '灌木地', color: '#ffbb22', rgb: [255, 187, 34] },
  30: { name: '草地', color: '#ffff4c', rgb: [255, 255, 76] },
  40: { name: '耕地', color: '#f096ff', rgb: [240, 150, 255] },
  50: { name: '建成区', color: '#fa0000', rgb: [250, 0, 0] },
  60: { name: '裸地/稀疏植被', color: '#b4b4b4', rgb: [180, 180, 180] },
  70: { name: '冰雪', color: '#f0f0f0', rgb: [240, 240, 240] },
  80: { name: '永久水体', color: '#0064c8', rgb: [0, 100, 200] },
  90: { name: '草本湿地', color: '#0096a0', rgb: [0, 150, 160] },
  95: { name: '红树林', color: '#00cf75', rgb: [0, 207, 117] },
  100: { name: '苔藓地衣', color: '#fae6a0', rgb: [250, 230, 160] }
}

export const CLASS_ORDER = [10, 20, 30, 40, 50, 60, 80, 90]

export const CLASS_MAP = {}
CLASS_ORDER.forEach(value => {
  CLASS_MAP[value] = COLOR_MAP[value].name
})

export function getColorByValue(value) {
  return COLOR_MAP[value]?.color || '#cccccc'
}

export function getNameByValue(value) {
  return COLOR_MAP[value]?.name || '未知'
}

export function getLegendItems() {
  return Object.entries(COLOR_MAP).map(([key, value]) => ({
    value: parseInt(key),
    name: value.name,
    color: value.color
  }))
}