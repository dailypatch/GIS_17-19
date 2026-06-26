import os
import sys
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import rasterio
from rasterio.mask import mask
from rasterio.warp import transform_geom
from shapely.geometry import shape, mapping
import numpy as np

# ==================== 配置日志 ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# ==================== 第1步：创建 FastAPI 应用 ====================
app = FastAPI(title="地表覆盖统计API", version="1.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    
    logger.info(f"=== 函数被调用: {raster_path} ===")
    
    if not os.path.exists(raster_path):
        raise FileNotFoundError(f"栅格文件不存在: {raster_path}")
    
    # 1. 从 GeoJSON 提取几何对象
    if "features" in geojson:
        if isinstance(geojson["features"], list) and len(geojson["features"]) > 0:
            geom = shape(geojson["features"][0]["geometry"])
        else:
            geom = shape(geojson["features"])
    else:
        geom = shape(geojson)
    
    logger.info(f"原始 GeoJSON 类型: {geom.geom_type}")
    
    # 2. 修复无效几何
    if not geom.is_valid:
        logger.info("几何无效，尝试修复")
        geom = geom.buffer(0)
    
    # 3. 读取栅格获取坐标系
    with rasterio.open(raster_path) as src:
        src_crs = src.crs
        logger.info(f"栅格 CRS: {src_crs}")
        
        # 4. 将 GeoJSON 转换为栅格坐标系
        # 如果 GeoJSON 是 EPSG:4326 而栅格不是，自动转换
        if src_crs != "EPSG:4326":
            logger.info("GeoJSON 坐标自动转换到栅格坐标系...")
            geom_geojson = mapping(geom)
            geom_transformed = transform_geom(
                "EPSG:4326",
                src_crs,
                geom_geojson
            )
            geom = shape(geom_transformed)
            logger.info(f"转换后类型: {geom.geom_type}")
        else:
            # 如果栅格本身就是 EPSG:4326，直接使用
            geom_geojson = mapping(geom)
        
        # 5. 转换为裁剪所需的格式
        geoms = [mapping(geom)]
        
        # 6. 裁剪栅格
        out_image, out_transform = mask(src, geoms, crop=True)
        data = out_image[0]
        
        logger.info(f"data 形状: {data.shape}")
        logger.info(f"data 唯一值: {np.unique(data)}")
        
        # 7. 计算像元面积（平方公里）
        pixel_width = abs(out_transform[0])
        pixel_height = abs(out_transform[4])
        pixel_area_km2 = (pixel_width * pixel_height) / 1_000_000
        logger.info(f"像元面积: {pixel_area_km2:.8f} km²")
        
        # 8. 统计
        unique, counts = np.unique(data, return_counts=True)
        
        logger.info(f"unique: {unique}")
        logger.info(f"counts: {counts}")
        
        stats = {}
        for value, count in zip(unique, counts):
            logger.info(f"处理: value={value}, count={count}")
            if value == 0:
                logger.info("跳过 0 (NoData)")
                continue
            if src.nodata is not None and value == src.nodata:
                logger.info("跳过 NoData")
                continue
            
            class_name = CLASS_NAMES.get(value, f"Unknown_{value}")
            area_km2 = count * pixel_area_km2
            stats[class_name] = round(area_km2, 4)
            logger.info(f"{class_name}: {count} 个像元, {area_km2:.4f} km²")
        
        stats["total"] = round(sum(stats.values()), 3)
        logger.info(f"最终结果: {stats}")
        
        return stats

# ==================== 第5步：API 接口 ====================
@app.post("/api/zonal-stat", response_model=AreaStatResponse)
async def zonal_stat(request: ZonalStatRequest):
    logger.info("=== 接口被调用 ===")
    try:
        raster_path = request.raster_path or "data/study_area.tif"
        stats = calculate_zonal_stats(raster_path, request.geojson)
        return AreaStatResponse(
            total_area_km2=stats.pop("total", 0),
            classes=stats
        )
    except Exception as e:
        logger.error(f"错误: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== 第6步：启动入口 ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
    