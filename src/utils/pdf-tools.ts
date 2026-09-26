/**
 * PDF 业务工具层。
 *
 * 页面组件只调用这个文件，不直接接触 Worker、pdfuse-core 或 xlsx。
 * 这样做有三点好处：
 * 1. 工作台组件只负责交互和进度显示；
 * 2. 所有 PDF 请求最终都通过统一 Worker 客户端执行；
 * 3. 新增 PDF 功能时，只需扩展 processPdfTool 的一个分支。
 */
import * as XLSX from 'xlsx'
import type { PageSelectionKey } from 'pdfuse-core'
import { exportPdfPageAsPng } from '@/utils/pdf-preview'
import { runPdfWorkerOperation } from '@/utils/pdf-worker-client'
import type {
  GeneratedPdfFile,
  PdfFileItem,
  PdfInspection,
  PdfInspectionResult,
  PdfToolKey,
  PdfToolOptions,
  PdfToolResult,
} from '@/types/pdf'
import type { PdfWorkerOperation, PdfWorkerSource } from '@/types/pdf-worker'

// 处理进度回调，数值范围为 0～100。
type ProgressCallback = (percent: number) => void

/**
 * 把 File 转换为可结构化克隆的 Worker 源数据。
 * file.arrayBuffer() 会返回新的 ArrayBuffer，不会直接影响用户原始文件。
 */
async function toWorkerSource(fileItem: PdfFileItem): Promise<PdfWorkerSource> {
  return {
    name: fileItem.file.name,
    type: fileItem.file.type || 'application/pdf',
    lastModified: fileItem.file.lastModified,
    data: await fileItem.file.arrayBuffer(),
  }
}

// 批量转换文件，供合并等操作使用。
async function toWorkerSources(fileItems: PdfFileItem[]): Promise<PdfWorkerSource[]> {
  return Promise.all(fileItems.map(toWorkerSource))
}

/**
 * 创建标准 PDF Blob。
 * 显式复制 ArrayBuffer 可以兼容 TypeScript 6 对 SharedArrayBuffer 的严格类型检查。
 */
function createBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  const safeBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

  return new Blob([safeBuffer], { type })
}

// 去掉 .pdf 后缀，为处理结果生成更自然的文件名。
function getBaseName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '')
}

// 生成当前日期，统一使用 YYYY-MM-DD 格式。
function getDateText(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * 解析 1-3,5,8-10 形式的页码范围。
 * 所有页码都会自动去重、排序并验证是否超出总页数。
 */
export function parsePageRange(rangeText: string, totalPages: number): number[] {
  if (!rangeText.trim()) {
    throw new Error('请输入页码范围。')
  }

  const normalized = rangeText.replace(/，/g, ',').replace(/\s+/g, '')
  const pageSet = new Set<number>()

  normalized.split(',').forEach((segment) => {
    if (!segment) return

    if (/^\d+$/.test(segment)) {
      pageSet.add(Number(segment))
      return
    }

    const rangeMatch = segment.match(/^(\d+)-(\d+)$/)
    if (!rangeMatch) {
      throw new Error(`页码范围“${segment}”格式错误，请使用 1-3,5 这样的格式。`)
    }

    const first = Number(rangeMatch[1])
    const second = Number(rangeMatch[2])
    const start = Math.min(first, second)
    const end = Math.max(first, second)

    for (let page = start; page <= end; page += 1) {
      pageSet.add(page)
    }
  })

  const pages = Array.from(pageSet).sort((a, b) => a - b)
  return validatePageNumbers(pages, totalPages)
}

/**
 * 解析完整页面顺序。
 * 与普通页码范围不同，页面重排会保留输入顺序，因此不能排序或去重。
 */
export function parsePageOrder(orderText: string, totalPages: number): number[] {
  const pages = orderText
    .replace(/，/g, ',')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => {
      if (!/^\d+$/.test(value)) {
        throw new Error(`页面顺序“${value}”不是有效页码。`)
      }
      return Number(value)
    })

  validatePageNumbers(pages, totalPages)

  const uniquePages = new Set(pages)
  if (uniquePages.size !== totalPages || pages.length !== totalPages) {
    throw new Error(`页面顺序必须包含 1 到 ${totalPages} 的全部页面，且每页只出现一次。`)
  }

  return pages
}

