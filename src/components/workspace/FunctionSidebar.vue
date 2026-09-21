<!--
  FunctionSidebar.vue 是功能选择区。
  PDF 分组默认展开，图片分组默认收起；点击菜单项后向父组件发送 ToolKey。
-->
<script setup lang="ts">
import { ref, type Component } from 'vue'
import { ArrowRight, Connection, Document, Grid, Picture, Scissor } from '@element-plus/icons-vue'
import type { ToolKey } from '@/types/pdf'

// 使用 props 接收当前工具，确保菜单高亮与工作区内容同步。
const props = defineProps<{
  activeTool: ToolKey
}>()

// 仅发送工具名称，具体切换逻辑由页面负责。
const emit = defineEmits<{
  'select-tool': [tool: ToolKey]
}>()

// 内部菜单项的完整数据结构。
interface ToolItem {
  key: ToolKey
  label: string
  description: string
  icon: Component
  comingSoon?: boolean
}

// 分组结构让菜单可以继续增加“文本处理”“转换工具”等分类。
interface ToolGroup {
  key: 'pdf' | 'image'
  label: string
  description: string
  icon: Component
  tools: ToolItem[]
}

// 菜单配置与模板分离，后续新增功能只需要增加一个对象。
const toolGroups: ToolGroup[] = [
  {
    key: 'pdf',
    label: 'PDF 文件处理',
    description: '拆分、合并与表格转换',
    icon: Document,
    tools: [
      {
        key: 'split',
        label: 'PDF 拆分',
        description: '按页码范围提取页面',
        icon: Scissor,
      },
      {
        key: 'merge',
        label: 'PDF 合并',
        description: '按顺序组合多个文档',
        icon: Connection,
      },
      {
        key: 'schedule',
        label: 'PDF 课表转 Excel',
        description: '提取文字型课表',
        icon: Grid,
      },
    ],
  },
  {
    key: 'image',
    label: '图片处理',
    description: '图片视觉工具',
    icon: Picture,
    tools: [
      {
        key: 'watermark',
        label: '图片水印处理',
        description: '功能预留，暂未开放',
        icon: Picture,
        comingSoon: true,
      },
    ],
  },
]

// PDF 默认展开；Set 便于之后增加更多展开分组。
const expandedGroups = ref<Set<string>>(new Set(['pdf']))

/**
 * 展开或收起指定分组。
 * 使用 Set 的 has/add/delete 方法，避免重复添加同一分组。
 */
function toggleGroup(groupKey: string) {
  const nextGroups = new Set(expandedGroups.value)

  if (nextGroups.has(groupKey)) {
    nextGroups.delete(groupKey)
  } else {
    nextGroups.add(groupKey)
  }

  expandedGroups.value = nextGroups
}

// 把用户选择交给父组件。水印功能也可以进入，工作区会展示“暂未开放”。
function selectTool(toolKey: ToolKey) {
  emit('select-tool', toolKey)
}
</script>

<template>
  <aside class="function-sidebar">
    <div class="sidebar-heading">
      <span class="heading-index">01</span>
      <div>
        <h2>功能选择</h2>
        <p>选择一个处理工具</p>
      </div>
    </div>

    <!-- 使用自定义折叠菜单，方便精细控制分组标题和二级项目样式。 -->
    <nav class="tool-nav" aria-label="功能菜单">
      <section v-for="group in toolGroups" :key="group.key" class="tool-group">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="expandedGroups.has(group.key)"
          @click="toggleGroup(group.key)"
        >
          <span class="group-icon">
            <el-icon :size="18"><component :is="group.icon" /></el-icon>
          </span>

          <span class="group-copy">
            <strong>{{ group.label }}</strong>
            <small>{{ group.description }}</small>
          </span>

          <el-icon
            class="group-arrow"
            :class="{ expanded: expandedGroups.has(group.key) }"
            :size="14"
          >
            <ArrowRight />
          </el-icon>
        </button>

        <!-- v-show 保留子项 DOM，展开收起时不会重新创建按钮。 -->
        <div v-show="expandedGroups.has(group.key)" class="tool-items">
          <button
            v-for="tool in group.tools"
            :key="tool.key"
            type="button"
            class="tool-item"
            :class="{ active: props.activeTool === tool.key }"
            @click="selectTool(tool.key)"
          >
            <el-icon :size="16"><component :is="tool.icon" /></el-icon>

            <span class="tool-item-copy">
              <span>{{ tool.label }}</span>
              <small>{{ tool.description }}</small>
            </span>

            <span v-if="tool.comingSoon" class="coming-tag">待开放</span>
          </button>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
