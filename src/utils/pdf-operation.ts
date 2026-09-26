/**
 * PDF 核心操作执行器。
 *
 * 这个模块同时可以被主线程和 Web Worker 使用：
 * - 加载与页面合并使用 pdfuse-core；
 * - 旋转、页码、水印、裁剪等高级编辑使用 pdfuse-core 返回的 pdfDoc；
 * - 最终统一返回 Uint8Array 或文档体检结果。
 *
 * 把核心逻辑放在独立模块后，Worker 只是一个很薄的消息转发层。
 * 如果浏览器不支持模块 Worker，主线程也可以直接调用这里的函数作为降级方案。
 */
import { loadPdfDocument, mergeSelectedPages } from 'pdfuse-core'
import { degrees, rgb, StandardFonts } from 'pdf-lib'
import type { PdfInspection } from '@/types/pdf'
import type { PdfOperationResult, PdfWorkerOperation, PdfWorkerSource } from '@/types/pdf-worker'

// pdfuse-core 返回的 UploadedPDF 结构，额外保留原始 Worker 数据。
interface LoadedSource {
  id: string
  file: File
  pdfDoc: Awaited<ReturnType<typeof loadPdfDocument>>['pdfDoc']
  totalPages: number
}

/**
 * 在 Worker 或主线程中把普通 ArrayBuffer 重新包装为 File。
 * pdfuse-core 的入口使用浏览器 File，因此这里保持它要求的标准输入格式。
 */
function createPdfFile(source: PdfWorkerSource): File {
  return new File([source.data], source.name, {
    type: source.type || 'application/pdf',
    lastModified: source.lastModified,
  })
}

/**
 * 使用 pdfuse-core 统一加载所有 PDF。
 */
async function loadSources(sources: PdfWorkerSource[]): Promise<LoadedSource[]> {
  if (sources.length === 0) {
    throw new Error('没有可处理的 PDF 文件。')
  }

  return Promise.all(
    sources.map(async (source, index) => {
      const file = createPdfFile(source)
      const loaded = await loadPdfDocument(file)

      return {
        id: source.name ? `${source.name}-${index}` : `pdf-${index}`,
        file,
        pdfDoc: loaded.pdfDoc,
        totalPages: loaded.totalPages,
      }
    }),
  )
}

// 文档体检只需要第一个文件，单独取出来可以让分支代码更清晰。
function getFirstSource(loadedSources: LoadedSource[]): LoadedSource {
  const firstSource = loadedSources[0]

  if (!firstSource) {
    throw new Error('没有可处理的 PDF 文件。')
  }

  return firstSource
}

// 清理空字符串和 undefined，统一转换为界面可直接使用的文本。
function normalizeMetadataValue(value: string | undefined): string {
  return value?.trim() ?? ''
}

/**
 * 读取 PDF 的基础信息。
 * 这里只加载第一页尺寸，因为跨页尺寸不一致时，第一页最适合作默认参考。
 */
async function inspectDocument(loadedSources: LoadedSource[]): Promise<PdfInspection> {
  const source = getFirstSource(loadedSources)
  const firstPage = source.pdfDoc.getPage(0)
  const { width, height } = firstPage.getSize()

  return {
    pageCount: source.totalPages,
    pageSize: {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    },
    title: normalizeMetadataValue(source.pdfDoc.getTitle()),
    author: normalizeMetadataValue(source.pdfDoc.getAuthor()),
    subject: normalizeMetadataValue(source.pdfDoc.getSubject()),
    keywords: normalizeMetadataValue(source.pdfDoc.getKeywords()),
    creator: normalizeMetadataValue(source.pdfDoc.getCreator()),
    producer: normalizeMetadataValue(source.pdfDoc.getProducer()),
  }
}

// 将 Uint8Array 复制为普通 ArrayBuffer，便于 Worker Transferable 传输。
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(output).set(bytes)
  return output
}

// 所有会修改文档的操作最终都通过这里保存。
async function saveDocument(
  pdfDoc: Awaited<ReturnType<typeof loadPdfDocument>>['pdfDoc'],
  useObjectStreams = false,
): Promise<Uint8Array> {
  return pdfDoc.save({
    useObjectStreams,
    addDefaultPage: false,
  })
}

/**
 * 根据请求类型执行 PDF 操作。
 *
 * 所有分支都返回结构化结果，不直接操作 DOM，也不弹出提示，
 * 因此调用方可以在主线程或 Worker 中复用同一套逻辑。
 */
