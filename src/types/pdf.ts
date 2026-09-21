/**
 * PDF 工具相关的共享类型。
 *
 * 把这些类型单独放在 types 目录中，可以让侧栏、工作台和工具函数
 * 使用同一套类型定义，避免字符串或对象结构在不同文件里不一致。
 */

// ToolKey 表示左侧菜单当前选择的工具。
export type ToolKey = 'split' | 'merge' | 'schedule' | 'watermark'

// PDF 文件进入待处理列表后，会附加上页面数等展示所需的信息。
export interface PdfFileItem {
  // id 是浏览器内生成的文件标识，用于列表渲染和删除。
  id: string
  // file 保留用户选择的原始 File 对象，处理时直接读取。
  file: File
  // pageCount 通过 pdf-lib 读取，读取完成前为 undefined。
  pageCount?: number
  // status 让界面可以区分“正在读取”和“已就绪”。
  status: 'loading' | 'ready' | 'error'
}

// 工具处理后生成的下载文件信息。
export interface GeneratedPdfFile {
  // blob 是要下载的二进制文件内容。
  blob: Blob
  // filename 是浏览器下载时默认使用的文件名。
  filename: string
  // description 用于向用户展示本次处理结果摘要。
  description: string
}
