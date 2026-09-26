/**
 * 主线程与 PDF Web Worker 之间的消息协议。
 *
 * File 对象不能直接被 Worker 安全复用，因此这里只传递文件名、类型、
 * 修改时间和 ArrayBuffer。Worker 收到后会重新构造标准 File 对象，
 * 再交给 pdfuse-core 的 loadPdfDocument 处理。
 */
import type { PageSelectionKey } from 'pdfuse-core'
import type { PdfInspection } from '@/types/pdf'

// 可结构化克隆的 PDF 源文件数据。
export interface PdfWorkerSource {
  name: string
  type: string
  lastModified: number
  data: ArrayBuffer
}

// 页面位置设置由主线程计算成 PDF 坐标，Worker 只负责绘制。
export type PageNumberPosition = 'bottom-center' | 'bottom-right' | 'top-right'

/**
 * Worker 接收的操作联合类型。
 *
 * 使用 operation 字段区分具体任务，TypeScript 会在 switch 分支中
 * 自动收窄每个任务独有的字段，例如 rotate 一定会有 angle。
 */
export type PdfWorkerOperation =
  | {
      operation: 'inspect'
      sources: PdfWorkerSource[]
    }
  | {
      operation: 'select-pages'
      sources: PdfWorkerSource[]
      selectedOrder: PageSelectionKey[]
    }
  | {
      operation: 'rotate'
      sources: PdfWorkerSource[]
      pages: number[]
      angle: number
    }
  | {
      operation: 'insert-blank'
      sources: PdfWorkerSource[]
      pageIndex: number
      width: number
      height: number
    }
  | {
      operation: 'page-numbers'
      sources: PdfWorkerSource[]
      pages: number[]
      startNumber: number
      fontSize: number
      position: PageNumberPosition
    }
  | {
      operation: 'text-watermark'
      sources: PdfWorkerSource[]
      pages: number[]
      text: string
      opacity: number
      rotation: number
      fontSize: number
    }
  | {
      operation: 'crop'
      sources: PdfWorkerSource[]
      pages: number[]
      top: number
      right: number
      bottom: number
      left: number
    }
  | {
      operation: 'metadata'
      sources: PdfWorkerSource[]
      title: string
      author: string
      subject: string
      keywords: string
    }
  | {
      operation: 'optimize'
      sources: PdfWorkerSource[]
    }

// Worker 请求会附带一个递增 id，确保多个任务并发时能对应正确结果。
export type PdfWorkerRequest = PdfWorkerOperation & {
  id: number
}

// 二进制结果统一回传为 ArrayBuffer，便于使用 Transferable 高效传输。
export type PdfWorkerResponse =
  | {
      id: number
      success: true
      resultType: 'bytes'
      data: ArrayBuffer
    }
  | {
      id: number
      success: true
      resultType: 'inspection'
      inspection: PdfInspection
    }
  | {
      id: number
      success: false
      error: string
    }

// 主线程处理函数的统一返回结构。
export type PdfOperationResult =
  | {
      resultType: 'bytes'
      bytes: Uint8Array
    }
  | {
      resultType: 'inspection'
      inspection: PdfInspection
    }