// 统一校验页码是否为正整数且不超过文档总页数。
function validatePageNumbers(pages: number[], totalPages: number): number[] {
  if (pages.length === 0) {
    throw new Error('没有识别到有效页码。')
  }

  const invalidPage = pages.find((page) => !Number.isInteger(page) || page < 1 || page > totalPages)
  if (invalidPage !== undefined) {
    throw new Error(`页码 ${invalidPage} 超出范围，当前 PDF 共有 ${totalPages} 页。`)
  }

  return pages
}

/**
 * 用某个 PDF 的指定页面创建选择顺序。
 * pdfuse-core 的 pageIndex 使用 0-based，因此这里统一减 1。
 */
function toSelectionOrder(fileIndex: number, pages: number[]): PageSelectionKey[] {
  return pages.map((page) => ({
    pdfIndex: fileIndex,
    pageIndex: page - 1,
  }))
}

// 确认单文件工具确实只有一个可用文件。
function getSingleFile(fileItems: PdfFileItem[]): PdfFileItem {
  const firstItem = fileItems[0]

  if (!firstItem || fileItems.length !== 1) {
    throw new Error('当前功能需要且只能选择一个 PDF 文件。')
  }

  if (firstItem.status !== 'ready' || !firstItem.pageCount) {
    throw new Error('PDF 尚未读取完成，请稍后再试。')
  }

  return firstItem
}

// 获取文档总页数，并在文件无效时给出明确提示。
function getTotalPages(fileItem: PdfFileItem): number {
  if (!fileItem.pageCount || fileItem.pageCount < 1) {
    throw new Error('无法读取 PDF 页数。')
  }

  return fileItem.pageCount
}

// 统一执行 Worker 请求，只允许普通文档操作调用。
async function runWorkerOperation(operation: PdfWorkerOperation): Promise<Uint8Array> {
  const result = await runPdfWorkerOperation(operation)

  if (result.resultType !== 'bytes') {
    throw new Error('PDF Worker 返回了非预期的结果类型。')
  }

  return result.bytes
}

/**
 * 使用 pdfuse-core 读取文档体检信息。
 * 添加文件时也会调用它，因此页数读取和“文档体检”使用完全相同的解析路径。
 */
export async function inspectPdf(fileItem: PdfFileItem): Promise<PdfInspection> {
  const operation: PdfWorkerOperation = {
    operation: 'inspect',
    sources: [await toWorkerSource(fileItem)],
  }
  const result = await runPdfWorkerOperation(operation)

  if (result.resultType !== 'inspection') {
    throw new Error('PDF 体检没有返回有效结果。')
  }

  return result.inspection
}

/**
 * 合并多个 PDF。
 * selectedOrder 按文件顺序展开全部页面，再交给 pdfuse-core 的 mergeSelectedPages。
 */
export async function mergePdfFiles(
  fileItems: PdfFileItem[],
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  if (fileItems.length < 2) {
    throw new Error('合并 PDF 至少需要两个文件。')
  }

  onProgress?.(8)

  const sources = await toWorkerSources(fileItems)
  const selectedOrder: PageSelectionKey[] = []
  let totalPages = 0

  fileItems.forEach((fileItem, pdfIndex) => {
    const pageCount = getTotalPages(fileItem)

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      selectedOrder.push({ pdfIndex, pageIndex })
    }

    totalPages += pageCount
  })

  onProgress?.(24)

  const bytes = await runWorkerOperation({
    operation: 'select-pages',
    sources,
    selectedOrder,
  })

  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `BaiMeow合并-${getDateText()}.pdf`,
    description: `已通过 pdfuse-core 合并 ${fileItems.length} 个文件，共 ${totalPages} 页`,
  }
}

/**
 * 提取单个 PDF 的页面。
 * 拆分、提取页面和删除页面都复用这个底层函数，减少重复实现。
 */