export async function executePdfOperation(
  operation: PdfWorkerOperation,
): Promise<PdfOperationResult> {
  switch (operation.operation) {
    case 'inspect': {
      const loadedSources = await loadSources(operation.sources)
      return {
        resultType: 'inspection',
        inspection: await inspectDocument(loadedSources),
      }
    }

    case 'select-pages': {
      const loadedSources = await loadSources(operation.sources)
      const bytes = await mergeSelectedPages(loadedSources, operation.selectedOrder)

      return {
        resultType: 'bytes',
        bytes,
      }
    }

    case 'rotate': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)
      const selectedPages = new Set(operation.pages)

      source.pdfDoc.getPages().forEach((page, index) => {
        if (!selectedPages.has(index + 1)) return

        // pdf-lib 的 Rotation.angle 已经是从 0 开始的顺时针角度，
        // 与原角度相加后再取 360 的余数，可以继续叠加旋转。
        const currentAngle = page.getRotation().angle
        const nextAngle = (((currentAngle + operation.angle) % 360) + 360) % 360
        page.setRotation(degrees(nextAngle))
      })

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc),
      }
    }

    case 'insert-blank': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)

      if (operation.pageIndex < 0 || operation.pageIndex > source.totalPages) {
        throw new Error('插入位置超出当前文档的页数范围。')
      }

      if (operation.width <= 0 || operation.height <= 0) {
        throw new Error('空白页宽度和高度必须大于 0。')
      }

      // pdf-lib 的 insertPage 使用 0-based 插入位置。
      source.pdfDoc.insertPage(operation.pageIndex, [operation.width, operation.height])

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc, true),
      }
    }

    case 'page-numbers': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)
      const font = await source.pdfDoc.embedFont(StandardFonts.Helvetica)
      const selectedPages = new Set(operation.pages)
      const margin = 28

      source.pdfDoc.getPages().forEach((page, index) => {
        const pageNumber = index + 1
        if (!selectedPages.has(pageNumber)) return

        const { width, height } = page.getSize()
        const text = String(operation.startNumber + index)
        const textWidth = font.widthOfTextAtSize(text, operation.fontSize)
        const textHeight = font.heightAtSize(operation.fontSize)
        let x = margin
        let y = margin

        if (operation.position === 'bottom-center') {
          x = (width - textWidth) / 2
          y = margin
        } else if (operation.position === 'bottom-right') {
          x = width - textWidth - margin
          y = margin
        } else {
          x = width - textWidth - margin
          y = height - textHeight - margin
        }

        page.drawText(text, {
          x,
          y,
          size: operation.fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        })
      })

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc),
      }
    }

    case 'text-watermark': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)

      if (!operation.text.trim()) {
        throw new Error('请输入水印文字。')
      }

      /*
       * pdf-lib 的标准字体只覆盖 WinAnsi 字符集。
       * 这里明确拒绝中文等非标准字符，避免出现乱码或字体编码错误。
       */
      if (!/^[\x20-\x7E]+$/.test(operation.text)) {
        throw new Error('文字水印当前只支持英文、数字和常用符号。')
      }

      const font = await source.pdfDoc.embedFont(StandardFonts.Helvetica)
      const selectedPages = new Set(operation.pages)
      const safeOpacity = Math.min(Math.max(operation.opacity, 0.02), 1)

      source.pdfDoc.getPages().forEach((page, index) => {
        if (!selectedPages.has(index + 1)) return

        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(operation.text, operation.fontSize)
        const textHeight = font.heightAtSize(operation.fontSize)

        page.drawText(operation.text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: operation.fontSize,
          font,
          color: rgb(0.35, 0.35, 0.35),
          opacity: safeOpacity,
          rotate: degrees(operation.rotation),
        })
      })

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc),
      }
    }

    case 'crop': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)
      const selectedPages = new Set(operation.pages)

      source.pdfDoc.getPages().forEach((page, index) => {
        if (!selectedPages.has(index + 1)) return

        const { width, height } = page.getSize()
        const cropWidth = width - operation.left - operation.right
        const cropHeight = height - operation.top - operation.bottom

        if (cropWidth <= 10 || cropHeight <= 10) {
          throw new Error('裁剪边距过大，页面剩余区域必须大于 10 × 10 点。')
        }

        page.setCropBox(operation.left, operation.bottom, cropWidth, cropHeight)
      })

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc),
      }
    }

    case 'metadata': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)

      source.pdfDoc.setTitle(operation.title.trim())
      source.pdfDoc.setAuthor(operation.author.trim())
      source.pdfDoc.setSubject(operation.subject.trim())
      source.pdfDoc.setKeywords(
        operation.keywords
          .split(/[,，]/)
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      )
      source.pdfDoc.setProducer('BaiMeow + pdfuse-core')
      source.pdfDoc.setCreator('BaiMeow')
      source.pdfDoc.setModificationDate(new Date())

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc),
      }
    }

    case 'optimize': {
      const loadedSources = await loadSources(operation.sources)
      const source = getFirstSource(loadedSources)

      return {
        resultType: 'bytes',
        bytes: await saveDocument(source.pdfDoc, true),
      }
    }

    default: {
      // TypeScript 的 never 分支确保以后新增 operation 时不会漏掉实现。
      const unreachableOperation: never = operation
      throw new Error(`暂不支持该 PDF 操作：${String(unreachableOperation)}`)
    }
  }
}

// 对外暴露复制函数，Worker 发送结果时需要使用标准 ArrayBuffer。
export { copyToArrayBuffer }
