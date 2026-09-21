/**
 * PDF 处理工具函数。
 *
 * 这个文件只处理“浏览器里的文件数据”，不依赖 Vue 组件，方便单独理解和测试。
 * - pdf-lib：拆分、合并 PDF；
 * - pdfjs-dist：从 PDF 中读取文字和位置；
 * - xlsx：把整理好的二维数据导出为 Excel 文件。
 */
import type { GeneratedPdfFile, PdfFileItem } from '@/types/pdf'

// PDF.js 的 Worker 只需要配置一次，因此使用模块级标记记录初始化状态。
let pdfWorkerConfigured = false

// 处理进度回调，组件可以用它更新 Element Plus 进度条。
type ProgressCallback = (percent: number) => void

/**
 * 将可能带有 SharedArrayBuffer 类型的 Uint8Array 复制为普通 ArrayBuffer。
 *
 * TypeScript 6 的 BlobPart 要求 ArrayBufferView 的底层必须是 ArrayBuffer，
 * 而第三方库的 Uint8Array 类型可能写成 ArrayBufferLike，因此这里显式复制，
 * 既解决类型问题，也避免下载 Blob 引用原库内部缓冲区。
 */
function createBinaryBlob(bytes: Uint8Array, type: string): Blob {
  const safeBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

  return new Blob([safeBuffer], { type })
}

/**
 * 解析用户输入的页码范围，例如：
 * - "1"       -> [1]
 * - "1-3,5"   -> [1, 2, 3, 5]
 * - "3-1"     -> [1, 2, 3]（自动纠正倒序范围）
 *
 * 返回结果会自动去重并升序排列。
 */
export function parsePageRange(rangeText: string, totalPages: number): number[] {
  if (!rangeText.trim()) {
    throw new Error('请输入需要拆分的页码范围。')
  }

  const normalized = rangeText.replace(/，/g, ',').replace(/\s+/g, '')
  const pageSet = new Set<number>()

  normalized.split(',').forEach((segment) => {
    if (!segment) return

    // 处理单个页码。
    if (/^\d+$/.test(segment)) {
      pageSet.add(Number(segment))
      return
    }

    // 处理 1-3 形式的连续范围。
    const rangeMatch = segment.match(/^(\d+)-(\d+)$/)
    if (!rangeMatch) {
      throw new Error(`页码范围“${segment}”格式不正确，请使用 1-3,5 这样的格式。`)
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

  if (pages.length === 0) {
    throw new Error('没有识别到有效页码。')
  }

  const invalidPage = pages.find((page) => page < 1 || page > totalPages)
  if (invalidPage !== undefined) {
    throw new Error(`页码 ${invalidPage} 超出范围，当前 PDF 共有 ${totalPages} 页。`)
  }

  return pages
}

/**
 * 读取单个 PDF 的总页数。
 * 文件进入待处理列表后立即调用，便于用户确认是否选对了文件。
 */
export async function getPdfPageCount(file: File): Promise<number> {
  // 只有用户真正添加文件时才加载 pdf-lib，减少网站首屏 JavaScript 体积。
  const { PDFDocument } = await import('pdf-lib')
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer())
  return sourcePdf.getPageCount()
}

/**
 * 按页码范围拆分 PDF。
 *
 * 这里采用“复制选中页面到新文档”的方式，而不是修改原文件，
 * 因此原 PDF 始终保持不变，处理失败也不会损坏用户文件。
 */
export async function splitPdf(
  fileItem: PdfFileItem,
  rangeText: string,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  onProgress?.(12)

  const { PDFDocument } = await import('pdf-lib')
  const sourcePdf = await PDFDocument.load(await fileItem.file.arrayBuffer())
  const totalPages = sourcePdf.getPageCount()
  const selectedPages = parsePageRange(rangeText, totalPages)
  const outputPdf = await PDFDocument.create()

  onProgress?.(38)

  // pdf-lib 的页码从 0 开始，而用户输入的页码从 1 开始，因此需要减 1。
  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    selectedPages.map((page) => page - 1),
  )

  copiedPages.forEach((page) => outputPdf.addPage(page))

  // 写入基础元数据，下载后的文件来源更清晰。
  outputPdf.setTitle(`BaiMeow 拆分 - ${fileItem.file.name}`)
  outputPdf.setProducer('BaiMeow')
  outputPdf.setCreator('BaiMeow 在线 PDF 工具')

  onProgress?.(78)

  const pdfBytes = await outputPdf.save()
  const baseName = fileItem.file.name.replace(/\.pdf$/i, '')
  const filename = `${baseName}-第${selectedPages.join('_')}页.pdf`

  onProgress?.(100)

  return {
    blob: createBinaryBlob(pdfBytes, 'application/pdf'),
    filename,
    description: `已从 ${totalPages} 页中提取 ${selectedPages.length} 页`,
  }
}

/**
 * 按待处理列表的顺序合并多个 PDF。
 * 列表顺序就是最终 PDF 的页面顺序，因此组件中提供了上移、下移按钮。
 */
export async function mergePdfs(
  fileItems: PdfFileItem[],
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  if (fileItems.length < 2) {
    throw new Error('合并 PDF 至少需要选择两个文件。')
  }

  const { PDFDocument } = await import('pdf-lib')
  const outputPdf = await PDFDocument.create()
  let mergedPages = 0

  for (let index = 0; index < fileItems.length; index += 1) {
    const currentItem = fileItems[index]

    if (!currentItem) {
      continue
    }

    const sourcePdf = await PDFDocument.load(await currentItem.file.arrayBuffer())
    const copiedPages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())

    copiedPages.forEach((page) => outputPdf.addPage(page))
    mergedPages += copiedPages.length

    // 用当前已处理文件数量计算百分比，保证进度条能平滑推进。
    const percent = 10 + Math.round(((index + 1) / fileItems.length) * 78)
    onProgress?.(percent)
  }

  outputPdf.setTitle('BaiMeow 合并文档')
  outputPdf.setProducer('BaiMeow')
  outputPdf.setCreator('BaiMeow 在线 PDF 工具')

  const pdfBytes = await outputPdf.save()
  const dateText = new Date().toISOString().slice(0, 10)

  onProgress?.(100)

  return {
    blob: createBinaryBlob(pdfBytes, 'application/pdf'),
    filename: `BaiMeow合并-${dateText}.pdf`,
    description: `已合并 ${fileItems.length} 个文件，共 ${mergedPages} 页`,
  }
}