async function createSelectedPagesFile(
  fileItem: PdfFileItem,
  selectedPages: number[],
  filenameSuffix: string,
  description: string,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  validatePageNumbers(selectedPages, totalPages)

  onProgress?.(10)
  const sources = await toWorkerSources([fileItem])
  onProgress?.(28)

  const bytes = await runWorkerOperation({
    operation: 'select-pages',
    sources,
    selectedOrder: toSelectionOrder(0, selectedPages),
  })

  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-${filenameSuffix}.pdf`,
    description,
  }
}

// 拆分：保留用户输入的范围。
export async function splitPdfFile(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)

  return createSelectedPagesFile(
    fileItem,
    pages,
    `拆分-${pages.join('_')}`,
    `已提取 ${pages.length} 页并生成新 PDF`,
    onProgress,
  )
}

// 提取页面是拆分功能的语义化入口，保留独立函数方便后续调整算法。
export async function extractPdfPages(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)

  return createSelectedPagesFile(
    fileItem,
    pages,
    '提取页面',
    `已提取指定的 ${pages.length} 页`,
    onProgress,
  )
}

// 删除页面：生成“原页码集合减去删除页码集合”的新文档。
export async function deletePdfPages(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pagesToDelete = new Set(parsePageRange(options.pageRange, totalPages))
  const remainedPages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) => !pagesToDelete.has(page),
  )

  if (remainedPages.length === 0) {
    throw new Error('不能删除文档的全部页面。')
  }

  return createSelectedPagesFile(
    fileItem,
    remainedPages,
    '删除页面后',
    `已删除 ${pagesToDelete.size} 页，剩余 ${remainedPages.length} 页`,
    onProgress,
  )
}

// 页面重排：严格验证输入顺序包含全部页面。
export async function reorderPdfPages(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageOrder(options.pageOrder, totalPages)

  return createSelectedPagesFile(
    fileItem,
    pages,
    '重排后',
    `已按新顺序重排 ${pages.length} 页`,
    onProgress,
  )
}

// 旋转页面：在 Worker 中修改指定页面的 Rotation。
export async function rotatePdfPages(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)
  const angle = Number(options.angle)

  if (![90, 180, 270].includes(angle)) {
    throw new Error('旋转角度只支持 90、180 或 270 度。')
  }

  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'rotate',
    sources: await toWorkerSources([fileItem]),
    pages,
    angle,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-旋转${angle}度.pdf`,
    description: `已旋转 ${pages.length} 页，每页顺时针旋转 ${angle} 度`,
  }
}

// 插入空白页：insertAfter=0 时插入到第一页之前。
export async function insertBlankPage(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const insertAfter = Math.floor(options.insertAfter)

  if (insertAfter < 0 || insertAfter > totalPages) {
    throw new Error(`插入位置必须在 0 到 ${totalPages} 之间。`)
  }

  onProgress?.(18)
  const bytes = await runWorkerOperation({
    operation: 'insert-blank',
    sources: await toWorkerSources([fileItem]),
    pageIndex: insertAfter,
    width: options.blankWidth,
    height: options.blankHeight,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-插入空白页.pdf`,
    description: `已在第 ${insertAfter} 页后插入空白页，尺寸 ${options.blankWidth} × ${options.blankHeight} 点`,
  }
}

// 添加页码：由 Worker 嵌入标准字体并绘制到指定页面。
export async function addPdfPageNumbers(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)

  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'page-numbers',
    sources: await toWorkerSources([fileItem]),
    pages,
    startNumber: Math.max(0, Math.floor(options.numberStart)),
    fontSize: Math.min(Math.max(options.numberFontSize, 6), 48),
    position: options.numberPosition,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-添加页码.pdf`,
    description: `已为 ${pages.length} 页添加页码`,
  }
}

// 添加文字水印：核心绘制在 Worker 中完成。
export async function addPdfTextWatermark(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)

  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'text-watermark',
    sources: await toWorkerSources([fileItem]),
    pages,
    text: options.watermarkText,
    opacity: options.watermarkOpacity,
    rotation: options.watermarkRotation,
    fontSize: options.watermarkFontSize,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-文字水印.pdf`,
    description: `已为 ${pages.length} 页添加文字水印`,
  }
}

// 裁剪页面：设置 CropBox，不永久移除 PDF 中的原始内容。
export async function cropPdfPages(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const totalPages = getTotalPages(fileItem)
  const pages = parsePageRange(options.pageRange, totalPages)
  const margins = [options.cropTop, options.cropRight, options.cropBottom, options.cropLeft]

  if (margins.some((value) => value < 0)) {
    throw new Error('裁剪边距不能为负数。')
  }

  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'crop',
    sources: await toWorkerSources([fileItem]),
    pages,
    top: options.cropTop,
    right: options.cropRight,
    bottom: options.cropBottom,
    left: options.cropLeft,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-裁剪.pdf`,
    description: `已调整 ${pages.length} 页的可见裁剪区域`,
  }
}

