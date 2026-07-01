<template>
  <div class="district-selector">
    <label class="selector-label">区县选择</label>
    <select 
      v-model="selectedValue" 
      class="selector-select"
      @change="handleChange"
    >
      <option 
        v-for="district in districts" 
        :key="district.id" 
        :value="district.id"
      >
        {{ district.name }}
      </option>
    </select>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { DISTRICT_LIST } from '../config/districtMap'

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0
  },
  districtList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const districts = ref(DISTRICT_LIST)
const selectedValue = ref(0)

watch(() => props.districtList, (newList) => {
  if (newList && newList.length > 0) {
    districts.value = newList
    console.log('📍 区县列表已更新:', newList)
  }
}, { immediate: true })

watch(() => props.modelValue, (newValue) => {
  selectedValue.value = newValue
}, { immediate: true })

function handleChange() {
  emit('update:modelValue', selectedValue.value)
}

onMounted(() => {
  console.log('📍 区县选择器初始化完成')
})
</script>

<style scoped>
.district-selector {
  margin-bottom: 16px;
}

.selector-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.selector-select {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: #374151;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
}

.selector-select:hover {
  border-color: #3b82f6;
}

.selector-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.selector-select option {
  padding: 8px;
  font-size: 13px;
}
</style>