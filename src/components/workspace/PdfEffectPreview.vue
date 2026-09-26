<!--
  PdfEffectPreview.vue 为每个 PDF 工具提供统一的“处理前 / 处理后”效果预览。

  它不是独立工具，而是工作台的公共结果区域：
  - 处理前显示原始 PDF，合并模式可以切换多个输入文件；
  - 处理后显示工具生成的 PDF 或 PNG；
  - Excel、文本信息等不能画面预览的结果会给出明确说明。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Operation, View } from '@element-plus/icons-vue'
import PdfPreview from '@/components/workspace/PdfPreview.vue'
import type { PdfToolResult } from '@/types/pdf'

// 处理前文件列表；合并时可以有多个文件。
const props = defineProps<{
  sources: File[]
  result: PdfToolResult | null
  beforePage: number
}>()

const emit = defineEmits<{
  'update:beforePage': [page: number]
}>()

// 0 表示处理前，1 表示处理后。
const activeSide = ref<0 | 1>(0)

// 合并模式下选择要查看的原始文件。
const selectedSourceIndex = ref(0)

// 处理后的 PDF 使用独立页码状态，避免影响处理前预览。
const afterPage = ref(1)

// PNG 结果需要 Object URL 才能交给 img 渲染。
const resultImageUrl = ref('')

// 当前选择的处理前文件。
const currentSource = computed(() => props.sources[selectedSourceIndex.value] ?? props.sources[0])

/**
 * 判断处理结果是否可以画面预览。
 * PDF 使用页面渲染，PNG 使用图片标签，Excel 暂不支持画面预览。
 */
const resultPreviewKind = computed<'pdf' | 'image' | 'table' | 'none'>(() => {
  if (!props.result || props.result.kind !== 'file') return 'none'

  const blob = props.result.blob
  const filename = props.result.filename.toLowerCase()

  if (props.result.previewRows?.length) {
    return 'table'
  }

  if (blob.type === 'application/pdf' || filename.endsWith('.pdf')) {
    return 'pdf'
  }

  if (blob.type === 'image/png' || filename.endsWith('.png')) {
    return 'image'
  }

  return 'none'
})

// 只有结果可预览时，“处理后”标签才允许切换。
const canPreviewAfter = computed(() => resultPreviewKind.value !== 'none')

/**
 * 管理 PNG Object URL 的生命周期。
 * 旧的 URL 必须及时释放，避免连续处理多个页面时占用内存。
 */
function syncResultImageUrl() {
  if (resultImageUrl.value) {
    URL.revokeObjectURL(resultImageUrl.value)
    resultImageUrl.value = ''
  }

  if (props.result?.kind === 'file' && resultPreviewKind.value === 'image') {
    resultImageUrl.value = URL.createObjectURL(props.result.blob)
  }
}

// 文件列表变化后，确保当前选择的索引仍然有效。
watch(
  () => props.sources,
  () => {
    selectedSourceIndex.value = 0
  },
)

// 结果变化后自动切到“处理后”；无画面预览时保持“处理前”。
watch(
  () => props.result,
  () => {
    syncResultImageUrl()
    activeSide.value = canPreviewAfter.value ? 1 : 0
    afterPage.value = 1
  },
  { immediate: true },
)

// 组件卸载时释放图片链接。
onBeforeUnmount(() => {
  if (resultImageUrl.value) {
    URL.revokeObjectURL(resultImageUrl.value)
  }
})
</script>

