/**
 * PDF 功能目录。
 *
 * 菜单、工作台标题、按钮文字和文件是否支持多选全部从这一份配置读取。
 * 这样可以避免“菜单里改了名称，工作台仍然是旧名称”的问题。
 */
import type { Component } from 'vue'
import {
  Collection,
  Connection,
  Crop,
  Delete,
  DocumentCopy,
  Download,
  EditPen,
  Files,
  Grid,
  InfoFilled,
  Plus,
  Rank,
  RefreshRight,
  Scissor,
  Sort,
  Stamp,
  SwitchButton,
  Tickets,
} from '@element-plus/icons-vue'
import type { PdfToolKey, PdfToolOptions } from '@/types/pdf'

// 每一个 PDF 工具在界面上需要展示的完整信息。
export interface PdfToolDefinition {
  key: PdfToolKey
  label: string
  description: string
  title: string
  subtitle: string
  actionText: string
  icon: Component
  acceptMultiple: boolean
}

// 二级菜单分类。PDF 顶层下的第一层分类就是“常用功能”等。
export interface PdfToolCategory {
  key: 'common' | 'pages' | 'content' | 'convert'
  label: string
  description: string
  icon: Component
  tools: PdfToolDefinition[]
}

/**
 * 菜单顺序与用户使用频率保持一致：
 * 先放常用功能，再按页面、内容、转换三个处理类型细分。
 */
export const PDF_TOOL_CATEGORIES: PdfToolCategory[] = [
  {
    key: 'common',
    label: '常用功能',
    description: '最常使用的 PDF 操作',
    icon: Collection,
    tools: [
      {
        key: 'merge',
        label: 'PDF 合并',
        description: '多个文档按顺序合并',
        title: 'PDF 合并',
        subtitle: '使用 pdfuse-core 读取并合并多个 PDF，列表顺序就是最终页面顺序',
        actionText: '开始合并',
        icon: Connection,
        acceptMultiple: true,
      },
      {
        key: 'split',
        label: 'PDF 拆分',
        description: '按页码范围生成新文档',
        title: 'PDF 拆分',
        subtitle: '保留输入范围内的页面，并使用 pdfuse-core 创建新的 PDF',
        actionText: '开始拆分',
        icon: Scissor,
        acceptMultiple: false,
      },
      {
        key: 'extract',
        label: '提取页面',
        description: '连续或不连续页面都可提取',
        title: '提取 PDF 页面',
        subtitle: '输入 1-3,6,8 这样的范围，把需要的页面重新组合为一个文件',
        actionText: '提取选中页面',
        icon: DocumentCopy,
        acceptMultiple: false,
      },
    ],
  },
  {
    key: 'pages',
    label: '页面管理',
    description: '调整页面组成与方向',
    icon: Files,
    tools: [
      {
        key: 'delete-pages',
        label: '删除页面',
        description: '移除不需要的页面',
        title: '删除 PDF 页面',
        subtitle: '输入需要删除的页码，其余页面会自动按原顺序保留',
        actionText: '删除并生成新文件',
        icon: Delete,
        acceptMultiple: false,
      },
      {
        key: 'rotate',
        label: '旋转页面',
        description: '统一调整页面方向',
        title: '旋转 PDF 页面',
        subtitle: '对指定页面统一旋转 90、180 或 270 度',
        actionText: '旋转选中页面',
        icon: RefreshRight,
        acceptMultiple: false,
      },
      {
        key: 'reorder',
        label: '页面重排',
        description: '自定义完整页面顺序',
        title: 'PDF 页面重排',
        subtitle: '新顺序必须包含全部页面且每页只出现一次，避免意外丢页',
        actionText: '应用新顺序',
        icon: Rank,
        acceptMultiple: false,
      },
      {
        key: 'insert-blank',
        label: '插入空白页',
        description: '在指定位置增加空白页',
        title: '插入空白页面',
        subtitle: '设置插入位置和页面尺寸，常用于双面打印与章节分隔',
        actionText: '插入空白页',
        icon: Plus,
        acceptMultiple: false,
      },
    ],
  },
  {
    key: 'content',
    label: '内容与版式',
    description: '添加标记或调整可见区域',
    icon: EditPen,
    tools: [
      {
        key: 'page-numbers',
        label: '添加页码',
        description: '批量写入页码',
        title: '添加 PDF 页码',
        subtitle: '选择位置、起始页码和字号，在指定页面写入页码',
        actionText: '写入页码',
        icon: Tickets,
        acceptMultiple: false,
      },
      {
        key: 'text-watermark',
        label: '文字水印',
        description: '添加倾斜文字标记',
        title: '添加 PDF 文字水印',
        subtitle: '使用标准字体写入英文、数字与常用符号水印',
        actionText: '添加水印',
        icon: Stamp,
        acceptMultiple: false,
      },
      {
        key: 'crop',
        label: '页面裁剪',
        description: '设置页面可见边距',
        title: '裁剪 PDF 页面',
        subtitle: '输入四边需要裁掉的点数，页面内容不会被永久删除',
        actionText: '应用页面裁剪',
        icon: Crop,
        acceptMultiple: false,
      },
    ],
  },
  {
    key: 'convert',
    label: '信息与导出',
    description: '检查、转换与优化文档',
    icon: SwitchButton,
    tools: [
      {
        key: 'inspect',
        label: '文档体检',
        description: '查看页数与元数据',
        title: 'PDF 文档体检',
        subtitle: '读取页数、页面尺寸和标题作者等信息，不会上传文件',
        actionText: '生成体检结果',
        icon: InfoFilled,
        acceptMultiple: false,
      },
      {
        key: 'metadata',
        label: '修改文档信息',
        description: '编辑标题与作者等字段',
        title: '修改 PDF 文档信息',
        subtitle: '更新标题、作者、主题和关键词，便于归档和检索',
        actionText: '保存文档信息',
        icon: EditPen,
        acceptMultiple: false,
      },
      {
        key: 'export-png',
        label: '页面导出 PNG',
        description: '把当前页转换为图片',
        title: 'PDF 页面导出 PNG',
        subtitle: '使用 pdfuse-core 页面渲染能力，把预览中的当前页导出为高清 PNG',
        actionText: '导出当前页 PNG',
        icon: Download,
        acceptMultiple: false,
      },
      {
        key: 'schedule',
        label: '课表转 Excel',
        description: '提取文字型课表',
        title: 'PDF 课表转 Excel',
        subtitle: '通过 pdfuse-core 的 PDF.js 预览模块读取文字坐标并生成 Excel',
        actionText: '转换为 Excel',
        icon: Grid,
        acceptMultiple: false,
      },
      {
        key: 'optimize',
        label: '优化保存',
        description: '重写对象结构减小体积',
        title: '优化保存 PDF',
        subtitle: '使用对象流重新保存文档，适合清理冗余结构，但不会压缩原始图片',
        actionText: '优化并保存',
        icon: Sort,
        acceptMultiple: false,
      },
    ],
  },
]

