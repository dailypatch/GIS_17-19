import json
import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ========== 跨域配置（允许前端 localhost:5173 访问） ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== 地类名称映射（与报告表4保持一致） ==========
CLASS_NAMES = {
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

# ========== 接口：获取统计数据 ==========
@app.get("/api/stats")
def get_stats(year: int = Query(2021, description="数据年份，可选 2020 或 2021")):
    """
    获取指定年份的地表覆盖面积统计数据
    前端调用示例：/api/stats?year=2021
    """
    # 根据年份读取对应的 JSON 文件
    json_path = f"./data/area_stats_{year}.json"
    
    if not os.path.exists(json_path):
        return {
            "code": 404,
            "message": f"未找到 {year} 年的统计数据文件",
            "data": None
        }
    
    with open(json_path, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    # 转换为前端需要的格式
    classes = []
    total_area = 0.0
    
    for pixel_value_str, info in raw_data.items():
        pixel_value = int(pixel_value_str)
        area_sqkm = info.get("area_sqkm", 0)
        classes.append({
            "pixel_value": pixel_value,
            "class_name": CLASS_NAMES.get(pixel_value, "未知"),
            "area_sqkm": round(area_sqkm, 4)
        })
        total_area += area_sqkm
    
    # 计算占比（百分比）
    for item in classes:
        item["ratio"] = round(item["area_sqkm"] / total_area * 100, 2) if total_area > 0 else 0
    
    # 按面积从大到小排序
    classes.sort(key=lambda x: x["area_sqkm"], reverse=True)
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "year": year,
            "region": "长沙市二环",
            "total_area_sqkm": round(total_area, 4),
            "classes": classes
        }
    }


# ========== 健康检查接口 ==========
@app.get("/api/health")
def health_check():
    return {"code": 0, "message": "后端服务运行正常"}


# ========== 根路径 ==========
@app.get("/")
def root():
    return {"message": "GIS 后端服务已启动", "docs": "/docs"}