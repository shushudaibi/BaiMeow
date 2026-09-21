<!--
  AdvertPanel.vue 是右侧广告区。
  当前按照需求使用文字代替用户投稿图片，后续只需把文字区域换成 img 即可。
-->
<script setup lang="ts">
import { Picture, Promotion } from '@element-plus/icons-vue'
</script>

<template>
  <aside class="advert-panel">
    <div class="advert-heading">
      <span>广告区</span>
      <small>USER POST</small>
    </div>

    <!-- 主广告位保留固定宽高比例，图片加载后不会引起页面布局跳动。 -->
    <article class="main-advert">
      <div class="advert-image-placeholder">
        <el-icon :size="30"><Picture /></el-icon>
        <span>用户投稿图片位</span>
      </div>

      <div class="advert-copy">
        <span class="advert-label">来自用户投稿</span>
        <h2>把复杂任务，变成简单几步</h2>
        <p>这里暂时显示文字内容，后续可直接替换为用户提交的图片。</p>
      </div>
    </article>

    <!-- 第二个小广告位用于展示公告合作或站内推荐。 -->
    <article class="secondary-advert">
      <span class="secondary-icon">
        <el-icon :size="17"><Promotion /></el-icon>
      </span>
      <div>
        <strong>内容投稿通道</strong>
        <p>优质工具与学习经验可在这里展示</p>
      </div>
    </article>
  </aside>
</template>

<style scoped>
/* 广告栏与工作台采用相同表面变量，视觉风格保持一致。 */
.advert-panel {
  padding: 13px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 12px;
  box-shadow: var(--bm-shadow-soft);
}

/* 标题栏使用两端对齐，右侧英文只作为视觉索引。 */
.advert-heading {
  padding: 2px 2px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--bm-border);
}

.advert-heading span {
  color: var(--bm-text-strong);
  font-size: 13px;
  font-weight: 700;
}

.advert-heading small {
  color: var(--bm-text-faint);
  font-size: 9px;
  font-weight: 700;
}

/* 主广告卡片纵向排列，文字不会覆盖图片占位区。 */
.main-advert {
  margin-top: 12px;
  overflow: hidden;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 10px;
}

/* 使用 aspect-ratio 预留图片比例，替换真实图片时不会造成卡片高度突变。 */
.advert-image-placeholder {
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-bottom: 1px solid var(--bm-border);
}

.advert-image-placeholder span {
  font-size: 11px;
  font-weight: 700;
}

/* 广告文案区域保持紧凑，不抢占工具使用面积。 */
.advert-copy {
  padding: 13px;
}

.advert-label {
  color: var(--bm-accent);
  font-size: 10px;
  font-weight: 700;
}

.advert-copy h2 {
  margin: 7px 0 6px;
  color: var(--bm-text-strong);
  font-size: 16px;
  line-height: 1.35;
}

.advert-copy p {
  margin: 0;
  color: var(--bm-text-muted);
  font-size: 11px;
  line-height: 1.6;
}

/* 次级广告使用横向布局，信息密度更高。 */
.secondary-advert {
  margin-top: 10px;
  padding: 11px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bm-accent-soft);
  border: 1px solid var(--bm-accent-border);
  border-radius: 9px;
}

.secondary-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  color: var(--bm-accent);
  background: var(--bm-surface);
  border-radius: 8px;
}

.secondary-advert strong {
  display: block;
  color: var(--bm-text-strong);
  font-size: 11px;
}

.secondary-advert p {
  margin: 3px 0 0;
  color: var(--bm-text-muted);
  font-size: 9px;
  line-height: 1.4;
}

/* 中等屏幕广告区移到工作区下方时，主广告改为横向内容，减少纵向高度。 */
@media (min-width: 761px) and (max-width: 1180px) {
  .advert-panel {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(220px, 0.7fr);
    gap: 14px;
    align-items: stretch;
  }

  .advert-heading {
    width: 96px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    border-right: 1px solid var(--bm-border);
    border-bottom: 0;
  }

  .main-advert,
  .secondary-advert {
    margin-top: 0;
  }

  .main-advert {
    display: grid;
    grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1fr);
  }

  .advert-image-placeholder {
    aspect-ratio: auto;
    min-height: 150px;
    border-right: 1px solid var(--bm-border);
    border-bottom: 0;
  }
}
</style>
