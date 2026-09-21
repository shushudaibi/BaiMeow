<!--
  AppHeader.vue 展示网站 Logo、网站名称和设置入口。
  Logo 使用 src/assets/logo.png 中的图片，用户只需要替换该文件即可。
-->
<script setup lang="ts">
import { ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import logoUrl from '@/assets/logo.png'

// 子组件只负责通知父组件“设置按钮被点击”，是否打开抽屉由 HomeView 决定。
const emit = defineEmits<{
  'open-settings': []
}>()

// 如果 logo.png 缺失或格式损坏，就显示 BaiMeow 的首字母作为兜底，避免页面空白。
const logoLoadFailed = ref(false)
</script>

<template>
  <header class="app-header">
    <!-- 品牌区从左到右依次是 Logo、网站名和简短定位。 -->
    <div class="brand-area">
      <div class="logo-box">
        <img
          v-if="!logoLoadFailed"
          :src="logoUrl"
          alt="BaiMeow 网站 Logo"
          class="brand-logo"
          @error="logoLoadFailed = true"
        />
        <span v-else class="logo-fallback">B</span>
      </div>

      <div class="brand-copy">
        <h1>BaiMeow</h1>
        <p>轻量、安静、专注的在线工具集合</p>
      </div>
    </div>

    <!-- 设置按钮只显示图标，鼠标悬停时由 Element Plus 提供名称提示。 -->
    <el-tooltip content="网站设置" placement="bottom">
      <el-button
        class="settings-button"
        circle
        aria-label="打开网站设置"
        @click="emit('open-settings')"
      >
        <el-icon :size="20"><Setting /></el-icon>
      </el-button>
    </el-tooltip>
  </header>
</template>

<style scoped>
/* 品牌栏自身只负责内部横向排版，外层的白色容器由 HomeView 提供。 */
.app-header {
  min-height: 72px;
  padding: 11px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

/* 品牌区域允许名称在小屏幕上正常收缩。 */
.brand-area {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Logo 容器固定尺寸，确保用户替换不同长宽比的图片时布局不会跳动。 */
.logo-box {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--bm-primary-soft);
  border: 1px solid var(--bm-border-strong);
  border-radius: 13px;
}

/* object-fit: cover 会让非正方形图片保持比例并铺满容器。 */
.brand-logo {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

/* 图片读取失败时的文字兜底。 */
.logo-fallback {
  color: var(--bm-primary);
  font-family: Georgia, serif;
  font-size: 26px;
  font-weight: 700;
}

.brand-copy {
  min-width: 0;
}

/* 网站名使用真实的 h1，方便搜索引擎和阅读器理解页面主体。 */
.brand-copy h1 {
  margin: 0;
  color: var(--bm-text-strong);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.1;
}

/* 副标题只承担少量解释作用，因此字号较小且颜色更淡。 */
.brand-copy p {
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--bm-text-muted);
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 设置按钮固定为圆形，切换主题时颜色由 CSS 变量决定。 */
.settings-button {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  color: var(--bm-text);
  background: var(--bm-surface-soft);
  border-color: var(--bm-border-strong);
}

/* 悬停时轻微抬升，提供清晰的交互反馈。 */
.settings-button:hover {
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-color: var(--bm-primary);
  transform: translateY(-1px);
}

/* 手机端缩小 Logo 和标题，避免品牌名与设置按钮互相挤压。 */
@media (max-width: 560px) {
  .app-header {
    min-height: 64px;
    padding: 10px 12px;
  }

  .logo-box {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
    border-radius: 11px;
  }

  .brand-copy h1 {
    font-size: 21px;
  }

  .brand-copy p {
    max-width: 190px;
    font-size: 11px;
  }
}
</style>
