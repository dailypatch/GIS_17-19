from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import rasterio
from rasterio.mask import mask
from shapely.geometry import shape
import numpy as np

# ==================== 第1步：创建 FastAPI 应用 ====================
app = FastAPI(title="地表覆盖统计API", version="1.0")

# 配置 CORS，允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境允许所有来源
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 第2步：定义接口契约 ====================
class AreaStatResponse(BaseModel):
    total_area_km2: float
    classes: Dict[str, float]

class ZonalStatRequest(BaseModel):
    geojson: dict
    raster_path: Optional[str] = None

# ESA WorldCover 11 类名称映射
CLASS_NAMES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse vegetation",
    70: "Snow and ice",
    80: "Permanent water bodies",
    90: "Herbaceous wetland",
    95: "Moss and lichen",
    100: "Open water",
}

# ==================== 第3步：健康检查接口 ====================
@app.get("/")
async def root():
    return {"message": "地表覆盖统计服务运行中"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# ==================== 第4步：核心统计算法 ====================
def calculate_zonal_stats(raster_path: str, geojson: dict) -> Dict[str, float]:
    """按 GeoJSON 多边形裁剪栅格，统计各地类面积（平方公里）"""
    
    # 从 GeoJSON 提取几何对象
    if "features" in geojson:
        geom = shape(geojson["features"][0]["geometry"])
    else:
        geom = shape(geojson)
    geoms = [geom.__geo_interface__]
    
    # 用掩膜裁剪栅格
    with rasterio.open(raster_path) as src:
        out_image, out_transform = mask(src, geoms, crop=True)
        data = out_image[0]
        
        # 计算像元面积（平方公里）
        pixel_width = abs(out_transform[0])
        pixel_height = abs(out_transform[4])
        pixel_area_km2 = (pixel_width * pixel_height) / 1_000_000
        
        # 统计各分类值的像元数
        unique, counts = np.unique(data, return_counts=True)
        
        # 换算为面积
        stats = {}
        for value, count in zip(unique, counts):
            if value != src.nodata:  # 排除 NoData
                class_name = CLASS_NAMES.get(value, f"Unknown_{value}")
                area_km2 = count * pixel_area_km2
                stats[class_name] = round(area_km2, 3)
        
        total_area = sum(stats.values())
        stats["total"] = round(total_area, 3)
        
        return stats

# ==================== 第5步：API 接口 ====================
@app.post("/api/zonal-stat", response_model=AreaStatResponse)
async def zonal_stat(request: ZonalStatRequest):
    """分区统计接口：传入 GeoJSON，返回各地类面积"""
    try:
        # 默认数据路径（后期替换成实际路径）
        raster_path = request.raster_path or "data/study_area.tif"
        
        stats = calculate_zonal_stats(raster_path, request.geojson)
        
        return AreaStatResponse(
            total_area_km2=stats.pop("total", 0),
            classes=stats
        )
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))

# ==================== 第6步：启动入口 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)