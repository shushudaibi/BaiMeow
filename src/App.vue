<!--
  App.vue 是应用的根组件。
  它不承载具体页面内容，只负责：
  1. 监听主题状态；
  2. 将主题名写到 <html data-theme="...">，让全局 CSS 变量自动生效；
  3. 渲染路由对应的页面。
-->
<script setup lang="ts">
import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

// 使用 Pinia 保存的主题状态。storeToRefs 可以保留 ref 的响应式能力。
const themeStore = useThemeStore()
const { theme } = storeToRefs(themeStore)

/**
 * immediate: true 表示组件创建时立即执行一次。
 *
 *
 *
 *
 *
 * 这样即使页面第一次打开，data-theme 也会立刻被设置，避免先显示错误主题再切换。
 */
watch(
  theme,
  (currentTheme) => {
    document.documentElement.dataset.theme = currentTheme
  },
  { immediate: true },
)
</script>

<template>
  <!-- 当前仅有一个首页，但保留 RouterView，后续增加新页面时无需重构根组件。 -->
  <RouterView />
</template>
