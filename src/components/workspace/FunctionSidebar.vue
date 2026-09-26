<!--
  FunctionSidebar.vue 是三级功能菜单。

  层级结构：
  1. PDF 文件处理 / 图片处理；
  2. 常用功能、页面管理、内容与版式、信息与导出；
  3. 具体工具按钮。

  PDF 顶层默认展开，二级分类中只默认展开“常用功能”，
  页面管理、内容与版式、信息与导出首次进入时保持收起。
-->
<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, Document, Picture } from '@element-plus/icons-vue'
import { PDF_TOOL_CATEGORIES } from '@/config/pdf-tools'
import type { ToolKey } from '@/types/pdf'

// 接收当前工具，保证菜单高亮与工作台内容保持同步。
const props = defineProps<{
  activeTool: ToolKey
}>()

// 工具按钮只向页面发送 key，不直接修改父组件状态。
const emit = defineEmits<{
  'select-tool': [tool: ToolKey]
}>()

// PDF 顶层默认展开。
const expandedGroups = ref<Set<string>>(new Set(['pdf']))

// 二级分类只默认展开“常用功能”，其他分类由用户按需展开。
const expandedCategories = ref<Set<string>>(new Set(['common']))

/**
 * 通用展开切换函数。
 * 每次创建新的 Set 再赋值，确保 Vue 能检测到集合变化并刷新界面。
 */
function toggleSetValue(target: Set<string>, value: string): Set<string> {
  const nextValue = new Set(target)

  if (nextValue.has(value)) {
    nextValue.delete(value)
  } else {
    nextValue.add(value)
  }

  return nextValue
}

function toggleGroup(groupKey: string) {
  expandedGroups.value = toggleSetValue(expandedGroups.value, groupKey)
}

function toggleCategory(categoryKey: string) {
  expandedCategories.value = toggleSetValue(expandedCategories.value, categoryKey)
}

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
        <p>常用功能与细分工具</p>
      </div>
    </div>

    <nav class="tool-nav" aria-label="功能菜单">
      <!-- PDF 顶层分组 -->
      <section class="tool-group">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="expandedGroups.has('pdf')"
          @click="toggleGroup('pdf')"
        >
          <span class="group-icon">
            <el-icon :size="18"><Document /></el-icon>
          </span>

          <span class="group-copy">
            <strong>PDF 文件处理</strong>
            <small>预览、组织、编辑与导出</small>
          </span>

          <el-icon class="group-arrow" :class="{ expanded: expandedGroups.has('pdf') }" :size="14">
            <ArrowRight />
          </el-icon>
        </button>

        <!-- PDF 三级菜单。每个分类本身也是可独立收起的按钮。 -->
        <div v-show="expandedGroups.has('pdf')" class="category-list">
          <section
            v-for="category in PDF_TOOL_CATEGORIES"
            :key="category.key"
            class="tool-category"
          >
            <button
              type="button"
              class="category-toggle"
              :aria-expanded="expandedCategories.has(category.key)"
              @click="toggleCategory(category.key)"
            >
              <span class="category-icon">
                <el-icon :size="15"><component :is="category.icon" /></el-icon>
              </span>

              <span class="category-copy">
                <strong>{{ category.label }}</strong>
                <small>{{ category.description }}</small>
              </span>

              <el-icon
                class="category-arrow"
                :class="{ expanded: expandedCategories.has(category.key) }"
                :size="12"
              >
                <ArrowRight />
              </el-icon>
            </button>

            <div v-show="expandedCategories.has(category.key)" class="category-items">
              <button
                v-for="tool in category.tools"
                :key="tool.key"
                type="button"
                class="tool-item"
                :class="{ active: props.activeTool === tool.key }"
                @click="selectTool(tool.key)"
              >
                <el-icon :size="15"><component :is="tool.icon" /></el-icon>

                <span class="tool-item-copy">
                  <span>{{ tool.label }}</span>
                  <small>{{ tool.description }}</small>
                </span>
              </button>
            </div>
          </section>
        </div>
      </section>

      <!-- 图片处理顶层分组，当前只保留水印入口。 -->
      <section class="tool-group image-group">
        <button
          type="button"
          class="group-toggle"
          :aria-expanded="expandedGroups.has('image')"
          @click="toggleGroup('image')"
        >
          <span class="group-icon image-icon">
            <el-icon :size="18"><Picture /></el-icon>
          </span>

          <span class="group-copy">
            <strong>图片处理</strong>
            <small>图片视觉工具</small>
          </span>

          <el-icon
            class="group-arrow"
            :class="{ expanded: expandedGroups.has('image') }"
            :size="14"
          >
            <ArrowRight />
          </el-icon>
        </button>

        <div v-show="expandedGroups.has('image')" class="category-list image-tools">
          <button
            type="button"
            class="tool-item"
            :class="{ active: props.activeTool === 'watermark' }"
            @click="selectTool('watermark')"
          >
            <el-icon :size="15"><Picture /></el-icon>
            <span class="tool-item-copy">
              <span>图片水印处理</span>
              <small>功能预留，暂未开放</small>
            </span>
            <span class="coming-tag">待开放</span>
          </button>
        </div>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
