<!--
  PdfWorkspace.vue 是页面中间的核心功能区。
  它根据 activeTool 展示 PDF 拆分、PDF 合并、课表转换或水印占位页面。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Connection,
  Delete,
  Document,
  Download,
  Grid,
  MagicStick,
  Plus,
  Scissor,
  UploadFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { convertPdfScheduleToExcel, getPdfPageCount, mergePdfs, splitPdf } from '@/utils/pdf-tools'
import type { GeneratedPdfFile, PdfFileItem, ToolKey } from '@/types/pdf'

// activeTool 由左侧功能菜单控制。
const props = defineProps<{
  activeTool: ToolKey
}>()

// 水印占位页可以把用户送回 PDF 拆分，因此向页面发送工具切换事件。
const emit = defineEmits<{
  'select-tool': [tool: ToolKey]
}>()

// 模板中需要使用文件输入框的 DOM 引用，以便点击普通按钮时触发文件选择。
const fileInputRef = ref<HTMLInputElement | null>(null)

// 待处理文件列表；合并模式可以包含多个文件。
const fileItems = ref<PdfFileItem[]>([])

// 拆分页码输入，默认提取第 1 至第 3 页。
const pageRange = ref('1-3')

// 拖拽状态用于改变拖拽区域边框和背景。
const isDragging = ref(false)

// 处理进度和运行状态。
const isProcessing = ref(false)
const progress = ref(0)

// 最近一次处理结果，用户点击下载时使用。
const generatedFile = ref<GeneratedPdfFile | null>(null)

// 每种工具对应的文案、图标和按钮名称。
const toolMeta: Record<
  Exclude<ToolKey, 'watermark'>,
  {
    title: string
    subtitle: string
    dropTitle: string
    dropHint: string
    actionText: string
    icon: typeof Document
  }
> = {
  split: {
    title: 'PDF 拆分',
    subtitle: '选择页码范围，生成一个新的 PDF 文件',
    dropTitle: '拖入一个 PDF 文件',
    dropHint: '或点击下方按钮浏览文件，支持标准 PDF',
    actionText: '开始拆分',
    icon: Scissor,
  },
  merge: {
    title: 'PDF 合并',
    subtitle: '添加多个 PDF，并通过上移、下移调整页面顺序',
    dropTitle: '拖入两个或更多 PDF 文件',
    dropHint: '也可以多次选择文件，列表顺序就是合并顺序',
    actionText: '开始合并',
    icon: Connection,
  },
  schedule: {
    title: 'PDF 课表转 Excel',
    subtitle: '读取文字型 PDF，按坐标还原表格行列并导出 .xlsx',
    dropTitle: '拖入一个课表 PDF 文件',
    dropHint: '暂不支持扫描图片型 PDF，图片课表需要 OCR',
    actionText: '转换为 Excel',
    icon: Grid,
  },
}

// 当前工具的有效配置。水印功能在模板中单独处理，因此这里排除 watermark。
const currentMeta = computed(() => {
  if (props.activeTool === 'watermark') {
    return toolMeta.split
  }
  return toolMeta[props.activeTool]
})

// 只有合并模式允许一次添加多个文件。
const allowMultipleFiles = computed(() => props.activeTool === 'merge')

// 待处理列表的文件总数提示。
const queueSummary = computed(() => {
  const totalSize = fileItems.value.reduce((sum, item) => sum + item.file.size, 0)
  return `${fileItems.value.length} 个文件 · ${formatFileSize(totalSize)}`
})

/**
 * 在切换工具时清空旧文件和旧结果。
 * 这样用户从拆分切到合并时，不会误把上一次的 PDF 当成当前任务文件。
 */
watch(
  () => props.activeTool,
  () => {
    resetWorkspace()
  },
)

// 点击按钮时触发隐藏的 file input。
function openFilePicker() {
  fileInputRef.value?.click()
}

/**
 * 判断 File 是否是 PDF。
 * 有些系统不会提供 MIME type，因此同时检查 .pdf 扩展名。
 */
function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

