<!--
  PdfWorkspace.vue 是 PDF 工具的核心工作台。

  它统一负责：
  1. 文件拖拽与队列管理；
  2. 读取页数和文档信息；
  3. 显示当前工具的参数表单；
  4. 调用 pdfuse-core 处理流程；
  5. 展示缩略图、预览、进度和处理结果。
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Delete,
  Document,
  Download,
  Grid,
  MagicStick,
  Plus,
  UploadFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PdfEffectPreview from '@/components/workspace/PdfEffectPreview.vue'
import PdfToolOptionsPanel from '@/components/workspace/PdfToolOptionsPanel.vue'
import { createDefaultPdfToolOptions, getPdfToolDefinition } from '@/config/pdf-tools'
import { inspectPdf, processPdfTool } from '@/utils/pdf-tools'
import type { PdfFileItem, PdfToolKey, PdfToolOptions, PdfToolResult, ToolKey } from '@/types/pdf'

// activeTool 由左侧三级菜单控制。
const props = defineProps<{
  activeTool: ToolKey
}>()

// 水印占位页可以返回 PDF 页面预览。
const emit = defineEmits<{
  'select-tool': [tool: ToolKey]
}>()

// 隐藏的原生 file input，由拖拽区和选择按钮共同触发。
const fileInputRef = ref<HTMLInputElement | null>(null)

// 待处理文件列表；合并模式可以保存多个文件。
const fileItems = ref<PdfFileItem[]>([])

// 所有工具的表单参数统一保存，切换工具时恢复默认值。
const toolOptions = reactive<PdfToolOptions>(createDefaultPdfToolOptions())

// 处理前效果预览的当前页码，PNG 导出也使用这个页码。
const previewPage = ref(1)

const isDragging = ref(false)
const isProcessing = ref(false)
const progress = ref(0)
const result = ref<PdfToolResult | null>(null)

// 非水印工具都能从中央配置取得标题、按钮和图标。
const currentMeta = computed(() => {
  if (props.activeTool === 'watermark') return null
  return getPdfToolDefinition(props.activeTool)
})

// 只有合并模式允许一次选择多个文件。
const allowMultipleFiles = computed(() => currentMeta.value?.acceptMultiple ?? false)

// 每个工具的统一效果预览都使用当前队列中的原始文件。
const previewSources = computed(() => fileItems.value.map((item) => item.file))

// 合并和单文件工具在界面提示上使用不同文案。
const queueSummary = computed(() => {
  const totalSize = fileItems.value.reduce((sum, item) => sum + item.file.size, 0)
  return `${fileItems.value.length} 个文件 · ${formatFileSize(totalSize)}`
})

/**
 * 切换工具时重置工作台。
 * 这可以避免把上一个工具的文件和结果误带入当前工具。
 */
watch(
  () => props.activeTool,
  () => {
    resetWorkspace()
  },
)

// 点击自定义按钮时触发系统文件选择框。
function openFilePicker() {
  fileInputRef.value?.click()
}

// 同时检查 MIME type 和扩展名，兼容不同操作系统。
function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// 把字节数转换成易读格式。
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// 文件名、大小和修改时间共同组成去重键。
function getFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * 把文件加入队列，并通过 Worker 读取页数和元数据。
 * pdfuse-core 的 loadPdfDocument 由 pdf-tools.inspectPdf 间接调用。
 */
