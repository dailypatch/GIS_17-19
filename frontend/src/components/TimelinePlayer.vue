<template>
  <div class="timeline-player">
    <div class="controls-left">
      <button class="control-btn" @click="prevFrame" :disabled="isAnimating">
        <span>⏮</span>
      </button>
      <button class="control-btn play-toggle" @click="togglePlay" :disabled="isAnimating">
        <span>{{ isPlaying ? '⏸' : '▶' }}</span>
      </button>
      <button class="control-btn" @click="nextFrame" :disabled="isAnimating">
        <span>⏭</span>
      </button>
    </div>
    
    <div class="year-display">
      <span class="year-label">{{ modelValue }}</span>
    </div>
    
    <div class="progress-bar-wrapper">
      <div class="progress-track" @click="handleProgressClick" @mousedown="startDrag">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        <div 
          class="progress-thumb" 
          :style="{ left: progressPercent + '%' }"
          @mousedown.stop="startDrag"
        ></div>
      </div>
      <div class="year-markers">
        <span>{{ startYear }}</span>
        <span>{{ endYear }}</span>
      </div>
    </div>
    
    <div class="speed-control">
      <select v-model="selectedSpeed" class="speed-select">
        <option :value="500">0.5s</option>
        <option :value="1000">1.0s</option>
        <option :value="2000">2.0s</option>
        <option :value="3000">3.0s</option>
      </select>
    </div>
    
    <div class="year-range">
      <span class="range-label">起始:</span>
      <select v-model="startYear" class="year-select" @change="onYearRangeChange">
        <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
      </select>
      <span class="range-label">结束:</span>
      <select v-model="endYear" class="year-select" @change="onYearRangeChange">
        <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Number,
    default: 2021
  }
})

const emit = defineEmits(['update:modelValue', 'play', 'pause', 'year-change', 'animate-to'])

const availableYears = [2020, 2021]
const startYear = ref(2020)
const endYear = ref(2021)
const isPlaying = ref(false)
const isDragging = ref(false)
const isAnimating = ref(false)
const selectedSpeed = ref(1000)

const interval = computed(() => selectedSpeed.value)

const progressPercent = computed(() => {
  const range = endYear.value - startYear.value
  if (range === 0) return 0
  return ((props.modelValue - startYear.value) / range) * 100
})

let timer = null

watch(isPlaying, (playing) => {
  if (playing) {
    emit('play')
    startPlay()
  } else {
    emit('pause')
    stopPlay()
  }
})

function togglePlay() {
  isPlaying.value = !isPlaying.value
}

function startPlay() {
  stopPlay()
  timer = setInterval(() => {
    nextFrame()
  }, interval.value)
  console.log('▶️ 开始播放，间隔:', interval.value, 'ms')
}

function stopPlay() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  console.log('⏸️ 暂停播放')
}

function prevFrame() {
  if (props.modelValue > startYear.value) {
    const newYear = props.modelValue - 1
    emit('animate-to', newYear)
    console.log('⏮ 上一帧:', newYear)
  }
}

function nextFrame() {
  if (props.modelValue < endYear.value) {
    const newYear = props.modelValue + 1
    emit('animate-to', newYear)
    console.log('⏭ 下一帧:', newYear)
  } else {
    isPlaying.value = false
    stopPlay()
    console.log('🔚 播放结束')
  }
}

function handleProgressClick(e) {
  if (isDragging.value || isAnimating.value) return
  const track = e.currentTarget
  const rect = track.getBoundingClientRect()
  const x = e.clientX - rect.left
  const percent = Math.max(0, Math.min(x / rect.width, 1))
  const range = endYear.value - startYear.value
  const newYear = Math.round(startYear.value + percent * range)
  if (newYear !== props.modelValue) {
    emit('animate-to', newYear)
    console.log('📍 跳转到:', newYear)
  }
}

function startDrag(e) {
  isDragging.value = true
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  updateYearFromEvent(e)
}

function onDrag(e) {
  if (!isDragging.value) return
  updateYearFromEvent(e)
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

function updateYearFromEvent(e) {
  const track = document.querySelector('.progress-track')
  if (!track) return
  
  const rect = track.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const percent = x / rect.width
  const range = endYear.value - startYear.value
  const newYear = Math.round(startYear.value + percent * range)
  
  if (newYear !== props.modelValue) {
    emit('animate-to', newYear)
  }
}

function onYearRangeChange() {
  if (startYear.value > endYear.value) {
    const temp = startYear.value
    startYear.value = endYear.value
    endYear.value = temp
  }
  
  if (props.modelValue < startYear.value) {
    emit('update:modelValue', startYear.value)
  } else if (props.modelValue > endYear.value) {
    emit('update:modelValue', endYear.value)
  }
  
  console.log('📅 年份范围变更:', startYear.value, '-', endYear.value)
}

function setAnimating(value) {
  isAnimating.value = value
}

defineExpose({ setAnimating })

onUnmounted(() => {
  stopPlay()
  stopDrag()
})
</script>

<style scoped>
.timeline-player {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  background: rgba(0, 0, 0, 0.75);
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  width: 100%;
  max-width: 800px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: none;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.control-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.25);
}

.control-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.control-btn.play-toggle {
  width: 44px;
  height: 44px;
  background: rgba(59, 130, 246, 0.8);
  font-size: 16px;
}

.control-btn.play-toggle:hover:not(:disabled) {
  background: rgba(59, 130, 246, 1);
}

.year-display {
  display: flex;
  align-items: center;
}

.year-label {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  min-width: 60px;
  text-align: center;
  letter-spacing: 1px;
}

.progress-bar-wrapper {
  flex: 1;
}

.progress-track {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
}

.progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 4px;
  transition: width 0.1s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: grab;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  transition: left 0.1s linear;
}

.progress-thumb:active {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.2);
}

.year-markers {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.speed-control {
  flex-shrink: 0;
}

.speed-select {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.speed-select option {
  background: #374151;
  color: #ffffff;
}

.year-range {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.range-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.year-select {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  min-width: 60px;
}

.year-select option {
  background: #374151;
  color: #ffffff;
}
</style>