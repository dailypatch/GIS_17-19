export const DISTRICT_NAMES = {
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

export const DISTRICT_ENGLISH = {
  0: 'changsha_city',
  1: 'furong',
  2: 'tianxin',
  3: 'yuelu',
  4: 'kaifu',
  5: 'yuhua',
  6: 'wangcheng',
  7: 'changsha_county',
  8: 'liuyang',
  9: 'ningxiang'
}

export const DISTRICT_LIST = [
  { id: 0, name: '全市' },
  { id: 1, name: '芙蓉区' },
  { id: 2, name: '天心区' },
  { id: 3, name: '岳麓区' },
  { id: 4, name: '开福区' },
  { id: 5, name: '雨花区' },
  { id: 6, name: '望城区' },
  { id: 7, name: '长沙县' },
  { id: 8, name: '浏阳市' },
  { id: 9, name: '宁乡市' }
]

export function getDistrictEnglishName(id) {
  return DISTRICT_ENGLISH[id] || ''
}

export function getDistrictChineseName(id) {
  return DISTRICT_NAMES[id] || '未知区县'
}

export function getCOGFileName(districtId, year) {
  if (districtId === 0) {
    return `Changsha_Districts_ESA_WC10m_${year}_final.tif`
  }
  const englishNames = {
    1: 'Furong',
    2: 'Tianxin',
    3: 'Yuelu',
    4: 'Kaifu',
    5: 'Yuhua',
    6: 'Wangcheng',
    7: 'ChangshaCounty',
    8: 'Liuyang',
    9: 'Ningxiang'
  }
  const prefix = String(districtId).padStart(2, '0')
  return `${prefix}_${englishNames[districtId]}_ESA_WC10m_${year}_final.tif`
}

export function getBoundaryFileName(districtId) {
  if (districtId === 0) {
    return 'changsha_districts.geojson'
  }
  const prefix = String(districtId).padStart(2, '0')
  const englishNames = {
    1: 'furong',
    2: 'tianxin',
    3: 'yuelu',
    4: 'kaifu',
    5: 'yuhua',
    6: 'wangcheng',
    7: 'changsha_county',
    8: 'liuyang',
    9: 'ningxiang'
  }
  return `${prefix}_${englishNames[districtId]}.geojson`
}

export function getStatsFileName(districtId, year) {
  if (districtId === 0) {
    return `Changsha_Districts_ESA_WC10m_${year}_final.json`
  }
  const englishNames = {
    1: 'Furong',
    2: 'Tianxin',
    3: 'Yuelu',
    4: 'Kaifu',
    5: 'Yuhua',
    6: 'Wangcheng',
    7: 'ChangshaCounty',
    8: 'Liuyang',
    9: 'Ningxiang'
  }
  const prefix = String(districtId).padStart(2, '0')
  return `${prefix}_${englishNames[districtId]}_ESA_WC10m_${year}_final.json`
}