// 修改标题、作者、主题和关键词。
export async function updatePdfMetadata(
  fileItem: PdfFileItem,
  options: PdfToolOptions,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'metadata',
    sources: await toWorkerSources([fileItem]),
    title: options.metadataTitle,
    author: options.metadataAuthor,
    subject: options.metadataSubject,
    keywords: options.metadataKeywords,
  })
  onProgress?.(100)

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-修改信息.pdf`,
    description: '文档标题、作者、主题和关键词已更新',
  }
}

// 使用对象流重写 PDF 结构。
export async function optimizePdfFile(
  fileItem: PdfFileItem,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  onProgress?.(15)
  const bytes = await runWorkerOperation({
    operation: 'optimize',
    sources: await toWorkerSources([fileItem]),
  })
  onProgress?.(100)

  const sizeDifference = bytes.byteLength - fileItem.file.size
  const differenceText =
    sizeDifference > 0
      ? `增加 ${(sizeDifference / 1024).toFixed(1)} KB`
      : `减少 ${(Math.abs(sizeDifference) / 1024).toFixed(1)} KB`

  return {
    kind: 'file',
    blob: createBlob(bytes),
    filename: `${getBaseName(fileItem.file.name)}-优化保存.pdf`,
    description: `已使用对象流重新保存，文件体积${differenceText}`,
  }
}

// PDF.js 文本项转换为二维行数据时使用的中间结构。
interface PositionedText {
  text: string
  x: number
  y: number
  width: number
}

interface PositionedRow {
  y: number
  items: PositionedText[]
}

/**
 * 将同一水平线上的 PDF 文本项组合成行。
 * 这一步与旧实现思想一致，但文本来源已经统一改为 pdfuse-core/preview。
 */
function groupTextItemsIntoRows(items: PositionedText[]): string[][] {
  const rows: PositionedRow[] = []

  items
    .filter((item) => item.text.trim())
    .sort((a, b) => {
      /*
       * viewport.transform 已经把 PDF 坐标转换成 canvas 坐标：
       * 这里 y 越大表示越靠下，因此升序排序才是从上到下。
       */
      if (Math.abs(a.y - b.y) > 2.5) return a.y - b.y
      return a.x - b.x
    })
    .forEach((item) => {
      let targetRow = rows.find((row) => Math.abs(row.y - item.y) <= 2.5)

      if (!targetRow) {
        targetRow = { y: item.y, items: [] }
        rows.push(targetRow)
      }

      targetRow.items.push(item)
    })

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x)

      const cells: string[] = []
      let lastRightEdge = Number.NEGATIVE_INFINITY

      row.items.forEach((item) => {
        const cleanedText = item.text.replace(/\s+/g, ' ').trim()
        if (!cleanedText) return

        if (cells.length === 0 || item.x - lastRightEdge > 10) {
          cells.push(cleanedText)
        } else {
          const lastIndex = cells.length - 1
          cells[lastIndex] = `${cells[lastIndex] ?? ''}${cleanedText}`
        }

        lastRightEdge = item.x + item.width
      })

      return cells.filter(Boolean)
    })
    .filter((row) => row.length > 0)
}

/**
 * 针对样例这类“每个节次占一个纵向大单元格”的课表进行重组。
 *
 * PDF 中没有真正的表格结构，一个课程单元格通常会被拆成多行：
 * 课程名、上课周次、教室教师、学分信息分别位于不同 y 坐标。
 * 这里以单独的 1～12 数字行作为节次边界，把每个节次区间内的所有文字
 * 合并到一行，避免导出成大量破碎的小行。
 */
function reconstructPeriodRows(rows: string[][]): string[][] | null {
  const weekdayPattern =
    /(周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日)/
  const headerIndex = rows.findIndex(
    (row) => row.filter((cell) => weekdayPattern.test(cell)).length >= 2,
  )

  if (headerIndex < 0) return null

  const periodMarkers = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => {
      if (index <= headerIndex || row.length === 0) return false
      const value = row[0]?.trim()
      return /^(?:[1-9]|1[0-2])$/.test(value ?? '')
    })

  // 标记太少说明这不是按节次组织的课表，继续使用通用行解析。
  if (periodMarkers.length < 4) return null

  const title = rows
    .slice(0, headerIndex)
    .flat()
    .map((cell) => cell.trim())
    .filter(Boolean)
    .join(' ')

  const periodRows: string[][] = []

  periodMarkers.forEach((marker, markerIndex) => {
    const nextMarker = periodMarkers[markerIndex + 1]
    const start = marker.index + 1
    const end = nextMarker?.index ?? rows.length
    const markerDetails = marker.row
      .slice(1)
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(' ')
    const detailLines: string[] = markerDetails ? [markerDetails] : []

    rows.slice(start, end).forEach((row) => {
      const text = row
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(' ')

      if (!text || text.includes('打印时间')) return
      if (!detailLines.includes(text)) detailLines.push(text)
    })

    periodRows.push([marker.row[0]?.trim() ?? '', detailLines.join('\n')])
  })

  return [
    ...(title ? [['课程表信息', title]] : []),
    ['节次', '课程内容（按原始单元格重组）'],
    ...periodRows,
  ]
}

// 如果识别出节次结构就按节次重组，否则从星期表头开始保留全部文字行。
function normalizeScheduleRows(rows: string[][]): string[][] {
  const reconstructedRows = reconstructPeriodRows(rows)
  if (reconstructedRows) return reconstructedRows

  const weekdayPattern =
    /(周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日)/
  const headerIndex = rows.findIndex(
    (row) => row.filter((cell) => weekdayPattern.test(cell)).length >= 2,
  )

  const usefulRows = headerIndex >= 0 ? rows.slice(headerIndex) : rows
  const filteredRows = usefulRows.filter((row) => row.join('').trim().length > 0)
  const maxColumnCount = Math.max(1, ...filteredRows.map((row) => row.length))

  return filteredRows.map((row) => {
    const normalizedRow = [...row]
    while (normalizedRow.length < maxColumnCount) {
      normalizedRow.push('')
    }
    return normalizedRow
  })
}

/**
 * 从 PDF 课表中提取二维文字行。
 *
 * 样例 PDF 使用 UniGB-UCS2-H CID 字体。pdfuse-core/preview 没有暴露
 * cMapUrl 参数，因此课表解析使用同版本的 pdfjs-dist 底层接口，并显式加载
 * public/pdfjs/cmaps 中的本地 CMap 资源。
 */
export async function extractPdfScheduleLayout(
  fileItem: PdfFileItem,
  onProgress?: ProgressCallback,
): Promise<string[][]> {
  onProgress?.(8)

  const [pdfjsModule, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])

  pdfjsModule.GlobalWorkerOptions.workerSrc = workerModule.default

  const loadingTask = pdfjsModule.getDocument({
    data: new Uint8Array(await fileItem.file.arrayBuffer()),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  })
  const pdf = await loadingTask.promise
  const allRows: string[][] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const positionedItems: PositionedText[] = content.items
        .filter((item) => 'str' in item)
        .map((item) => {
          const textItem = item as { str: string; transform: number[]; width: number }

          /*
           * PDF 页面可能带有 /Rotate 90。把文字矩阵先乘上 viewport.transform，
           * 可以得到与用户实际看到的横竖方向一致的坐标，避免课表行列转置。
           */
          const transformed = pdfjsModule.Util.transform(viewport.transform, textItem.transform)

          return {
            text: textItem.str,
            x: transformed[4] ?? 0,
            y: transformed[5] ?? 0,
            width: textItem.width ?? 0,
          }
        })

      allRows.push(...groupTextItemsIntoRows(positionedItems))
      page.cleanup()

      if (pageNumber < pdf.numPages) {
        allRows.push([])
      }

      const percent = 12 + Math.round((pageNumber / pdf.numPages) * 65)
      onProgress?.(percent)
    }
  } finally {
    await pdf.destroy()
  }

  if (allRows.length === 0) {
    throw new Error('没有读取到文字，请确认课表不是扫描图片。')
  }

  return allRows
}

// 对原始坐标行进行表头定位和列补齐，生成适合写入 Excel 的数据。
export async function extractPdfScheduleRows(
  fileItem: PdfFileItem,
  onProgress?: ProgressCallback,
): Promise<string[][]> {
  return normalizeScheduleRows(await extractPdfScheduleLayout(fileItem, onProgress))
}

/**
 * 将文字型 PDF 课表转换为 Excel。
 * PDF 文字提取由 extractPdfScheduleRows 完成，XLSX 只负责输出工作簿。
 */
export async function convertPdfScheduleToExcel(
  fileItem: PdfFileItem,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  const rawRows = await extractPdfScheduleLayout(fileItem, onProgress)
  const scheduleRows = normalizeScheduleRows(rawRows)
  if (scheduleRows.length === 0) {
    throw new Error('没有读取到文字，请确认课表不是扫描图片。')
  }
  onProgress?.(82)

  const worksheet = XLSX.utils.aoa_to_sheet(scheduleRows)
  worksheet['!cols'] = Array.from(
    { length: Math.max(...scheduleRows.map((row) => row.length)) },
    (_, columnIndex) => {
      const longestText = scheduleRows.reduce(
        (maxLength, row) => Math.max(maxLength, String(row[columnIndex] ?? '').length),
        0,
      )
      return { wch: Math.min(Math.max(longestText + 2, 10), 32) }
    },
  )

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '课表')
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['转换说明', '内容'],
      ['源文件', fileItem.file.name],
      ['转换时间', new Date().toLocaleString('zh-CN')],
      ['解析方式', 'pdfuse-core/preview + 文本坐标归行'],
      ['提示', '复杂合并单元格和图片型课表建议导出后人工校正'],
    ]),
    '转换说明',
  )

  onProgress?.(88)

  const excelBinary = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  }) as ArrayBuffer

  onProgress?.(100)

  return {
    kind: 'file',
    blob: new Blob([excelBinary], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: `${getBaseName(fileItem.file.name)}-课表.xlsx`,
    description: `已识别 ${scheduleRows.length} 行内容并生成 Excel`,
    previewRows: scheduleRows.slice(0, 50),
  }
}

/**
 * 所有 PDF 工具的统一入口。
 * 工作台只根据 activeTool 调用这一个函数，避免在 Vue 组件中堆积大量 switch。
 */
export async function processPdfTool(
  tool: PdfToolKey,
  fileItems: PdfFileItem[],
  options: PdfToolOptions,
  previewPage: number,
  onProgress?: ProgressCallback,
): Promise<PdfToolResult> {
  if (tool === 'merge') {
    return mergePdfFiles(fileItems, onProgress)
  }

  const fileItem = getSingleFile(fileItems)

  switch (tool) {
    case 'split':
      return splitPdfFile(fileItem, options, onProgress)

    case 'extract':
      return extractPdfPages(fileItem, options, onProgress)

    case 'delete-pages':
      return deletePdfPages(fileItem, options, onProgress)

    case 'rotate':
      return rotatePdfPages(fileItem, options, onProgress)

    case 'reorder':
      return reorderPdfPages(fileItem, options, onProgress)

    case 'insert-blank':
      return insertBlankPage(fileItem, options, onProgress)

    case 'page-numbers':
      return addPdfPageNumbers(fileItem, options, onProgress)

    case 'text-watermark':
      return addPdfTextWatermark(fileItem, options, onProgress)

    case 'crop':
      return cropPdfPages(fileItem, options, onProgress)

    case 'metadata':
      return updatePdfMetadata(fileItem, options, onProgress)

    case 'optimize':
      return optimizePdfFile(fileItem, onProgress)

    case 'inspect': {
      onProgress?.(20)
      const inspection = await inspectPdf(fileItem)
      onProgress?.(100)

      const result: PdfInspectionResult = {
        kind: 'info',
        title: fileItem.file.name,
        description: `共 ${inspection.pageCount} 页，页面尺寸 ${inspection.pageSize.width} × ${inspection.pageSize.height} 点`,
        inspection,
      }

      return result
    }

    case 'export-png': {
      const totalPages = getTotalPages(fileItem)
      const safePage = Math.min(Math.max(Math.floor(previewPage), 1), totalPages)

      onProgress?.(15)
      const blob = await exportPdfPageAsPng(fileItem.file, safePage, 2)
      onProgress?.(100)

      return {
        kind: 'file',
        blob,
        filename: `${getBaseName(fileItem.file.name)}-第${safePage}页.png`,
        description: `已使用 pdfuse-core 把第 ${safePage} 页导出为 2 倍分辨率 PNG`,
      }
    }

    case 'schedule':
      return convertPdfScheduleToExcel(fileItem, onProgress)

    default: {
      const unreachableTool: never = tool
      throw new Error(`没有实现该 PDF 工具：${String(unreachableTool)}`)
    }
  }
}
