<!--
  PdfPreview.vue 使用 pdfuse-core/preview 渲染缩略图和当前页大图。

  大文档会限制缩略图数量，避免一次创建过多 canvas 导致内存占用过高；
  当前页大图始终可以继续翻页查看。
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, View } from '@element-plus/icons-vue'
import type { PDFDocumentProxy } from 'pdfuse-core/preview'
import { loadPdfPreview, renderPdfPage } from '@/utils/pdf-preview'

// 当前需要预览的原始 PDF 文件。
const props = defineProps<{
  source: File | Blob
  currentPage: number
}>()

const emit = defineEmits<{
  'update:currentPage': [page: number]
}>()

// 缩略图最多渲染 24 页，页面再多时仍可以依靠底部翻页查看完整内容。
const MAX_THUMBNAILS = 24

const isLoading = ref(false)
const errorMessage = ref('')
const totalPages = ref(0)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const thumbnailCanvases = new Map<number, HTMLCanvasElement>()

// pdfuse-core/preview 返回的文档代理，同一文件重复渲染时保持复用。
let previewDocument: PDFDocumentProxy | null = null

// generation 防止快速切换文件时旧异步任务把新文件画布覆盖。
let renderGeneration = 0

// 保存模板中动态生成的缩略图 canvas。
function setThumbnailCanvas(element: unknown, pageNumber: number) {
  if (element instanceof HTMLCanvasElement) {
    thumbnailCanvases.set(pageNumber, element)
  } else {
    thumbnailCanvases.delete(pageNumber)
  }
}

// 清理旧 PDF.js 文档，释放 Worker 和页面缓存。
async function destroyPreviewDocument() {
  if (!previewDocument) return

  await previewDocument.destroy()
  previewDocument = null
  totalPages.value = 0
}

/**
 * 加载当前文件并依次渲染缩略图与大图。
 * nextTick 确保 v-for 生成的 canvas 已经挂载到 DOM。
 */
async function preparePreview() {
  const currentGeneration = ++renderGeneration
  isLoading.value = true
  errorMessage.value = ''
  thumbnailCanvases.clear()

  await destroyPreviewDocument()

  try {
    const pdf = await loadPdfPreview(props.source)

    // 如果在加载期间用户又换了文件，销毁这次已经过期的文档。
    if (currentGeneration !== renderGeneration) {
      await pdf.destroy()
      return
    }

    previewDocument = pdf
    totalPages.value = pdf.numPages
    emit('update:currentPage', Math.min(Math.max(props.currentPage, 1), pdf.numPages))
    await nextTick()

    const thumbnailCount = Math.min(pdf.numPages, MAX_THUMBNAILS)
    for (let pageNumber = 1; pageNumber <= thumbnailCount; pageNumber += 1) {
      if (currentGeneration !== renderGeneration) return

      const canvas = thumbnailCanvases.get(pageNumber)
      if (canvas) {
        await renderPdfPage(pdf, pageNumber, canvas, 0.26)
      }
    }

    await renderCurrentPage(currentGeneration)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'PDF 预览加载失败。'
  } finally {
    if (currentGeneration === renderGeneration) {
      isLoading.value = false
    }
  }
}

// 渲染当前页大图。
async function renderCurrentPage(generation = renderGeneration) {
  if (!previewDocument || !previewCanvas.value) return

  const pageNumber = Math.min(Math.max(props.currentPage, 1), previewDocument.numPages)

  try {
    await renderPdfPage(previewDocument, pageNumber, previewCanvas.value, 1.15)
  } catch (error) {
    if (generation === renderGeneration) {
      errorMessage.value = error instanceof Error ? error.message : '当前页渲染失败。'
    }
  }
}

// 选择某页后同步父组件状态，并重新渲染大图。
function selectPage(pageNumber: number) {
  emit('update:currentPage', pageNumber)
}

// 当前页变化时只重绘大图，不重复生成全部缩略图。
watch(
  () => props.currentPage,
  async () => {
    await nextTick()
    await renderCurrentPage()
  },
)

// 文件变化时重新加载整个预览。
watch(
  () => props.source,
  () => {
    void preparePreview()
  },
  { immediate: true },
)

// 组件卸载时终止旧文档，避免保留大文件缓存。
onBeforeUnmount(() => {
  renderGeneration += 1
  void destroyPreviewDocument()
})
</script>