async function addFiles(inputFiles: File[]) {
  const validFiles = inputFiles.filter(isPdfFile)

  if (validFiles.length !== inputFiles.length) {
    ElMessage.warning('已自动忽略非 PDF 文件。')
  }

  if (validFiles.length === 0) {
    ElMessage.error('请选择 PDF 文件。')
    return
  }

  let candidates: File[]

  if (allowMultipleFiles.value) {
    const existingKeys = new Set(fileItems.value.map((item) => getFileKey(item.file)))
    const uniqueFiles = validFiles.filter((file) => !existingKeys.has(getFileKey(file)))
    const remainingSlots = Math.max(0, 30 - fileItems.value.length)

    if (uniqueFiles.length > remainingSlots) {
      ElMessage.warning('单次最多合并 30 个 PDF 文件。')
    }

    candidates = uniqueFiles.slice(0, remainingSlots)
  } else {
    candidates = validFiles.slice(0, 1)
  }

  if (candidates.length === 0) {
    ElMessage.info('没有新增文件。')
    return
  }

  const newItems: PdfFileItem[] = candidates.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: 'loading',
  }))

  fileItems.value = allowMultipleFiles.value ? [...fileItems.value, ...newItems] : newItems

  result.value = null
  previewPage.value = 1

  await Promise.all(
    newItems.map(async (item) => {
      const reactiveItem = fileItems.value.find((currentItem) => currentItem.id === item.id)
      if (!reactiveItem) return

      try {
        // inspectPdf 使用 Worker + pdfuse-core，页数读取不会阻塞页面。
        const inspection = await inspectPdf(reactiveItem)
        reactiveItem.inspection = inspection
        reactiveItem.pageCount = inspection.pageCount
        reactiveItem.status = 'ready'

        // 元数据工具打开后直接使用当前文档信息预填。
        if (props.activeTool === 'metadata' && reactiveItem.id === fileItems.value[0]?.id) {
          toolOptions.metadataTitle = inspection.title
          toolOptions.metadataAuthor = inspection.author
          toolOptions.metadataSubject = inspection.subject
          toolOptions.metadataKeywords = inspection.keywords
        }
      } catch {
        reactiveItem.status = 'error'
      }
    }),
  )

  ElMessage.success(`已添加 ${newItems.length} 个 PDF 文件。`)
}

// input change 后清空 value，保证同一个文件可以再次被选择。
async function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  await addFiles(Array.from(input.files ?? []))
  input.value = ''
}

// 拖拽释放时读取 DataTransfer 中的文件。
async function handleDrop(event: DragEvent) {
  isDragging.value = false
  await addFiles(Array.from(event.dataTransfer?.files ?? []))
}

// 删除队列中的文件。
function removeFile(fileId: string) {
  fileItems.value = fileItems.value.filter((item) => item.id !== fileId)
  result.value = null
  previewPage.value = 1
}

/**
 * 调整合并顺序。
 * direction = -1 表示上移，1 表示下移。
 */
function moveFile(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= fileItems.value.length) return

  const nextItems = [...fileItems.value]
  const currentItem = nextItems[index]
  const targetItem = nextItems[targetIndex]

  if (!currentItem || !targetItem) return

  nextItems[index] = targetItem
  nextItems[targetIndex] = currentItem
  fileItems.value = nextItems
  result.value = null
}

// 清空文件、参数、结果和预览状态。
function resetWorkspace() {
  fileItems.value = []
  result.value = null
  progress.value = 0
  previewPage.value = 1
  isDragging.value = false
  Object.assign(toolOptions, createDefaultPdfToolOptions())
}

/**
 * 调用统一 PDF 工具入口。
 * 所有真实处理逻辑都在 pdf-tools.ts 和 Web Worker 内，组件只负责状态。
 */
async function processFiles() {
  if (props.activeTool === 'watermark') return

  if (fileItems.value.length === 0) {
    ElMessage.warning('请先添加 PDF 文件。')
    return
  }

  if (props.activeTool === 'merge' && fileItems.value.length < 2) {
    ElMessage.warning('PDF 合并至少需要两个文件。')
    return
  }

  const readyFiles = fileItems.value.filter((item) => item.status === 'ready')
  if (readyFiles.length !== fileItems.value.length) {
    ElMessage.warning('仍有文件正在读取，请稍后再处理。')
    return
  }

  isProcessing.value = true
  progress.value = 4
  result.value = null

  try {
    const tool = props.activeTool as PdfToolKey
    const nextResult = await processPdfTool(
      tool,
      fileItems.value,
      toolOptions,
      previewPage.value,
      (percent) => {
        progress.value = percent
      },
    )

    result.value = nextResult
    ElMessage.success('处理完成。')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 处理失败。'
    ElMessage.error(message)
  } finally {
    isProcessing.value = false
  }
}