// 将字节转换成更容易阅读的文件大小文本。
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// 使用文件名、文件大小和修改时间组合成去重键，避免同一文件被重复添加。
function getFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * 接收浏览器选择的 FileList。
 * 非 PDF 文件会被忽略；拆分和课表转换模式只保留第一个文件。
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

  if (props.activeTool === 'merge') {
    const existingKeys = new Set(fileItems.value.map((item) => getFileKey(item.file)))
    const uniqueFiles = validFiles.filter((file) => !existingKeys.has(getFileKey(file)))
    const remainingSlots = Math.max(0, 20 - fileItems.value.length)

    if (uniqueFiles.length > remainingSlots) {
      ElMessage.warning('单次最多合并 20 个 PDF 文件。')
    }

    candidates = uniqueFiles.slice(0, remainingSlots)
  } else {
    // 拆分与课表转换都针对单个文档，因此直接替换旧文件。
    candidates = validFiles.slice(0, 1)
  }

  if (candidates.length === 0) {
    ElMessage.info('没有新增文件。')
    return
  }

  // 先建立列表项，让用户立刻看到文件名，再异步读取页数。
  const newItems: PdfFileItem[] = candidates.map((file) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: 'loading',
  }))

  fileItems.value = props.activeTool === 'merge' ? [...fileItems.value, ...newItems] : newItems
  generatedFile.value = null

  // Promise.all 同时读取多个文件的页数，处理结束后分别更新各自状态。
  await Promise.all(
    newItems.map(async (item) => {
      try {
        const pageCount = await getPdfPageCount(item.file)

        // 必须从 fileItems.value 中取得 Vue 包装后的对象再赋值，界面才会实时刷新。
        const reactiveItem = fileItems.value.find((currentItem) => currentItem.id === item.id)
        if (reactiveItem) {
          reactiveItem.pageCount = pageCount
          reactiveItem.status = 'ready'
        }
      } catch {
        const reactiveItem = fileItems.value.find((currentItem) => currentItem.id === item.id)
        if (reactiveItem) {
          reactiveItem.status = 'error'
        }
      }
    }),
  )

  ElMessage.success(`已添加 ${newItems.length} 个 PDF 文件。`)
}

// 处理 input 的 change 事件，并在读取后清空 value，保证同一个文件可以再次选择。
async function handleInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  await addFiles(Array.from(input.files ?? []))
  input.value = ''
}

// 处理拖拽释放。
async function handleDrop(event: DragEvent) {
  isDragging.value = false
  const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
  await addFiles(droppedFiles)
}

// 删除指定文件。
function removeFile(fileId: string) {
  fileItems.value = fileItems.value.filter((item) => item.id !== fileId)
  generatedFile.value = null
}

/**
 * 调整合并顺序。
 * direction 为 -1 表示上移，1 表示下移。
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
  generatedFile.value = null
}

// 清空所有输入状态，方便重新开始一次处理。
function resetWorkspace() {
  fileItems.value = []
  generatedFile.value = null
  progress.value = 0
  isDragging.value = false
  pageRange.value = '1-3'
}

/**
 * 根据当前工具调用对应处理函数。
 * 所有浏览器的同步错误和 Promise 异常都会在这里统一转换为用户提示。
 */
async function processFiles() {
  if (fileItems.value.length === 0) {
    ElMessage.warning('请先添加 PDF 文件。')
    return
  }

  if (props.activeTool === 'merge' && fileItems.value.length < 2) {
    ElMessage.warning('PDF 合并至少需要两个文件。')
    return
  }

  const firstItem = fileItems.value[0]

  if (!firstItem) {
    ElMessage.warning('没有可处理的文件。')
    return
  }

  isProcessing.value = true
  progress.value = 4
  generatedFile.value = null

  try {
    if (props.activeTool === 'split') {
      generatedFile.value = await splitPdf(firstItem, pageRange.value, (percent) => {
        progress.value = percent
      })
    } else if (props.activeTool === 'merge') {
      generatedFile.value = await mergePdfs(fileItems.value, (percent) => {
        progress.value = percent
      })
    } else if (props.activeTool === 'schedule') {
      generatedFile.value = await convertPdfScheduleToExcel(firstItem, (percent) => {
        progress.value = percent
      })
    }

    ElMessage.success('处理完成，可以下载结果了。')
  } catch (error) {
    // 工具函数会主动抛出中文错误，这里优先展示该错误；其他异常使用通用文案。
    const message = error instanceof Error ? error.message : '处理失败，请检查 PDF 文件是否完整。'
    ElMessage.error(message)
  } finally {
    isProcessing.value = false
  }
}

