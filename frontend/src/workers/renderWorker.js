const colorMap = {
  10: [0, 100, 0],
  20: [255, 187, 34],
  30: [255, 255, 76],
  40: [240, 150, 255],
  50: [250, 0, 0],
  60: [180, 180, 180],
  70: [240, 240, 240],
  80: [0, 100, 200],
  90: [0, 150, 160],
  95: [0, 207, 117],
  100: [250, 230, 160]
}

self.onmessage = function(e) {
  const { type, data } = e.data
  
  if (type === 'render') {
    const { pixelValues, imageWidth, imageHeight, filterValue, visibleMap } = data
    
    const canvas = new OffscreenCanvas(imageWidth, imageHeight)
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(imageWidth, imageHeight)
    const pixels = imageData.data
    
    const len = pixelValues.length
    for (let i = 0; i < len; i++) {
      const val = pixelValues[i]
      const intVal = Math.round(val)
      const idx = i * 4
      
      if (val === 0 || val === undefined || val === null || isNaN(val)) {
        pixels[idx] = 0
        pixels[idx + 1] = 0
        pixels[idx + 2] = 0
        pixels[idx + 3] = 0
      } else if (colorMap[intVal]) {
        const [r, g, b] = colorMap[intVal]
        
        if (visibleMap[intVal] === false) {
          pixels[idx] = r
          pixels[idx + 1] = g
          pixels[idx + 2] = b
          pixels[idx + 3] = 0
        } else if (filterValue !== null && intVal !== filterValue) {
          pixels[idx] = r
          pixels[idx + 1] = g
          pixels[idx + 2] = b
          pixels[idx + 3] = Math.round(255 * 0.15)
        } else {
          pixels[idx] = r
          pixels[idx + 1] = g
          pixels[idx + 2] = b
          pixels[idx + 3] = 255
        }
      } else {
        pixels[idx] = 128
        pixels[idx + 1] = 128
        pixels[idx + 2] = 128
        pixels[idx + 3] = filterValue !== null ? Math.round(255 * 0.15) : 128
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    
    canvas.convertToBlob({ type: 'image/png' }).then(blob => {
      self.postMessage({
        type: 'renderComplete',
        blob,
        width: imageWidth,
        height: imageHeight
      })
    })
  } else if (type === 'renderHighlight') {
    const { pixelValues, imageWidth, imageHeight, highlightValue } = data
    
    const canvas = new OffscreenCanvas(imageWidth, imageHeight)
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(imageWidth, imageHeight)
    const pixels = imageData.data
    
    const len = pixelValues.length
    for (let i = 0; i < len; i++) {
      const val = pixelValues[i]
      const intVal = Math.round(val)
      const idx = i * 4
      
      if (intVal === highlightValue) {
        pixels[idx] = 255
        pixels[idx + 1] = 255
        pixels[idx + 2] = 255
        pixels[idx + 3] = 255
      } else {
        pixels[idx] = 0
        pixels[idx + 1] = 0
        pixels[idx + 2] = 0
        pixels[idx + 3] = 0
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    
    canvas.convertToBlob({ type: 'image/png' }).then(blob => {
      self.postMessage({
        type: 'highlightComplete',
        blob,
        width: imageWidth,
        height: imageHeight
      })
    })
  } else if (type === 'terminate') {
    self.close()
  }
}