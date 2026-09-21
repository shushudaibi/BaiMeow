/**
 * 全站主题状态。
 *
 * 主题切换的关键不是直接修改每个组件的颜色，而是修改 <html data-theme="...">。
 * global.css 根据不同 data-theme 值提供不同的 CSS 变量，
 * 所有组件都只使用变量，因此切换主题时不需要重写页面结构。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

// 三种主题名称必须与 global.css 中的选择器保持一致。
export type ThemeName = 'plain' | 'fresh' | 'tech'

// localStorage 的键名统一为常量，避免出现拼写差异。
const THEME_STORAGE_KEY = 'baimeow-theme'

/**
 * 判断任意字符串是否是受支持的主题。
 * localStorage 可能保存旧版本数据，因此读取时必须做这一层校验。
 */
function isThemeName(value: string | null): value is ThemeName {
  return value === 'plain' || value === 'fresh' || value === 'tech'
}

// 模块初始化时读取一次本地存储；没有记录或记录无效时使用“朴素风”。
const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)

export const useThemeStore = defineStore('theme', () => {
  // ref 保存当前主题，模板和 App.vue 都能响应它的变化。
  const theme = ref<ThemeName>(isThemeName(storedTheme) ? storedTheme : 'plain')

  /**
   * 修改主题并持久化。
   * App.vue 监听 theme 后，会把新值写到 html 元素上。
   */
  function setTheme(nextTheme: ThemeName) {
    theme.value = nextTheme
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }

  return {
    theme,
    setTheme,
  }
})
