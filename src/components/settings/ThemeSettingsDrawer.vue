<!--
  ThemeSettingsDrawer.vue 是右侧设置抽屉。
  三种主题只展示名称、说明和颜色预览，真正的颜色规则统一放在 global CSS 中。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { Check, MagicStick, Monitor, Sunny } from '@element-plus/icons-vue'
import { useThemeStore, type ThemeName } from '@/stores/theme'

// v-model 允许父组件用 settingsVisible 控制抽屉开关。
const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
}>()

// Element Plus Drawer 使用 v-model，因此将 props + emit 封装成可写计算属性。
const drawerVisible = computed({
  get: () => props.modelValue,
  set: (visible: boolean) => emit('update:modelValue', visible),
})

const themeStore = useThemeStore()

// 每个主题都有一个图标和三个预览色块，方便用户直观比较。
interface ThemeOption {
  value: ThemeName
  name: string
  description: string
  icon: typeof Sunny
  colors: [string, string, string]
}

const themeOptions: ThemeOption[] = [
  {
    value: 'plain',
    name: '简约朴素风',
    description: '低饱和绿色搭配暖色点缀，清晰耐看，适合长时间使用。',
    icon: Monitor,
    colors: ['#526f66', '#f3f5f2', '#db765d'],
  },
  {
    value: 'fresh',
    name: '小清新风',
    description: '薄荷绿与轻柔粉色组合，整体明亮、轻快、有呼吸感。',
    icon: Sunny,
    colors: ['#2f9e91', '#effaf7', '#ef8ea0'],
  },
  {
    value: 'tech',
    name: '未来科技风',
    description: '深色界面搭配青蓝高光，适合夜间和偏好科技感的用户。',
    icon: MagicStick,
    colors: ['#2dd4bf', '#101923', '#7c9cff'],
  },
]

// 点击主题卡片后更新 Pinia，App.vue 会同步修改 html[data-theme]。
function selectTheme(themeName: ThemeName) {
  themeStore.setTheme(themeName)
}
</script>

<template>
  <el-drawer
    v-model="drawerVisible"
    class="theme-drawer"
    direction="rtl"
    size="min(390px, 92vw)"
    :with-header="false"
    append-to-body
  >
    <!-- 抽屉标题与说明 -->
    <div class="drawer-header">
      <span class="drawer-eyebrow">SETTINGS</span>
      <h2>外观设置</h2>
      <p>选择你喜欢的视觉风格，设置会保存在当前浏览器中。</p>
    </div>

    <!-- 三种主题采用真实按钮而不是普通 div，键盘也能直接操作。 -->
    <div class="theme-list">
      <button
        v-for="option in themeOptions"
        :key="option.value"
        type="button"
        class="theme-option"
        :class="{ active: themeStore.theme === option.value }"
        :aria-pressed="themeStore.theme === option.value"
        @click="selectTheme(option.value)"
      >
        <span class="option-icon">
          <el-icon :size="20"><component :is="option.icon" /></el-icon>
        </span>

        <span class="option-copy">
          <span class="option-title">
            <strong>{{ option.name }}</strong>
            <el-icon v-if="themeStore.theme === option.value" :size="17">
              <Check />
            </el-icon>
          </span>
          <small>{{ option.description }}</small>

          <!-- 色块是静态展示值，不会随当前主题变化，便于比较原色。 -->
          <span class="palette" aria-label="主题配色预览">
            <i v-for="color in option.colors" :key="color" :style="{ backgroundColor: color }"></i>
          </span>
        </span>
      </button>
    </div>

    <!-- 这里说明默认值和持久化行为，避免用户误以为关闭浏览器后会丢失。 -->
    <div class="drawer-note">
      <strong>默认主题</strong>
      <span>首次访问使用简约朴素风，之后读取上次选择。</span>
    </div>
  </el-drawer>
</template>

<style scoped>
/* 抽屉内部统一使用主题变量，使背景和文字跟随当前主题。 */
.theme-drawer {
  color: var(--bm-text);
  background: var(--bm-surface);
}

.drawer-header {
  padding: 4px 2px 20px;
  border-bottom: 1px solid var(--bm-border);
}

.drawer-eyebrow {
  color: var(--bm-accent);
  font-size: 10px;
  font-weight: 800;
}

.drawer-header h2 {
  margin: 8px 0 7px;
  color: var(--bm-text-strong);
  font-size: 24px;
  line-height: 1.2;
}

.drawer-header p {
  margin: 0;
  color: var(--bm-text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.theme-list {
  margin-top: 16px;
  display: grid;
  gap: 10px;
}

/* 主题卡片设置稳定内边距，选中后不会改变整体尺寸。 */
.theme-option {
  width: 100%;
  padding: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: var(--bm-text);
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 11px;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.theme-option:hover {
  border-color: var(--bm-primary-border);
  transform: translateY(-1px);
}

.theme-option.active {
  background: var(--bm-primary-soft);
  border-color: var(--bm-primary);
}

.option-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  color: var(--bm-primary);
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 9px;
}

.option-copy {
  min-width: 0;
  flex: 1;
}

.option-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--bm-text-strong);
}

.option-title strong {
  font-size: 14px;
}

.option-title .el-icon {
  color: var(--bm-primary);
}

.option-copy small {
  margin-top: 5px;
  display: block;
  color: var(--bm-text-muted);
  font-size: 11px;
  line-height: 1.55;
}

/* 色块使用正方形，圆角保持较小，体现工具型界面。 */
.palette {
  margin-top: 10px;
  display: flex;
  gap: 6px;
}

.palette i {
  width: 24px;
  height: 15px;
  display: block;
  border: 1px solid rgba(127, 127, 127, 0.24);
  border-radius: 4px;
}

/* 底部说明使用浅色背景，与主题选择卡片保持层级差异。 */
.drawer-note {
  margin-top: 18px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--bm-text-muted);
  background: var(--bm-surface-soft);
  border-left: 3px solid var(--bm-accent);
  border-radius: 0 8px 8px 0;
  font-size: 11px;
  line-height: 1.5;
}

.drawer-note strong {
  color: var(--bm-text-strong);
}
</style>
