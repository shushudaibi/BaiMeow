# BaiMeow

BaiMeow 是一个基于 Vue 3、TypeScript、Vite 和 Element Plus 的在线工具站。

当前包含：

- PDF 按页码范围拆分；
- 多个 PDF 按列表顺序合并；
- 文字型 PDF 课表导出为 Excel；
- 图片水印功能入口占位；
- 滚动公告、用户投稿广告位和本地留言区；
- 简约朴素风、小清新风、未来科技风三种主题。

所有 PDF 处理都在浏览器本地完成，文件不会上传到服务器。

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