// 使用临时 Object URL 下载结果，下载开始后释放资源。
function downloadResult() {
  if (!result.value || result.value.kind !== 'file') return

  const objectUrl = URL.createObjectURL(result.value.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = result.value.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
</script>

<template>
  <section class="workspace-panel">
    <header class="workspace-heading">
      <div class="heading-main">
        <span class="section-index">02</span>
        <span class="heading-icon">
          <el-icon :size="21">
            <component :is="currentMeta?.icon ?? MagicStick" />
          </el-icon>
        </span>

        <div>
          <h2>{{ currentMeta?.title ?? '图片水印处理' }}</h2>
          <p>
            {{ currentMeta?.subtitle ?? '该功能暂时不需要实现，当前仅保留入口' }}
          </p>
        </div>
      </div>

      <span v-if="currentMeta" class="local-badge">
        <el-icon :size="13"><CircleCheck /></el-icon>
        Worker 本地处理
      </span>
    </header>

    <!-- 图片水印仍然是预留状态。 -->
    <div v-if="activeTool === 'watermark'" class="coming-soon-panel">
      <span class="coming-icon">
        <el-icon :size="34"><MagicStick /></el-icon>
      </span>
      <h3>图片水印功能正在准备</h3>
      <p>当前版本保留菜单入口，后续可以直接在这里加入图片上传、预览和透明度设置。</p>
      <el-button type="primary" plain @click="emit('select-tool', 'merge')">
        返回 PDF 合并
      </el-button>
    </div>

    <template v-else>
      <input
        ref="fileInputRef"
        class="hidden-file-input"
        type="file"
        accept=".pdf,application/pdf"
        :multiple="allowMultipleFiles"
        @change="handleInputChange"
      />

      <!-- 统一拖拽入口 -->
      <div
        class="drop-zone"
        :class="{ dragging: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
        @click="openFilePicker"
      >
        <span class="drop-icon">
          <el-icon :size="32"><UploadFilled /></el-icon>
        </span>

        <div class="drop-copy">
          <strong>{{
            allowMultipleFiles ? '拖入两个或更多 PDF 文件' : '拖入一个 PDF 文件'
          }}</strong>
          <small>支持标准 PDF；大文件会在独立 Worker 中处理</small>
        </div>

        <el-button type="primary" :icon="Plus" @click.stop="openFilePicker"> 选择文件 </el-button>
      </div>

      <!-- 文件队列 -->
      <div v-if="fileItems.length > 0" class="file-queue">
        <div class="queue-heading">
          <strong>待处理文件</strong>
          <span>{{ queueSummary }}</span>
        </div>

        <article v-for="(item, index) in fileItems" :key="item.id" class="file-item">
          <span class="file-type-icon">
            <el-icon :size="18"><Document /></el-icon>
          </span>

          <div class="file-info">
            <strong :title="item.file.name">{{ item.file.name }}</strong>
            <span>
              {{ formatFileSize(item.file.size) }}
              <template v-if="item.status === 'loading'">· 正在读取文档</template>
              <template v-else-if="item.status === 'ready'"> · {{ item.pageCount }} 页 </template>
              <template v-else>· 文件无法读取</template>
            </span>
          </div>

          <div v-if="activeTool === 'merge'" class="order-actions">
            <el-tooltip content="上移" placement="top">
              <el-button
                text
                circle
                :disabled="index === 0"
                aria-label="将文件上移"
                @click="moveFile(index, -1)"
              >
                <el-icon><ArrowUp /></el-icon>
              </el-button>
            </el-tooltip>

            <el-tooltip content="下移" placement="top">
              <el-button
                text
                circle
                :disabled="index === fileItems.length - 1"
                aria-label="将文件下移"
                @click="moveFile(index, 1)"
              >
                <el-icon><ArrowDown /></el-icon>
              </el-button>
            </el-tooltip>
          </div>

          <el-tooltip content="移除文件" placement="top">
            <el-button
              class="remove-button"
              text
              circle
              aria-label="移除文件"
              @click="removeFile(item.id)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </article>
      </div>

      <!-- 根据工具显示对应参数。 -->
      <PdfToolOptionsPanel v-if="currentMeta" :tool="currentMeta.key" :options="toolOptions" />

      <!--
        每个工具共用同一套“处理前 / 处理后”预览。
        预览不再是独立功能，而属于当前工具的结果对照区域。
      -->
      <PdfEffectPreview
        v-if="fileItems.length > 0 && fileItems[0]?.status === 'ready'"
        v-model:before-page="previewPage"
        :sources="previewSources"
        :result="result"
      />

      <!-- 课表转换提示 -->
      <div v-if="activeTool === 'schedule'" class="format-note">
        <el-icon :size="16"><Grid /></el-icon>
        <span>支持文字型 PDF；扫描图片、复杂合并单元格可能需要导出后人工校正。</span>
      </div>

      <!-- 文件类结果 -->
      <div v-if="result?.kind === 'file'" class="result-card">
        <span class="result-icon">
          <el-icon :size="23"><CircleCheck /></el-icon>
        </span>
        <div class="result-copy">
          <strong>{{ result.filename }}</strong>
          <span>{{ result.description }}</span>
        </div>
        <el-button type="success" :icon="Download" @click="downloadResult"> 下载结果 </el-button>
      </div>

      <!-- 文档体检结果 -->
      <div v-else-if="result?.kind === 'info'" class="inspection-card">
        <div class="inspection-heading">
          <span class="result-icon">
            <el-icon :size="23"><CircleCheck /></el-icon>
          </span>
          <div class="result-copy">
            <strong>{{ result.title }}</strong>
            <span>{{ result.description }}</span>
          </div>
        </div>

        <dl class="inspection-grid">
          <div>
            <dt>页数</dt>
            <dd>{{ result.inspection.pageCount }}</dd>
          </div>
          <div>
            <dt>页面尺寸</dt>
            <dd>
              {{ result.inspection.pageSize.width }} × {{ result.inspection.pageSize.height }} 点
            </dd>
          </div>
          <div>
            <dt>标题</dt>
            <dd>{{ result.inspection.title || '未设置' }}</dd>
          </div>
          <div>
            <dt>作者</dt>
            <dd>{{ result.inspection.author || '未设置' }}</dd>
          </div>
          <div>
            <dt>主题</dt>
            <dd>{{ result.inspection.subject || '未设置' }}</dd>
          </div>
          <div>
            <dt>关键词</dt>
            <dd>{{ result.inspection.keywords || '未设置' }}</dd>
          </div>
        </dl>
      </div>

      <!-- 处理进度 -->
      <div v-if="isProcessing || progress > 0" class="progress-wrap">
        <div class="progress-label">
          <span>{{ isProcessing ? '正在处理，请稍候' : '处理完成' }}</span>
          <strong>{{ progress }}%</strong>
        </div>
        <el-progress
          :percentage="progress"
          :show-text="false"
          :stroke-width="7"
          :status="!isProcessing && progress === 100 ? 'success' : undefined"
        />
      </div>

      <footer class="workspace-actions">
        <el-button :disabled="isProcessing || fileItems.length === 0" @click="resetWorkspace">
          清空
        </el-button>

        <el-button
          type="primary"
          :icon="currentMeta?.icon"
          :loading="isProcessing"
          :disabled="fileItems.length === 0"
          @click="processFiles"
        >
          {{ isProcessing ? '处理中...' : currentMeta?.actionText }}
        </el-button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
.workspace-panel {
  min-height: 620px;
  padding: 20px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 12px;
  box-shadow: var(--bm-shadow-soft);
}

.workspace-heading {
  min-height: 54px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.heading-main {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.section-index {
  padding-top: 4px;
  color: var(--bm-accent);
  font-family: Georgia, serif;
  font-size: 11px;
  font-weight: 700;
}

.heading-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  color: var(--bm-primary);
  background: var(--bm-primary-soft);
  border-radius: 10px;
}

.workspace-heading h2 {
  margin: 1px 0 0;
  color: var(--bm-text-strong);
  font-size: 20px;
  line-height: 1.3;
}

.workspace-heading p {
  margin: 5px 0 0;
  color: var(--bm-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.local-badge {
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--bm-success);
  background: var(--bm-success-soft);
  border: 1px solid var(--bm-success-border);
  border-radius: 6px;
  font-size: 10px;
  white-space: nowrap;
}

.hidden-file-input {
  display: none;
}

.drop-zone {
  min-height: 158px;
  margin-top: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--bm-text);
  background: var(--bm-surface-soft);
  border: 1px dashed var(--bm-border-strong);
  border-radius: 11px;
  cursor: pointer;
  text-align: center;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.drop-zone:hover,
.drop-zone.dragging {
  background: var(--bm-primary-soft);
  border-color: var(--bm-primary);
}

.drop-zone.dragging {
  transform: translateY(-2px);
}

.drop-icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  color: var(--bm-primary);
  background: var(--bm-surface);
  border: 1px solid var(--bm-primary-border);
  border-radius: 50%;
}

.drop-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drop-copy strong {
  color: var(--bm-text-strong);
  font-size: 14px;
}

.drop-copy small {
  color: var(--bm-text-faint);
  font-size: 10px;
}

.file-queue {
  margin-top: 14px;
  padding: 11px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 10px;
}

.queue-heading {
  padding: 0 3px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.queue-heading strong {
  color: var(--bm-text-strong);
  font-size: 11px;
}

.queue-heading span {
  color: var(--bm-text-faint);
  font-size: 9px;
  white-space: nowrap;
}

.file-item {
  min-height: 52px;
  padding: 7px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 8px;
}

.file-item + .file-item {
  margin-top: 6px;
}

.file-type-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  color: var(--bm-accent);
  background: var(--bm-accent-soft);
  border-radius: 7px;
}

.file-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-info strong {
  overflow: hidden;
  color: var(--bm-text-strong);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-info span {
  color: var(--bm-text-faint);
  font-size: 9px;
}

.order-actions {
  display: flex;
  gap: 1px;
}

.remove-button:hover {
  color: var(--bm-danger);
  background: var(--bm-danger-soft);
}

.format-note {
  margin-top: 12px;
  padding: 10px 11px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--bm-text-muted);
  background: var(--bm-accent-soft);
  border: 1px solid var(--bm-accent-border);
  border-radius: 8px;
  font-size: 10px;
  line-height: 1.55;
}

.result-card,
.inspection-card {
  margin-top: 14px;
  padding: 11px;
  background: var(--bm-success-soft);
  border: 1px solid var(--bm-success-border);
  border-radius: 9px;
}

.result-card {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  color: var(--bm-success);
  background: var(--bm-surface);
  border-radius: 50%;
}

.result-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.result-copy strong {
  overflow: hidden;
  color: var(--bm-text-strong);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-copy span {
  color: var(--bm-text-muted);
  font-size: 9px;
}

.inspection-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inspection-grid {
  margin: 13px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.inspection-grid div {
  min-width: 0;
  padding: 9px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-success-border);
  border-radius: 7px;
}

.inspection-grid dt {
  color: var(--bm-text-faint);
  font-size: 9px;
}

.inspection-grid dd {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--bm-text-strong);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-wrap {
  margin-top: 14px;
  padding: 10px 11px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 8px;
}

.progress-label {
  margin-bottom: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--bm-text-muted);
  font-size: 10px;
}

.progress-label strong {
  color: var(--bm-primary);
}

.workspace-actions {
  margin-top: 18px;
  padding-top: 15px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--bm-border);
}

.coming-soon-panel {
  min-height: 430px;
  padding: 60px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--bm-surface-soft);
  border: 1px dashed var(--bm-border-strong);
  border-radius: 11px;
}

.coming-icon {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  color: var(--bm-accent);
  background: var(--bm-accent-soft);
  border-radius: 18px;
}

.coming-soon-panel h3 {
  margin: 18px 0 0;
  color: var(--bm-text-strong);
  font-size: 18px;
}

.coming-soon-panel p {
  max-width: 430px;
  margin: 9px 0 20px;
  color: var(--bm-text-muted);
  font-size: 11px;
  line-height: 1.7;
}

@media (max-width: 760px) {
  .inspection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .workspace-panel {
    min-height: 520px;
    padding: 14px;
  }

  .local-badge {
    display: none;
  }

  .drop-zone {
    min-height: 180px;
    padding: 18px 14px;
  }

  .result-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .result-card :deep(.el-button) {
    width: 100%;
  }

  .inspection-grid {
    grid-template-columns: 1fr;
  }

  .workspace-actions :deep(.el-button) {
    flex: 1;
  }
}
</style>