// 把分类中的所有工具展开成一维数组，方便快速按 key 查询。
export const PDF_TOOLS: PdfToolDefinition[] = PDF_TOOL_CATEGORIES.flatMap(
  (category) => category.tools,
)

// Map 查询比在模板中循环查找更清晰，也能在缺失配置时立即暴露错误。
const pdfToolMap = new Map<PdfToolKey, PdfToolDefinition>(PDF_TOOLS.map((tool) => [tool.key, tool]))

/**
 * 根据工具键取得显示配置。
 * 配置缺失通常意味着类型联合和菜单配置不同步，因此直接抛出明确错误。
 */
export function getPdfToolDefinition(toolKey: PdfToolKey): PdfToolDefinition {
  const definition = pdfToolMap.get(toolKey)

  if (!definition) {
    throw new Error(`没有找到 PDF 工具配置：${toolKey}`)
  }

  return definition
}

// 工作台初始化时使用的默认参数。
export function createDefaultPdfToolOptions(): PdfToolOptions {
  return {
    pageRange: '1-3',
    pageOrder: '1,2,3',
    angle: 90,
    insertAfter: 1,
    blankWidth: 595,
    blankHeight: 842,
    numberPosition: 'bottom-center',
    numberStart: 1,
    numberFontSize: 10,
    watermarkText: 'BAIMEOW',
    watermarkOpacity: 0.18,
    watermarkRotation: -35,
    watermarkFontSize: 42,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    cropLeft: 0,
    metadataTitle: '',
    metadataAuthor: '',
    metadataSubject: '',
    metadataKeywords: '',
  }
}
