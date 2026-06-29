import json
import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ========== 跨域配置 ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== 地类名称映射（中文） ==========
CLASS_NAMES_CN = {
    10: "林地",
    20: "灌木地",
    30: "草地",
    40: "耕地",
    50: "建成区",
    60: "裸地/稀疏植被",
    70: "冰雪",
    80: "永久水体",
    90: "草本湿地",
    95: "红树林",
    100: "苔藓与地衣"
}

# ========== 区县 ID → 文件名前缀 ==========
DISTRICT_PREFIX = {
    1: "01_Furong",
    2: "02_Tianxin",
    3: "03_Yuelu",
    4: "04_Kaifu",
    5: "05_Yuhua",
    6: "06_Wangcheng",
    7: "07_ChangshaCounty",
    8: "08_Liuyang",
    9: "09_Ningxiang",
}

DISTRICT_NAMES = {
    0: "长沙市",
    1: "芙蓉区",
    2: "天心区",
    3: "岳麓区",
    4: "开福区",
    5: "雨花区",
    6: "望城区",
    7: "长沙县",
    8: "浏阳市",
    9: "宁乡市"
}

# ========== 数据根目录 ==========
DATA_ROOT = "./data/data_1"

def get_stats_file_path(district_id: int, year: int):
    """获取区县统计文件的完整路径"""
    if district_id == 0:
        filename = f"Changsha_Districts_ESA_WC10m_{year}_final.json"
    else:
        prefix = DISTRICT_PREFIX.get(district_id)
        if not prefix:
            return None
        filename = f"{prefix}_ESA_WC10m_{year}_final.json"
    
    return os.path.join(DATA_ROOT, "district_stats", f"stats_{year}.json", filename)


# ========== 接口1：获取区县列表 ==========
@app.get("/api/districts")
def get_districts():
    """获取长沙市所有区县列表"""
    districts = [{"id": 0, "name": "长沙市"}]
    for id, name in DISTRICT_NAMES.items():
        if id != 0:
            districts.append({"id": id, "name": name})
    return {"code": 0, "message": "success", "data": districts}


# ========== 接口2：获取分区统计（核心） ==========
@app.get("/api/stats")
def get_stats(
    district_id: int = Query(0, description="区县ID，0表示全市"), 
    year: int = Query(2021, description="年份，2020或2021")
):
    """获取指定区县、指定年份的地表覆盖统计数据"""
    file_path = get_stats_file_path(district_id, year)
    
    if not file_path or not os.path.exists(file_path):
        return {"code": 404, "message": f"区县 {district_id} 的 {year} 年数据不存在"}
    
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    stats = data.get("stats", {})
    classes_data = stats.get("classes", {})
    
    # 转换为前端需要的格式
    classes = []
    total_area_km2 = 0.0
    
    for code_str, info in classes_data.items():
        code = int(code_str)
        area_m2 = info.get("area_m2", 0)
        area_km2 = area_m2 / 1_000_000
        classes.append({
            "pixel_value": code,
            "class_name": CLASS_NAMES_CN.get(code, info.get("class_name", "未知")),
            "area_sqkm": round(area_km2, 4),
            "pixel_count": info.get("pixel_count", 0)
        })
        total_area_km2 += area_km2
    
    # 计算占比
    for item in classes:
        item["ratio"] = round(item["area_sqkm"] / total_area_km2 * 100, 2) if total_area_km2 > 0 else 0
    
    # 按面积从大到小排序
    classes.sort(key=lambda x: x["area_sqkm"], reverse=True)
    
    district_name = DISTRICT_NAMES.get(district_id, stats.get("district", "未知"))
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "district_id": district_id,
            "district_name": district_name,
            "year": year,
            "total_area_sqkm": round(total_area_km2, 4),
            "classes": classes
        }
    }


# ========== 接口3：获取区县边界 ==========
@app.get("/api/districts/{district_id}/bounds")
def get_district_bounds(district_id: int):
    """获取指定区县的 GeoJSON 边界"""
    if district_id == 0:
        geojson_path = os.path.join(DATA_ROOT, "boundary", "changsha_districts.geojson")
    else:
        prefix = DISTRICT_PREFIX.get(district_id)
        if not prefix:
            return {"code": 404, "message": f"区县 {district_id} 不存在"}
        filename = f"{prefix.lower()}.geojson"
        geojson_path = os.path.join(DATA_ROOT, "boundary", "split_districts", filename)
    
    if not os.path.exists(geojson_path):
        return {"code": 404, "message": f"区县 {district_id} 的边界文件不存在"}
    
    with open(geojson_path, "r", encoding="utf-8") as f:
        feature = json.load(f)
    
    return {"code": 0, "message": "success", "data": feature}


# ========== 接口4：点选查询 ==========
@app.get("/api/query")
def query_point(
    lat: float = Query(..., description="纬度"), 
    lng: float = Query(..., description="经度")
):
    """根据经纬度查询所属区县"""
    try:
        from shapely.geometry import Point, shape
    except ImportError:
        return {"code": 500, "message": "Shapely 未安装，请执行 pip install shapely"}
    
    geojson_path = os.path.join(DATA_ROOT, "boundary", "changsha_districts.geojson")
    
    if not os.path.exists(geojson_path):
        return {"code": 404, "message": "区县边界文件不存在"}
    
    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    point = Point(lng, lat)
    
    for feature in data.get("features", []):
        polygon = shape(feature.get("geometry"))
        if polygon.contains(point):
            props = feature.get("properties", {})
            district_id = props.get("id") or props.get("district_id") or props.get("FID")
            district_name = props.get("name") or props.get("district") or props.get("NAME")
            return {
                "code": 0,
                "message": "success",
                "data": {
                    "district_id": int(district_id) if district_id else None,
                    "district_name": district_name
                }
            }
    
    return {"code": 404, "message": "该位置不在长沙市范围内"}


# ========== 健康检查 ==========
@app.get("/api/health")
def health_check():
    return {"code": 0, "message": "后端服务运行正常"}


@app.get("/")
def root():
    return {"message": "长沙市地表覆盖可视化后端服务", "docs": "/docs"}