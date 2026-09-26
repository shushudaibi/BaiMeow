/**
 * PDF 工具相关的共享类型。
 *
 * 这一层只描述数据结构，不依赖 Vue、Element Plus 或具体 PDF 库。
 * 菜单配置、Web Worker、工作台和工具函数都复用这里的类型，
 * 后续增加新的 PDF 功能时，编译器可以帮助检查遗漏的分支。
 */

/**
 * 所有真正执行 PDF 处理的工具键。
 * 图片水印没有放进这个联合类型，因为它的页面入口属于图片处理区。
 */
export type PdfToolKey =
  // 常用功能
  | 'merge'
  | 'split'
  | 'extract'
  // 页面管理
  | 'delete-pages'
  | 'rotate'
  | 'reorder'
  | 'insert-blank'
  // 内容与版式
  | 'page-numbers'
  | 'text-watermark'
  | 'crop'
  // 信息与导出
  | 'inspect'
  | 'metadata'
  | 'export-png'
  | 'schedule'
  | 'optimize'

// ToolKey 是页面级功能键，在 PDF 工具之外还包括暂时占位的图片水印。
export type ToolKey = PdfToolKey | 'watermark'

// 页面尺寸使用 PDF 点（point）作为单位，1 英寸等于 72 点。
export interface PdfPageSize {
  width: number
  height: number
}

/**
 * PDF 体检结果。
 * inspect 操作不会修改文件，因此它返回结构化信息而不是下载 Blob。
 */
export interface PdfInspection {
  pageCount: number
  pageSize: PdfPageSize
  title: string
  author: string
  subject: string
  keywords: string
  creator: string
  producer: string
}

// PDF 文件进入待处理列表后，会附加上页面数量和体检信息。
export interface PdfFileItem {
  // id 是浏览器内生成的文件标识，用于列表渲染和删除。
  id: string
  // file 保留用户选择的原始 File 对象，处理时读取其 ArrayBuffer。
  file: File
  // pageCount 由 pdfuse-core 的 loadPdfDocument 读取。
  pageCount?: number
  // inspection 保存文档信息，元数据编辑工具会用它预填表单。
  inspection?: PdfInspection
  // status 让界面可以区分“正在读取”和“已就绪”。
  status: 'loading' | 'ready' | 'error'
}

// 工具处理后生成的下载文件信息。
export interface GeneratedPdfFile {
  // kind 用于区分“可下载文件”和“只读体检结果”。
  kind: 'file'
  // blob 是要下载的二进制文件内容。
  blob: Blob
  // filename 是浏览器下载时默认使用的文件名。
  filename: string
  // description 用于向用户展示本次处理结果摘要。
  description: string
  // Excel 等结构化结果可以附带二维预览数据；
  // PDF 和 PNG 不使用该字段，仍通过 renderer 直接预览。
  previewRows?: string[][]
}

// 文档体检结果是只读信息，不需要生成下载文件。
export interface PdfInspectionResult {
  kind: 'info'
  title: string
  description: string
  inspection: PdfInspection
}

// 工作台统一使用这个联合类型渲染结果区域。
export type PdfToolResult = GeneratedPdfFile | PdfInspectionResult

/**
 * 左侧菜单和工作台共用的表单参数。
 *
 * 不同工具只读取自己需要的字段，这样可以让 Web Worker 请求保持简单，
 * 也避免给每一种工具单独创建一套平行的状态对象。
 */
export interface PdfToolOptions {
  // 页码范围，工具内部会解析成 1、2、3 这样的页码数组。
  pageRange: string
  // 新页面顺序，例如 3,1,2 表示原第 3 页放到最前。
  pageOrder: string
  // 旋转角度，只允许 0、90、180、270 这类有效值。
  angle: number
  // 在指定页码之后插入空白页；0 表示插入到第一页之前。
  insertAfter: number
  // 空白页尺寸，默认 A4 的 595 × 842 点。
  blankWidth: number
  blankHeight: number
  // 页码设置
  numberPosition: 'bottom-center' | 'bottom-right' | 'top-right'
  numberStart: number
  numberFontSize: number
  // 文字水印设置
  watermarkText: string
  watermarkOpacity: number
  watermarkRotation: number
  watermarkFontSize: number
  // 页面裁剪，单位均为 PDF 点。
  cropTop: number
  cropRight: number
  cropBottom: number
  cropLeft: number
  // 文档元数据
  metadataTitle: string
  metadataAuthor: string
  metadataSubject: string
  metadataKeywords: string
}
