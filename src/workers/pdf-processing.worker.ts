/// <reference lib="webworker" />

/**
 * PDF 处理 Web Worker。
 *
 * 大文件的页面复制、旋转、字符绘制和重新保存都可能在主线程造成掉帧。
 * 这个 Worker 把 pdfuse-core 的核心任务放到独立线程，主线程只负责：
 * 1. 读取原始 ArrayBuffer；
 * 2. 发送结构化请求；
 * 3. 接收处理后的 ArrayBuffer 并创建下载 Blob。
 */
import { copyToArrayBuffer, executePdfOperation } from '@/utils/pdf-operation'
import type { PdfWorkerRequest, PdfWorkerResponse } from '@/types/pdf-worker'

// DedicatedWorkerGlobalScope 提供 postMessage、onmessage 等 Worker 专属 API。
const workerScope = self as DedicatedWorkerGlobalScope

/**
 * Worker 的消息处理函数。
 * 任何未捕获异常都会转换成 success: false，防止主线程 Promise 永久等待。
 */
workerScope.onmessage = async (event: MessageEvent<PdfWorkerRequest>) => {
  const request = event.data

  try {
    /*
     * request.id 只是通信协议字段，核心执行器不需要它。
     * 解构后会得到纯粹的 PdfWorkerOperation。
     */
    const { id, ...operation } = request
    const result = await executePdfOperation(operation)

    if (result.resultType === 'inspection') {
      const response: PdfWorkerResponse = {
        id,
        success: true,
        resultType: 'inspection',
        inspection: result.inspection,
      }

      workerScope.postMessage(response)
      return
    }

    const response: PdfWorkerResponse = {
      id,
      success: true,
      resultType: 'bytes',
      data: copyToArrayBuffer(result.bytes),
    }

    // Transferable 让结果缓冲区直接转移所有权，避免大 PDF 再复制一次。
    workerScope.postMessage(response, [response.data])
  } catch (error) {
    const response: PdfWorkerResponse = {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : 'PDF Worker 处理失败。',
    }

    workerScope.postMessage(response)
  }
}
