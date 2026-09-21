<!--
  HomeView.vue 是网站首页，也是页面级组件。
  它只负责“组合”各个业务组件，不直接处理 PDF 逻辑或评论逻辑，
  这样后续单独修改顶部、侧栏或工作区时，不会互相影响。
-->
<script setup lang="ts">
import { ref } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import NoticeBar from '@/components/layout/NoticeBar.vue'
import FunctionSidebar from '@/components/workspace/FunctionSidebar.vue'
import PdfWorkspace from '@/components/workspace/PdfWorkspace.vue'
import AdvertPanel from '@/components/workspace/AdvertPanel.vue'
import CommentSection from '@/components/workspace/CommentSection.vue'
import ThemeSettingsDrawer from '@/components/settings/ThemeSettingsDrawer.vue'
import type { ToolKey } from '@/types/pdf'

// 当前选中的功能键。默认打开 PDF 拆分，与左侧菜单默认展开 PDF 分组保持一致。
const activeTool = ref<ToolKey>('split')

// 控制右侧设置抽屉是否显示。
const settingsVisible = ref(false)
</script>

<template>
  <div class="site-page">
    <!--
      顶部主容器：品牌栏和滚动公告放在同一块视觉面板中。
      两块内容有共同宽度和圆角，因此看起来是一体式页头。
    -->
    <section class="top-panel">
      <AppHeader @open-settings="settingsVisible = true" />
      <NoticeBar />
    </section>

    <main class="page-main">
      <!--
        工作区使用三栏布局：
        左侧功能选择、中间实际工具、右侧广告展示。
      -->
      <section class="workspace-layout">
        <FunctionSidebar :active-tool="activeTool" @select-tool="(tool) => (activeTool = tool)" />

        <div class="workspace-column">
          <PdfWorkspace :active-tool="activeTool" @select-tool="(tool) => (activeTool = tool)" />
        </div>

        <AdvertPanel />
      </section>

      <!-- 评论区域放在工具区与广告区下方，形成完整的内容闭环。 -->
      <CommentSection />
    </main>

    <footer class="site-footer">
      <span>BaiMeow</span>
      <span>本地处理，文件不会离开你的浏览器</span>
    </footer>

    <!-- 设置抽屉由页面统一管理，避免设置按钮和抽屉之间产生复杂依赖。 -->
    <ThemeSettingsDrawer v-model="settingsVisible" />
  </div>
</template>

<style scoped>
/* 页面整体只提供背景和最小高度，不限制内容组件自身的宽度。 */
.site-page {
  min-height: 100vh;
  background: var(--bm-bg);
  color: var(--bm-text);
}

/* 顶部面板固定在内容最大宽度内，避免在大屏上无限拉伸。 */
.top-panel {
  width: min(1480px, calc(100% - 32px));
  margin: 16px auto 0;
  overflow: hidden;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 14px;
  box-shadow: var(--bm-shadow-soft);
}

/* 主体内容与顶部面板保持同一条左右边线。 */
.page-main {
  width: min(1480px, calc(100% - 32px));
  margin: 18px auto 0;
}

/*
  三栏网格：侧栏固定 236px，广告栏固定 310px，中间工作区自动占满剩余空间。
  minmax(0, 1fr) 可以防止内部长文件名把网格撑出容器。
*/
.workspace-layout {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr) 310px;
  gap: 18px;
  align-items: start;
}

/* 中间工作区的最小宽度设为 0，确保拖拽区能够正常响应式收缩。 */
.workspace-column {
  min-width: 0;
}

/* 页脚采用低调排版，只保留品牌与隐私说明。 */
.site-footer {
  width: min(1480px, calc(100% - 32px));
  margin: 22px auto 0;
  padding: 0 4px 26px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
  color: var(--bm-text-faint);
  font-size: 13px;
}

/* 中等屏幕下，广告区移到工作区下方，避免中间工作区被压缩得过窄。 */
@media (max-width: 1180px) {
  .workspace-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .workspace-layout > :last-child {
    grid-column: 1 / -1;
  }
}

/* 平板与手机下改为单列，功能侧栏和广告区按自然顺序排列。 */
@media (max-width: 760px) {
  .top-panel,
  .page-main,
  .site-footer {
    width: min(100% - 20px, 1480px);
  }

  .top-panel {
    margin-top: 10px;
    border-radius: 11px;
  }

  .page-main {
    margin-top: 12px;
  }

  .workspace-layout {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .workspace-layout > :last-child {
    grid-column: auto;
  }

  .site-footer {
    flex-direction: column;
    gap: 4px;
    padding-bottom: 18px;
  }
}
</style>