// 使用临时 Object URL 触发浏览器下载，并在下载开始后释放内存。
function downloadGeneratedFile() {
  if (!generatedFile.value) return

  const objectUrl = URL.createObjectURL(generatedFile.value.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = generatedFile.value.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // 延迟释放可以兼容部分浏览器，避免刚点击下载就移除资源。
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
</script>

<template>
  <section class="workspace-panel">
    <!-- 工作台标题会随左侧菜单同步变化。 -->
    <header class="workspace-heading">
      <div class="heading-main">
        <span class="section-index">02</span>
        <span class="heading-icon">
          <el-icon :size="21">
            <component :is="activeTool === 'watermark' ? MagicStick : currentMeta.icon" />
          </el-icon>
        </span>

        <div>
          <h2>{{ activeTool === 'watermark' ? '图片水印处理' : currentMeta.title }}</h2>
          <p>
            {{
              activeTool === 'watermark'
                ? '该功能暂时不需要实现，当前仅保留入口'
                : currentMeta.subtitle
            }}
          </p>
        </div>
      </div>

      <!-- 本地处理提示放在右上角，操作过程中始终可见。 -->
      <span v-if="activeTool !== 'watermark'" class="local-badge">
        <el-icon :size="13"><CircleCheck /></el-icon>
        本地处理
      </span>
    </header>

    <!-- 水印功能只显示预留状态，不创建文件输入或处理逻辑。 -->
    <div v-if="activeTool === 'watermark'" class="coming-soon-panel">
      <span class="coming-icon">
        <el-icon :size="34"><MagicStick /></el-icon>
      </span>
      <h3>图片水印功能正在准备</h3>
      <p>当前版本只保留菜单入口，后续可以直接在这个区域加入预览、位置和透明度设置。</p>
      <el-button type="primary" plain @click="emit('select-tool', 'split')">
        返回 PDF 拆分
      </el-button>
    </div>

    <template v-else>
      <!-- 隐藏的文件选择框由普通按钮和拖拽区域间接触发。 -->
      <input
        ref="fileInputRef"
        class="hidden-file-input"
        type="file"
        accept=".pdf,application/pdf"
        :multiple="allowMultipleFiles"
        @change="handleInputChange"
      />

      <!-- 拖拽区域是核心入口，边框和背景会在拖拽进入时改变。 -->
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
          <strong>{{ currentMeta.dropTitle }}</strong>
          <small>{{ currentMeta.dropHint }}</small>
        </div>

        <!-- 阻止按钮点击冒泡后重复打开文件选择框。 -->
        <el-button type="primary" :icon="Plus" @click.stop="openFilePicker"> 选择文件 </el-button>
      </div>

      <!-- 文件队列按添加顺序显示；合并模式可以调整顺序。 -->
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
              <template v-if="item.status === 'loading'">· 正在读取页数</template>
              <template v-else-if="item.status === 'ready'"> · {{ item.pageCount }} 页 </template>
              <template v-else>· 文件无法读取</template>
            </span>
          </div>

          <!-- 合并模式提供排序按钮，其他模式不需要显示。 -->
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

      <!-- 拆分模式额外显示页码范围输入。 -->
      <div v-if="activeTool === 'split'" class="option-panel">
        <div class="option-copy">
          <strong>需要保留的页码</strong>
          <span>例如：1-3,5 表示提取第 1、2、3、5 页</span>
        </div>
        <el-input
          v-model="pageRange"
          class="range-input"
          placeholder="1-3,5"
          aria-label="PDF 拆分页码"
        />
      </div>

      <!-- 课表转换对 PDF 类型有明确要求，因此在提交前展示提示。 -->
      <div v-if="activeTool === 'schedule'" class="format-note">
        <el-icon :size="16"><Grid /></el-icon>
        <span>当前算法会还原横纵行列；扫描图片课表、复杂合并单元格需要导出后人工校正。</span>
      </div>

      <!-- 处理完成后展示文件摘要和下载按钮。 -->
      <div v-if="generatedFile" class="result-card">
        <span class="result-icon">
          <el-icon :size="23"><CircleCheck /></el-icon>
        </span>
        <div class="result-copy">
          <strong>{{ generatedFile.filename }}</strong>
          <span>{{ generatedFile.description }}</span>
        </div>
        <el-button type="success" :icon="Download" @click="downloadGeneratedFile">
          下载结果
        </el-button>
      </div>

      <!-- 处理中或已有进度时显示进度条。 -->
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

      <!-- 底部操作区固定在内容流中，不遮挡拖拽区。 -->
      <footer class="workspace-actions">
        <el-button :disabled="isProcessing || fileItems.length === 0" @click="resetWorkspace">
          清空
        </el-button>
        <el-button
          type="primary"
          :icon="currentMeta.icon"
          :loading="isProcessing"
          :disabled="fileItems.length === 0"
          @click="processFiles"
        >
          {{ isProcessing ? '处理中...' : currentMeta.actionText }}
        </el-button>
      </footer>
    </template>
  </section>
</template>

<style scoped>
/* 工作台是最主要的视觉区域，因此设置为独立白色表面并保留充足内边距。 */
.workspace-panel {
  min-height: 590px;
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

/* “本地处理”标记使用绿色，传达隐私与安全信息。 */
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

/* 隐藏原生 file input，视觉交互完全交给自定义区域。 */
.hidden-file-input {
  display: none;
}

/* 拖拽区域高度稳定，进入拖拽状态时不会因边框变化而跳动。 */
.drop-zone {
  min-height: 176px;
  margin-top: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 13px;
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

/* 拖拽时只做轻微上移，不改变整体尺寸。 */
.drop-zone.dragging {
  transform: translateY(-2px);
}

/* 上传图标使用固定圆形容器。 */
.drop-icon {
  width: 58px;
  height: 58px;
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
  gap: 5px;
}

.drop-copy strong {
  color: var(--bm-text-strong);
  font-size: 15px;
}

.drop-copy small {
  color: var(--bm-text-faint);
  font-size: 11px;
}

/* 文件队列外框保持紧凑，内容多时可以内部滚动。 */
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

/* 每个文件独占一行，长文件名会被省略，不挤压右侧按钮。 */
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

/* 删除按钮使用警示色，但仅在悬停或聚焦时明显。 */
.remove-button:hover {
  color: var(--bm-danger);
  background: var(--bm-danger-soft);
}

/* 拆分页码范围采用横向布局，左侧解释、右侧输入。 */
.option-panel {
  margin-top: 14px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 9px;
}

.option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.option-copy strong {
  color: var(--bm-text-strong);
  font-size: 11px;
}

.option-copy span {
  color: var(--bm-text-faint);
  font-size: 9px;
  line-height: 1.4;
}

.range-input {
  width: 146px;
  flex: 0 0 146px;
}

/* 统一适配 Element Plus 输入框的主题颜色。 */
.range-input :deep(.el-input__wrapper) {
  background: var(--bm-surface);
  box-shadow: 0 0 0 1px var(--bm-border-strong) inset;
}

.range-input :deep(.el-input__inner) {
  color: var(--bm-text-strong);
}

/* 课表格式提示使用低饱和强调色，不打断操作流程。 */
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

/* 处理结果卡片横向排列，下载按钮右对齐。 */
.result-card {
  margin-top: 14px;
  padding: 11px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bm-success-soft);
  border: 1px solid var(--bm-success-border);
  border-radius: 9px;
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

/* 进度区域高度固定，出现和消失时不会造成明显跳动。 */
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

/* 操作按钮放在右下角，符合常见工作台的操作习惯。 */
.workspace-actions {
  margin-top: 18px;
  padding-top: 15px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--bm-border);
}

/* 水印功能占位区域保持与工作台一致的高度，不出现空壳感。 */
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

/* 手机端缩小主面板内边距，让 320px 宽度也能正常使用。 */
@media (max-width: 560px) {
  .workspace-panel {
    min-height: 520px;
    padding: 14px;
  }

  .workspace-heading {
    gap: 10px;
  }

  .local-badge {
    display: none;
  }

  .drop-zone {
    min-height: 190px;
    padding: 20px 14px;
  }

  .option-panel {
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
  }

  .range-input {
    width: 100%;
    flex-basis: auto;
  }

  .result-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .result-card :deep(.el-button) {
    width: 100%;
  }

  .workspace-actions :deep(.el-button) {
    flex: 1;
  }
}
</style>