/* 侧栏是独立表面容器，与中间工作台和右侧广告形成平行关系。 */
.function-sidebar {
  padding: 16px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 12px;
  box-shadow: var(--bm-shadow-soft);
}

/* 标题区使用序号和小标题，让功能够清晰但不过度装饰。 */
.sidebar-heading {
  padding: 2px 2px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-bottom: 1px solid var(--bm-border);
}

.heading-index {
  color: var(--bm-accent);
  font-family: Georgia, serif;
  font-size: 12px;
  font-weight: 700;
}

.sidebar-heading h2 {
  margin: 0;
  color: var(--bm-text-strong);
  font-size: 15px;
  line-height: 1.2;
}

.sidebar-heading p {
  margin: 4px 0 0;
  color: var(--bm-text-faint);
  font-size: 11px;
  line-height: 1.2;
}

.tool-nav {
  margin-top: 12px;
}

/* 分组之间留出明确间距，方便快速扫描。 */
.tool-group + .tool-group {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--bm-border);
}

/* 一级分组按钮铺满宽度，并保持可点击区域至少 48px。 */
.group-toggle {
  width: 100%;
  min-height: 48px;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--bm-text);
  background: transparent;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  text-align: left;
}

.group-toggle:hover {
  background: var(--bm-surface-soft);
}

/* 分组图标使用浅色方块承载，增强层级。 */
.group-icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-radius: 8px;
}

.group-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-copy strong {
  color: var(--bm-text-strong);
  font-size: 13px;
  font-weight: 700;
}

.group-copy small {
  overflow: hidden;
  color: var(--bm-text-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 箭头默认指向右侧，展开后旋转 90 度指向下方。 */
.group-arrow {
  flex: 0 0 auto;
  color: var(--bm-text-faint);
  transition: transform 0.2s ease;
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

/* 二级项目向右缩进，并在左侧保留层级线。 */
.tool-items {
  margin: 5px 0 0 16px;
  padding-left: 12px;
  display: grid;
  gap: 5px;
  border-left: 1px solid var(--bm-border-strong);
}

/* 二级菜单按钮使用紧凑的 42px 高度，适合频繁切换。 */
.tool-item {
  width: 100%;
  min-height: 42px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bm-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.tool-item:hover {
  color: var(--bm-text-strong);
  background: var(--bm-surface-soft);
}

/* 当前工具使用主题色边框与浅色背景，状态非常明确。 */
.tool-item.active {
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-color: var(--bm-primary-border);
}

.tool-item-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tool-item-copy > span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-item-copy small {
  overflow: hidden;
  color: var(--bm-text-faint);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* “待开放”标签让用户明确知道这是预留功能。 */
.coming-tag {
  padding: 2px 5px;
  flex: 0 0 auto;
  color: var(--bm-accent);
  background: var(--bm-accent-soft);
  border-radius: 4px;
  font-size: 9px;
}

/* 在平板横向排列时，侧栏能够自然占满整行。 */
@media (max-width: 760px) {
  .function-sidebar {
    padding: 13px;
  }

  .tool-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .tool-group + .tool-group {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

/* 很窄的手机上恢复单列菜单，避免文字被压缩到不可读。 */
@media (max-width: 480px) {
  .tool-nav {
    grid-template-columns: 1fr;
  }

  .tool-group + .tool-group {
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--bm-border);
  }
}
</style>