// PDF.js 文本项经过转换后，保留文字在页面上的坐标。
interface PositionedText {
  text: string
  x: number
  y: number
  width: number
}

// 行数据包含纵坐标和排序后的单元格。
interface PositionedRow {
  y: number
  items: PositionedText[]
}

/**
 * 将 PDF 页面中的文字按“同一水平线为一行”进行分组。
 *
 * PDF 本身没有表格概念，一段表格文字通常由很多碎片组成。
 * 因此我们读取每个碎片的位置：y 坐标接近的碎片归为一行，
 * 同一行内再根据 x 坐标从左到右排列。
 */
function groupTextItemsIntoRows(items: PositionedText[]): string[][] {
  const rows: PositionedRow[] = []

  items
    .filter((item) => item.text.trim())
    .sort((a, b) => {
      // PDF 坐标系通常从下往上，所以 y 越大表示越靠上。
      if (Math.abs(a.y - b.y) > 2.5) return b.y - a.y
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
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x)

      const cells: string[] = []
      let lastRightEdge = Number.NEGATIVE_INFINITY

      row.items.forEach((item) => {
        const cleanedText = item.text.replace(/\s+/g, ' ').trim()
        if (!cleanedText) return

        /*
         * 两个文字碎片之间横向距离超过 10 个 PDF 单位时，
         * 通常表示它们属于不同表格列，因此开始一个新单元格。
         */
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
 * 尝试找出课表表头并从表头开始保留数据。
 * 如果无法识别表头，就保留全部文本行，确保不会因为格式差异而丢失内容。
 */
function normalizeScheduleRows(rows: string[][]): string[][] {
  const weekdayPattern =
    /(周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日)/
  const headerIndex = rows.findIndex(
    (row) => row.filter((cell) => weekdayPattern.test(cell)).length >= 2,
  )

  const usefulRows = headerIndex >= 0 ? rows.slice(headerIndex) : rows

  // 课表表头通常有 6～8 列，保留至少两列的包含文字的行，过滤页码等噪声。
  const filteredRows = usefulRows.filter((row) => row.join('').trim().length > 0)
  const maxColumnCount = Math.max(1, ...filteredRows.map((row) => row.length))

  // 不同文字的列数可能不同，补齐空单元格后导出的表格会更整齐。
  return filteredRows.map((row) => {
    const normalizedRow = [...row]
    while (normalizedRow.length < maxColumnCount) {
      normalizedRow.push('')
    }
    return normalizedRow
  })
}

/**
 * 使用 pdfjs-dist 提取 PDF 文字，再使用 xlsx 导出 Excel。
 *
 * 重要限制：只能处理“文字型 PDF”。如果课表是扫描图片，
 * 需要 OCR 才能识别，不能仅靠 JavaScript 直接提取文字。
 */
export async function convertPdfScheduleToExcel(
  fileItem: PdfFileItem,
  onProgress?: ProgressCallback,
): Promise<GeneratedPdfFile> {
  onProgress?.(8)

  /*
   * PDF.js、Worker 和 XLSX 都按需下载。
   * 用户只使用拆分或合并时，不会为课表转换提前下载这些较大的依赖。
   */
  const [pdfjsModule, workerModule, XLSX] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('xlsx'),
  ])

  // 首次进入课表转换时注册 Worker；后续再次转换直接复用。
  if (!pdfWorkerConfigured) {
    pdfjsModule.GlobalWorkerOptions.workerSrc = workerModule.default
    pdfWorkerConfigured = true
  }

  const fileBuffer = await fileItem.file.arrayBuffer()
  const loadingTask = pdfjsModule.getDocument({
    // PDF.js 可能修改传入的缓冲区，因此复制一份 Uint8Array。
    data: new Uint8Array(fileBuffer),
  })
  const pdf = await loadingTask.promise
  const allRows: string[][] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    const positionedItems: PositionedText[] = content.items
      .filter((item) => 'str' in item)
      .map((item) => {
        // PDF.js 的 transform 是一个长度为 6 的数组：[scaleX, skewY, skewX, scaleY, x, y]。
        const textItem = item as { str: string; transform: number[]; width: number }

        return {
          text: textItem.str,
          x: textItem.transform[4] ?? 0,
          y: textItem.transform[5] ?? 0,
          width: textItem.width ?? 0,
        }
      })

    allRows.push(...groupTextItemsIntoRows(positionedItems))

    // 多页 PDF 用空行分隔，避免不同页的末尾和开头粘连。
    if (pageNumber < pdf.numPages) {
      allRows.push([])
    }

    const percent = 12 + Math.round((pageNumber / pdf.numPages) * 65)
    onProgress?.(percent)
  }

  const scheduleRows = normalizeScheduleRows(allRows)

  if (scheduleRows.length === 0) {
    throw new Error('没有从 PDF 中读取到文字，请确认文件不是扫描图片。')
  }

  // 将普通二维数组转换为 Excel 工作表。
  const worksheet = XLSX.utils.aoa_to_sheet(scheduleRows)

  // 根据最长单元格设置列宽，导出的课表更容易阅读。
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

  /*
   * 第二个工作表记录转换说明，方便用户知道数据来自哪个文件，
   * 也可以在识别不完整时快速定位需要人工调整的部分。
   */
  const noteSheet = XLSX.utils.aoa_to_sheet([
    ['转换说明', '内容'],
    ['源文件', fileItem.file.name],
    ['转换时间', new Date().toLocaleString('zh-CN')],
    ['处理方式', '按文字横纵坐标还原行列，扫描版 PDF 需要先做 OCR'],
    ['温馨提示', '不同学校课表格式差异较大，导出后请检查合并单元格和跨行课程'],
  ])
  XLSX.utils.book_append_sheet(workbook, noteSheet, '转换说明')

  onProgress?.(88)

  const excelBinary = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  }) as ArrayBuffer

  const baseName = fileItem.file.name.replace(/\.pdf$/i, '')

  onProgress?.(100)

  return {
    blob: new Blob([excelBinary], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: `${baseName}-课表.xlsx`,
    description: `已识别 ${scheduleRows.length} 行内容并生成 Excel`,
  }
}
