# BaiMeow

BaiMeow 是一个基于 Vue 3、TypeScript、Vite 和 Element Plus 的在线工具站。

当前包含：

- 常用功能：PDF 合并、PDF 拆分、页面提取；
- 页面管理：删除页面、旋转页面、页面重排、插入空白页；
- 内容与版式：添加页码、文字水印、页面裁剪；
- 信息与导出：文档体检、修改元数据、页面导出 PNG、课表转 Excel、优化保存；
- 图片水印功能入口占位；
- 滚动公告、用户投稿广告位和本地留言区；
- 简约朴素风、小清新风、未来科技风三种主题。

PDF 加载、页面选择和合并使用 `pdfuse-core`，缩略图与页面渲染使用
`pdfuse-core/preview`。旋转、水印、页码等批量操作会进入 Web Worker，
所有文件始终在浏览器本地处理，不会上传到服务器。

页面预览不是独立菜单，而是每个工具共用的“处理前 / 处理后”效果区域。

## 本地运行

项目要求 Node.js 22.18 或更高版本。

```bash
npm install
npm run dev
```

生产构建与类型检查：

```bash
npm run type-check
npm run build
```

## Logo 放置位置

当前 Logo 读取路径是：

```text
src/assets/logo.png
```

直接替换这张图片即可，建议使用正方形图片，并控制在 200 KB 左右。页面代码位于
`src/components/layout/AppHeader.vue`，如需换成 `.webp`、`.svg` 等其他格式，只需要同步修改
该文件顶部的图片导入路径。

浏览器标签页图标位于：

```text
public/favicon.ico
```

## 项目结构

完整的 Mermaid 架构图、目录树、文件用途和三种主题实现说明见：

[项目架构与文件说明](docs/PROJECT_STRUCTURE.md)
