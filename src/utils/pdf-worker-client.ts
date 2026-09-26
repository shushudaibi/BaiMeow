/**
 * PDF Worker 客户端。
 *
 * 该模块负责创建 Worker、管理请求 id 和把 Worker 消息转换成 Promise。
 * 组件调用时只需要传入与 PDF 功能对应的操作对象。
 */
import type {
  PdfOperationResult,
  PdfWorkerOperation,
  PdfWorkerRequest,
  PdfWorkerResponse,
} from '@/types/pdf-worker'

// 等待中的请求使用 id 保存 resolve、reject，多个操作并发也不会串结果。
interface PendingRequest {
  resolve: (result: PdfOperationResult) => void
  reject: (error: Error) => void
}

let pdfWorker: Worker | null = null
let requestSequence = 0
const pendingRequests = new Map<number, PendingRequest>()

/**
 * 创建单例 Worker。
 * Vite 的 new URL(..., import.meta.url) 会在构建时正确生成 Worker 资源地址。
 */
function getPdfWorker(): Worker {
  if (pdfWorker) return pdfWorker

  pdfWorker = new Worker(new URL('../workers/pdf-processing.worker.ts', import.meta.url), {
    type: 'module',
  })

  pdfWorker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
    const response = event.data
    const pending = pendingRequests.get(response.id)

    if (!pending) return
    pendingRequests.delete(response.id)

    if (!response.success) {
      pending.reject(new Error(response.error))
      return
    }

    if (response.resultType === 'inspection') {
      pending.resolve({
        resultType: 'inspection',
        inspection: response.inspection,
      })
      return
    }

    pending.resolve({
      resultType: 'bytes',
      bytes: new Uint8Array(response.data),
    })
  }

  pdfWorker.onerror = (event) => {
    const error = new Error(event.message || 'PDF Worker 无法启动。')

    // Worker 整体异常时所有请求都无法完成，因此统一拒绝并允许下次重新创建。
    pendingRequests.forEach((pending) => pending.reject(error))
    pendingRequests.clear()
    pdfWorker?.terminate()
    pdfWorker = null
  }

  return pdfWorker
}

/**
 * 在 Worker 中执行 PDF 操作。
 * 如果运行环境没有 Worker API，则动态加载核心模块并在当前线程执行。
 */
export async function runPdfWorkerOperation(
  operation: PdfWorkerOperation,
): Promise<PdfOperationResult> {
  if (typeof Worker === 'undefined') {
    const { executePdfOperation } = await import('@/utils/pdf-operation')
    return executePdfOperation(operation)
  }

  const worker = getPdfWorker()
  const id = ++requestSequence

  return new Promise<PdfOperationResult>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })

    const request: PdfWorkerRequest = {
      ...operation,
      id,
    }

    try {
      /*
       * 输入没有使用 Transferable，因为主线程可能在 Worker 失败或用户重试时
       * 继续保留原始文件。ArrayBuffer 会被结构化克隆，Worker 端修改不会影响原文件。
       */
      worker.postMessage(request)
    } catch (error) {
      pendingRequests.delete(id)
      reject(error instanceof Error ? error : new Error('无法向 PDF Worker 发送任务。'))
    }
  })
}

/**
 * 页面卸载时终止 Worker，释放 PDF.js 和 pdf-lib 占用的大内存。
 * 开发环境下模块热更新也会调用这个清理函数。
 */
export function disposePdfWorker() {
  pdfWorker?.terminate()
  pdfWorker = null
  pendingRequests.clear()
}