<template>
  <section class="pdf-preview">
    <div class="preview-toolbar">
      <div class="preview-title">
        <el-icon :size="17"><View /></el-icon>
        <strong>页面预览</strong>
      </div>

      <div class="page-navigation">
        <el-button
          text
          circle
          :disabled="currentPage <= 1 || isLoading"
          aria-label="上一页"
          @click="selectPage(currentPage - 1)"
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>

        <span>{{ currentPage }} / {{ totalPages || '-' }}</span>

        <el-button
          text
          circle
          :disabled="totalPages === 0 || currentPage >= totalPages || isLoading"
          aria-label="下一页"
          @click="selectPage(currentPage + 1)"
        >
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- 加载状态保持固定高度，避免预览区在渲染前后产生明显跳动。 -->
    <div v-if="isLoading" class="preview-loading">
      <span class="loading-spinner"></span>
      <span>正在通过 pdfuse-core 生成预览...</span>
    </div>

    <div v-else-if="errorMessage" class="preview-error">
      <strong>预览加载失败</strong>
      <span>{{ errorMessage }}</span>
    </div>

    <template v-else>
      <!-- 缩略图区域 -->
      <div v-if="totalPages > 0" class="thumbnail-strip" aria-label="PDF 页面缩略图">
        <button
          v-for="pageNumber in Math.min(totalPages, MAX_THUMBNAILS)"
          :key="pageNumber"
          type="button"
          class="thumbnail-button"
          :class="{ active: currentPage === pageNumber }"
          @click="selectPage(pageNumber)"
        >
          <canvas :ref="(element) => setThumbnailCanvas(element, pageNumber)"></canvas>
          <span>{{ pageNumber }}</span>
        </button>
      </div>

      <!-- 当前页大图 -->
      <div class="preview-canvas-wrap">
        <canvas ref="previewCanvas"></canvas>
      </div>

      <p v-if="totalPages > MAX_THUMBNAILS" class="thumbnail-note">
        为保证流畅度，仅展示前 {{ MAX_THUMBNAILS }} 页缩略图，可以使用上方按钮继续翻页。
      </p>
    </template>
  </section>
</template>

<style scoped>
.pdf-preview {
  margin-top: 14px;
  overflow: hidden;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 10px;
}

.preview-toolbar {
  min-height: 42px;
  padding: 6px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--bm-surface);
  border-bottom: 1px solid var(--bm-border);
}

.preview-title,
.page-navigation {
  display: flex;
  align-items: center;
  gap: 7px;
}

.preview-title {
  color: var(--bm-primary);
}

.preview-title strong {
  color: var(--bm-text-strong);
  font-size: 11px;
}

.page-navigation span {
  min-width: 56px;
  color: var(--bm-text-muted);
  font-size: 10px;
  text-align: center;
}

/* 缩略图横向滚动，不会挤压页面主体宽度。 */
.thumbnail-strip {
  padding: 10px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  border-bottom: 1px solid var(--bm-border);
}

.thumbnail-button {
  width: 80px;
  padding: 4px;
  flex: 0 0 80px;
  color: var(--bm-text-faint);
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 6px;
  cursor: pointer;
}

.thumbnail-button.active {
  color: var(--bm-primary);
  border-color: var(--bm-primary);
  box-shadow: 0 0 0 2px var(--bm-primary-soft);
}

.thumbnail-button canvas {
  width: 100%;
  height: auto;
  max-height: 102px;
  display: block;
  object-fit: contain;
  background: #fff;
}

.thumbnail-button span {
  margin-top: 3px;
  display: block;
  font-size: 9px;
  text-align: center;
}

/* 大图区域使用深一点的中性背景，白色 PDF 页面边界更清楚。 */
.preview-canvas-wrap {
  max-height: 620px;
  min-height: 260px;
  padding: 16px;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: var(--bm-surface-soft);
}

.preview-canvas-wrap canvas {
  max-width: 100%;
  height: auto;
  display: block;
  background: #fff;
  box-shadow: 0 6px 20px rgba(20, 30, 28, 0.14);
}

.thumbnail-note {
  margin: 0;
  padding: 8px 10px;
  color: var(--bm-text-faint);
  background: var(--bm-surface);
  border-top: 1px solid var(--bm-border);
  font-size: 9px;
  text-align: center;
}

/* 加载区域提供简单的旋转指示器，不依赖额外图片。 */
.preview-loading,
.preview-error {
  min-height: 300px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--bm-text-muted);
  font-size: 11px;
  text-align: center;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid var(--bm-border-strong);
  border-top-color: var(--bm-primary);
  border-radius: 50%;
  animation: preview-spin 0.8s linear infinite;
}

.preview-error strong {
  color: var(--bm-danger);
}

@keyframes preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 560px) {
  .preview-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-navigation {
    width: 100%;
    justify-content: space-between;
  }

  .preview-canvas-wrap {
    max-height: 520px;
    padding: 10px;
  }
}
</style>