/* 侧栏是独立表面容器，与工作台、广告栏形成三栏布局。 */
.function-sidebar {
  padding: 16px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 12px;
  box-shadow: var(--bm-shadow-soft);
}

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

.tool-group + .tool-group {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--bm-border);
}

/* 一级分组按钮 */
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

.image-icon {
  color: var(--bm-accent);
  background: var(--bm-accent-soft);
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

.group-arrow,
.category-arrow {
  flex: 0 0 auto;
  color: var(--bm-text-faint);
  transition: transform 0.2s ease;
}

.group-arrow.expanded,
.category-arrow.expanded {
  transform: rotate(90deg);
}

/* 二级分类列表保留左侧层级线。 */
.category-list {
  margin: 5px 0 0 16px;
  padding-left: 10px;
  border-left: 1px solid var(--bm-border-strong);
}

/* 分类按钮比一级按钮更紧凑，但仍保证可点击高度。 */
.category-toggle {
  width: 100%;
  min-height: 40px;
  padding: 5px 6px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--bm-text-muted);
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}

.category-toggle:hover {
  color: var(--bm-text-strong);
  background: var(--bm-surface-soft);
}

.category-icon {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-radius: 7px;
}

.category-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.category-copy strong {
  color: var(--bm-text-strong);
  font-size: 11px;
}

.category-copy small {
  overflow: hidden;
  color: var(--bm-text-faint);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 具体工具列表再缩进一层。 */
.category-items {
  margin: 4px 0 6px 13px;
  padding-left: 8px;
  display: grid;
  gap: 4px;
  border-left: 1px dashed var(--bm-border-strong);
}

.tool-item {
  width: 100%;
  min-height: 38px;
  padding: 5px 7px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--bm-text-muted);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}

.tool-item:hover {
  color: var(--bm-text-strong);
  background: var(--bm-surface-soft);
}

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
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-item-copy small {
  overflow: hidden;
  color: var(--bm-text-faint);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coming-tag {
  padding: 2px 5px;
  flex: 0 0 auto;
  color: var(--bm-accent);
  background: var(--bm-accent-soft);
  border-radius: 4px;
  font-size: 9px;
}

/* 图片处理只有单个工具，不需要像 PDF 分类一样保留额外间距。 */
.image-tools {
  padding-top: 4px;
}

/* 中屏下侧栏变成整行，PDF 的四个分类可以并排展示。 */
@media (min-width: 761px) and (max-width: 1180px) {
  .category-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    border-left: 0;
  }
}

/* 手机端恢复普通纵向三级菜单。 */
@media (max-width: 760px) {
  .function-sidebar {
    padding: 13px;
  }

  .category-list {
    display: block;
    border-left: 1px solid var(--bm-border-strong);
  }
}
</style>
