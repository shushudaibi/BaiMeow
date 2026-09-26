<!--
  NoticeBar.vue 是顶部细滚动公告。
  公告内容复制两份并连续偏移动画，第一份移出后第二份会无缝接上。
-->
<script setup lang="ts">
import { Bell } from '@element-plus/icons-vue'

// 后续接入接口后，只需要把接口数据赋值给这个数组。
const announcements = [
  'PDF 工作台包含四类十五项工具，每个工具都提供处理前后效果预览。',
  'PDF 加载、页面选择与合并由 pdfuse-core 完成。',
  '大文件处理进入 Web Worker，所有文件仍只在本地浏览器中处理。',
  '图片水印功能正在设计，将在后续版本开放。',
]
</script>

<template>
  <!-- aria-live 让屏幕阅读器知道这里包含动态公告。 -->
  <div class="notice-bar" aria-live="polite">
    <div class="notice-label">
      <el-icon :size="15"><Bell /></el-icon>
      <span>公告</span>
    </div>

    <!-- 公告轨道在鼠标悬停时会暂停，方便用户读完较长内容。 -->
    <div class="notice-viewport">
      <div class="notice-track">
        <div v-for="copyIndex in 2" :key="copyIndex" class="notice-copy">
          <span
            v-for="(announcement, index) in announcements"
            :key="`${copyIndex}-${index}`"
            class="notice-item"
          >
            {{ announcement }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  公告高度保持约 36px，符合“公告细一点”的要求。
  border-top 只做层级分隔，不使用厚重背景。
*/
.notice-bar {
  min-height: 36px;
  display: flex;
  align-items: stretch;
  background: var(--bm-notice-bg);
  border-top: 1px solid var(--bm-border);
}

/* 左侧标签固定宽度，右侧文字滚动时有明确锚点。 */
.notice-label {
  padding: 0 13px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-right: 1px solid var(--bm-border);
  font-size: 12px;
  font-weight: 700;
}

/* 溢出隐藏是滚动公告的必要条件。 */
.notice-viewport {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
}

/* 轨道宽度由内容决定，动画会让它不断向左移动。 */
.notice-track {
  width: max-content;
  display: flex;
  align-items: center;
  animation: notice-scroll 30s linear infinite;
}

/* 鼠标悬停时暂停，离开后继续滚动。 */
.notice-viewport:hover .notice-track {
  animation-play-state: paused;
}

/* 每个副本都把公告横向排列，两份副本共同形成循环。 */
.notice-copy {
  display: flex;
  align-items: center;
}

/* 每条公告之间使用间隔和竖线分隔，阅读时不会粘连。 */
.notice-item {
  position: relative;
  padding: 0 30px;
  color: var(--bm-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.notice-item::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 0;
  width: 1px;
  height: 11px;
  background: var(--bm-border-strong);
  transform: translateY(-50%);
}

/*
  移动一半宽度后立刻从头开始。
  因为轨道内有两份完全相同的内容，所以视觉上没有跳变。
*/
@keyframes notice-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

/* 用户如果开启“减少动态效果”，公告停止滚动并允许横向滑动查看。 */
@media (prefers-reduced-motion: reduce) {
  .notice-track {
    animation: none;
  }

  .notice-viewport {
    overflow-x: auto;
  }
}

@media (max-width: 560px) {
  .notice-label {
    padding: 0 10px;
  }

  .notice-label span {
    display: none;
  }
}
</style>
