/**
 * PDF 预览与 PNG 导出工具。
 *
 * pdfuse-core 把 pdfjs-dist 封装在 `pdfuse-core/preview` 子路径中，
 * 因此本项目不再直接调用 pdfjs-dist API，只负责配置 Worker URL 和提供画布。
 */
import type { PDFDocumentProxy } from 'pdfuse-core/preview'

// 动态载入 pdfuse-core 的渲染模块，避免不使用预览时提前下载 PDF.js。
let previewModulePromise: Promise<typeof import('pdfuse-core/preview')> | null = null
let previewWorkerConfigured = false

async function getPreviewModule() {
  previewModulePromise ??= import('pdfuse-core/preview')
  return previewModulePromise
}

/**
 * 为 pdfuse-core/preview 配置 PDF.js Worker。
 * 项目中的 pdfjs-dist 与 pdfuse-core 已固定在同一版本，避免 Worker 协议不兼容。
 */
async function ensurePreviewWorker() {
  if (previewWorkerConfigured) return

  const [{ setPdfjsWorker }, pdfjsModule, workerModule] = await Promise.all([
    getPreviewModule(),
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])

  setPdfjsWorker(workerModule.default)
  pdfjsModule.GlobalWorkerOptions.workerSrc = workerModule.default
  previewWorkerConfigured = true
}

/**
 * 加载一个可复用的预览文档。
 * 调用方完成渲染后应执行 pdf.destroy() 释放缓存。
 */
export async function loadPdfPreview(source: File | Blob): Promise<PDFDocumentProxy> {
  await ensurePreviewWorker()

  /*
   * pdfuse-core/preview 内部使用 getDocument({ data })。
   * 为了让 STSong-Light + UniGB-UCS2-H 等 CID 字体正确解析，
   * 这里仍通过 pdfuse-core 的 renderPageToCanvas 渲染页面，但加载文档时
   * 补充 cMapUrl 和 standardFontDataUrl，保证预览与课表提取使用同一规则。
   */
  const pdfjsModule = await import('pdfjs-dist')
  const loadingTask = pdfjsModule.getDocument({
    data: new Uint8Array(await source.arrayBuffer()),
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  })

  return loadingTask.promise as Promise<PDFDocumentProxy>
}

/**
 * 将指定页面渲染到真实 canvas。
 * pageNumber 使用 1-based 页码，与用户界面显示保持一致。
 */
export async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale = 1,
) {
  await ensurePreviewWorker()
  const { renderPageToCanvas } = await getPreviewModule()
  return renderPageToCanvas(pdf, pageNumber, canvas, { scale })
}

/**
 * 把 PDF 页面导出为 PNG Blob。
 * 这里创建一个离屏 canvas，不依赖预览组件中正在显示的画布。
 */
export async function exportPdfPageAsPng(
  source: File | Blob,
  pageNumber: number,
  scale = 2,
): Promise<Blob> {
  const pdf = await loadPdfPreview(source)

  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error('导出页码超出文档范围。')
    }

    const canvas = document.createElement('canvas')
    await renderPdfPage(pdf, pageNumber, canvas, scale)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!blob) {
      throw new Error('浏览器无法生成 PNG 图片。')
    }

    return blob
  } finally {
    // 无论成功或失败都释放 PDF.js 页面缓存。
    await pdf.destroy()
  }
}
