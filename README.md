# 地表覆盖统计 API

## 启动服务
```bash
venv\Scripts\activate
uvicorn main:app --reload
访问接口文档
http://127.0.0.1:8000/docs

接口说明
接口地址
POST /api/zonal-stat

请求格式
json
{
  "geojson": {
    "type": "Polygon",
    "coordinates": [[[经度, 纬度], ...]]
  }
}
返回格式
json
{
  "total_area_km2": 139.522,
  "classes": {
    "Tree cover": 28.67,
    "Built-up": 77.57,
    "Permanent water bodies": 19.64
  }
}
支持的 11 类地表覆盖
值	名称
10	Tree cover
20	Shrubland
30	Grassland
40	Cropland
50	Built-up
60	Bare / sparse vegetation
70	Snow and ice
80	Permanent water bodies
90	Herbaceous wetland
95	Moss and lichen
100	Open water
测试示例
bash
curl -X POST http://127.0.0.1:8000/api/zonal-stat \
  -H "Content-Type: application/json" \
  -d '{"geojson": {"type": "Polygon", "coordinates": [[[112.91, 28.13], [113.02, 28.13], [113.02, 28.29], [112.91, 28.29], [112.91, 28.13]]]}}'