<template>
  <section class="effect-preview">
    <header class="effect-heading">
      <div class="effect-title">
        <el-icon :size="17"><Operation /></el-icon>
        <div>
          <strong>效果预览</strong>
          <small>同一区域对照处理前后结果</small>
        </div>
      </div>

      <!-- 两个标签是互斥的视图切换，不使用独立菜单入口。 -->
      <div class="preview-tabs" role="tablist" aria-label="处理效果预览">
        <button
          type="button"
          role="tab"
          :aria-selected="activeSide === 0"
          :class="{ active: activeSide === 0 }"
          @click="activeSide = 0"
        >
          处理前
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeSide === 1"
          :class="{ active: activeSide === 1 }"
          :disabled="!canPreviewAfter"
          @click="activeSide = 1"
        >
          处理后
        </button>
      </div>
    </header>

    <!-- 处理前视图 -->
    <div v-if="activeSide === 0" class="preview-pane">
      <!-- 合并等场景提供输入文件切换，而不是把多个 PDF 叠在一起。 -->
      <div v-if="sources.length > 1" class="source-switcher">
        <button
          v-for="(source, index) in sources"
          :key="`${source.name}-${source.lastModified}`"
          type="button"
          :class="{ active: selectedSourceIndex === index }"
          @click="selectedSourceIndex = index"
        >
          {{ index + 1 }}. {{ source.name }}
        </button>
      </div>

      <PdfPreview
        v-if="currentSource"
        :key="`before-${currentSource.name}-${currentSource.lastModified}-${selectedSourceIndex}`"
        :source="currentSource"
        :current-page="beforePage"
        @update:current-page="emit('update:beforePage', $event)"
      />
    </div>

    <!-- 处理后的 PDF -->
    <div v-else-if="resultPreviewKind === 'pdf' && result?.kind === 'file'" class="preview-pane">
      <PdfPreview
        :key="`after-pdf-${result.filename}`"
        :source="result.blob"
        :current-page="afterPage"
        @update:current-page="afterPage = $event"
      />
    </div>

    <!-- 处理后的 PNG -->
    <div
      v-else-if="resultPreviewKind === 'image' && resultImageUrl"
      class="preview-pane image-pane"
    >
      <img :src="resultImageUrl" alt="PDF 页面导出后的图片预览" />
    </div>

    <!-- Excel 课表使用二维表格预览，帮助用户在下载前检查识别结果。 -->
    <div
      v-else-if="resultPreviewKind === 'table' && result?.kind === 'file'"
      class="preview-pane table-pane"
    >
      <div class="table-scroll">
        <table>
          <tbody>
            <tr v-for="(row, rowIndex) in result.previewRows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>展示前 50 行识别结果，完整内容以下载的 Excel 文件为准。</p>
    </div>

    <!-- Excel 等结果无法画面预览。 -->
    <div v-else class="preview-unavailable">
      <el-icon :size="28"><View /></el-icon>
      <strong>当前结果不支持页面预览</strong>
      <span>Excel 等数据文件可以在处理完成后直接下载并打开。</span>
    </div>
  </section>
</template>

<style scoped>
/* 效果预览与参数区保持统一背景和边框。 */
.effect-preview {
  margin-top: 14px;
  overflow: hidden;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 10px;
}

.effect-heading {
  min-height: 46px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: var(--bm-surface);
  border-bottom: 1px solid var(--bm-border);
}

.effect-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bm-primary);
}

.effect-title div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.effect-title strong {
  color: var(--bm-text-strong);
  font-size: 11px;
}

.effect-title small {
  color: var(--bm-text-faint);
  font-size: 8px;
}

/* 标签使用分段按钮，当前状态清晰且占用空间小。 */
.preview-tabs {
  padding: 3px;
  display: flex;
  gap: 2px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 7px;
}

.preview-tabs button {
  min-height: 26px;
  padding: 0 11px;
  color: var(--bm-text-muted);
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
}

.preview-tabs button:hover:not(:disabled) {
  color: var(--bm-text-strong);
}

.preview-tabs button.active {
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
}

.preview-tabs button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.preview-pane {
  min-width: 0;
}

/* 多文件切换条可以横向滚动，文件名不会挤压预览区域。 */
.source-switcher {
  padding: 9px 10px 0;
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.source-switcher button {
  max-width: 220px;
  padding: 5px 8px;
  overflow: hidden;
  flex: 0 0 auto;
  color: var(--bm-text-muted);
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-switcher button.active {
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-color: var(--bm-primary-border);
}

/* PNG 预览限制最大高度，保持工作台布局稳定。 */
.image-pane {
  min-height: 260px;
  max-height: 620px;
  padding: 16px;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.image-pane img {
  max-width: 100%;
  height: auto;
  display: block;
  background: #fff;
  box-shadow: 0 6px 20px rgba(20, 30, 28, 0.14);
}

.preview-unavailable {
  min-height: 180px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--bm-text-faint);
  text-align: center;
}

.preview-unavailable strong {
  color: var(--bm-text-strong);
  font-size: 12px;
}

.preview-unavailable span {
  max-width: 360px;
  font-size: 9px;
  line-height: 1.6;
}

/* 表格预览与页面预览使用相同最大高度，内部滚动不撑高工作台。 */
.table-pane {
  max-height: 620px;
  padding: 12px;
  overflow: hidden;
}

.table-scroll {
  max-height: 540px;
  overflow: auto;
  border: 1px solid var(--bm-border);
  border-radius: 7px;
}

.table-pane table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  background: var(--bm-surface);
  table-layout: auto;
}

.table-pane td {
  min-width: 90px;
  padding: 6px 8px;
  color: var(--bm-text);
  border-right: 1px solid var(--bm-border);
  border-bottom: 1px solid var(--bm-border);
  font-size: 9px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.table-pane p {
  margin: 8px 2px 0;
  color: var(--bm-text-faint);
  font-size: 8px;
}

@media (max-width: 560px) {
  .effect-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .preview-tabs {
    width: 100%;
  }

  .preview-tabs button {
    flex: 1;
  }
}
</style>
