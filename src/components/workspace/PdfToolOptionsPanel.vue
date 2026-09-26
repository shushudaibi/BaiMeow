<!--
  PdfToolOptionsPanel.vue 根据当前工具显示对应的参数表单。

  把表单拆成独立组件，可以避免 PdfWorkspace 同时承担文件管理、参数编辑、
  Worker 调用和结果展示四类职责。
-->
<script setup lang="ts">
import type { PdfToolKey, PdfToolOptions } from '@/types/pdf'

// tool 决定显示哪些字段，options 使用 defineModel 支持 v-model 双向绑定。
const props = defineProps<{
  tool: PdfToolKey
  options: PdfToolOptions
}>()

// options 是父组件传入的响应式对象，子组件直接修改字段即可同步到工作台。
const options = props.options
</script>

<template>
  <!-- 合并、预览、文档体检、PNG 导出和优化保存不需要额外参数。 -->
  <div v-if="['split', 'extract', 'delete-pages'].includes(props.tool)" class="option-panel">
    <div class="option-copy">
      <strong>{{ props.tool === 'delete-pages' ? '需要删除的页码' : '需要处理的页码' }}</strong>
      <span>支持 1-3,5,8-10 格式，页码从 1 开始</span>
    </div>
    <el-input
      v-model="options.pageRange"
      class="range-input"
      placeholder="1-3,5"
      aria-label="PDF 页码范围"
    />
  </div>

  <!-- 旋转页面 -->
  <div v-else-if="props.tool === 'rotate'" class="option-grid">
    <label class="field-block">
      <span>旋转页码</span>
      <el-input v-model="options.pageRange" placeholder="1-3,5" aria-label="旋转页码" />
    </label>

    <label class="field-block">
      <span>旋转角度</span>
      <el-radio-group v-model="options.angle" class="segmented-control">
        <el-radio-button :value="90">90°</el-radio-button>
        <el-radio-button :value="180">180°</el-radio-button>
        <el-radio-button :value="270">270°</el-radio-button>
      </el-radio-group>
    </label>
  </div>

  <!-- 页面重排 -->
  <div v-else-if="props.tool === 'reorder'" class="option-panel column">
    <div class="option-copy">
      <strong>完整页面顺序</strong>
      <span>必须包含全部页面且每页只出现一次，例如 3,1,2,4</span>
    </div>
    <el-input
      v-model="options.pageOrder"
      type="textarea"
      :rows="3"
      resize="none"
      placeholder="3,1,2,4"
      aria-label="PDF 页面新顺序"
    />
  </div>

  <!-- 插入空白页 -->
  <div v-else-if="props.tool === 'insert-blank'" class="option-grid four-columns">
    <label class="field-block">
      <span>插入到第几页后</span>
      <el-input-number
        v-model="options.insertAfter"
        :min="0"
        :max="9999"
        controls-position="right"
      />
      <small>0 表示插到第一页之前</small>
    </label>

    <label class="field-block">
      <span>宽度（点）</span>
      <el-input-number
        v-model="options.blankWidth"
        :min="50"
        :max="5000"
        controls-position="right"
      />
    </label>

    <label class="field-block">
      <span>高度（点）</span>
      <el-input-number
        v-model="options.blankHeight"
        :min="50"
        :max="5000"
        controls-position="right"
      />
    </label>
  </div>

  <!-- 添加页码 -->
  <div v-else-if="props.tool === 'page-numbers'" class="option-grid four-columns">
    <label class="field-block">
      <span>页码范围</span>
      <el-input v-model="options.pageRange" placeholder="1-3,5" aria-label="添加页码范围" />
    </label>

    <label class="field-block">
      <span>显示位置</span>
      <el-select v-model="options.numberPosition">
        <el-option label="底部居中" value="bottom-center" />
        <el-option label="底部右侧" value="bottom-right" />
        <el-option label="顶部右侧" value="top-right" />
      </el-select>
    </label>

    <label class="field-block">
      <span>起始数字</span>
      <el-input-number
        v-model="options.numberStart"
        :min="0"
        :max="99999"
        controls-position="right"
      />
    </label>

    <label class="field-block">
      <span>字号</span>
      <el-input-number
        v-model="options.numberFontSize"
        :min="6"
        :max="48"
        controls-position="right"
      />
    </label>
  </div>

  <!-- 文字水印 -->
  <div v-else-if="props.tool === 'text-watermark'" class="watermark-options">
    <div class="option-grid">
      <label class="field-block">
        <span>水印文字</span>
        <el-input
          v-model="options.watermarkText"
          maxlength="40"
          placeholder="BAIMEOW"
          aria-label="PDF 水印文字"
        />
        <small>标准字体仅支持英文、数字和常用符号</small>
      </label>

      <label class="field-block">
        <span>应用页码</span>
        <el-input v-model="options.pageRange" placeholder="1-3,5" aria-label="水印页码" />
      </label>
    </div>

    <div class="option-grid three-columns">
      <label class="field-block slider-field">
        <span>透明度 {{ Math.round(options.watermarkOpacity * 100) }}%</span>
        <el-slider v-model="options.watermarkOpacity" :min="0.02" :max="1" :step="0.01" />
      </label>

      <label class="field-block slider-field">
        <span>旋转角度 {{ options.watermarkRotation }}°</span>
        <el-slider v-model="options.watermarkRotation" :min="-180" :max="180" :step="5" />
      </label>

      <label class="field-block slider-field">
        <span>字号 {{ options.watermarkFontSize }}</span>
        <el-slider v-model="options.watermarkFontSize" :min="10" :max="120" :step="2" />
      </label>
    </div>
  </div>

  <!-- 页面裁剪 -->
  <div v-else-if="props.tool === 'crop'" class="crop-options">
    <label class="field-block full-width">
      <span>裁剪页码</span>
      <el-input v-model="options.pageRange" placeholder="1-3,5" aria-label="裁剪页码" />
    </label>

    <div class="option-grid four-columns">
      <label class="field-block">
        <span>上边距（点）</span>
        <el-input-number v-model="options.cropTop" :min="0" :max="1000" controls-position="right" />
      </label>

      <label class="field-block">
        <span>右边距（点）</span>
        <el-input-number
          v-model="options.cropRight"
          :min="0"
          :max="1000"
          controls-position="right"
        />
      </label>

      <label class="field-block">
        <span>下边距（点）</span>
        <el-input-number
          v-model="options.cropBottom"
          :min="0"
          :max="1000"
          controls-position="right"
        />
      </label>

      <label class="field-block">
        <span>左边距（点）</span>
        <el-input-number
          v-model="options.cropLeft"
          :min="0"
          :max="1000"
          controls-position="right"
        />
      </label>
    </div>
  </div>

  <!-- 元数据编辑 -->
  <div v-else-if="props.tool === 'metadata'" class="option-grid two-columns">
    <label class="field-block">
      <span>标题</span>
      <el-input v-model="options.metadataTitle" placeholder="文档标题" />
    </label>

    <label class="field-block">
      <span>作者</span>
      <el-input v-model="options.metadataAuthor" placeholder="作者或组织" />
    </label>

    <label class="field-block">
      <span>主题</span>
      <el-input v-model="options.metadataSubject" placeholder="文档主题" />
    </label>

    <label class="field-block">
      <span>关键词</span>
      <el-input v-model="options.metadataKeywords" placeholder="学习, PDF, 归档" />
    </label>
  </div>
</template>

<style scoped>
/* 表单区域与文件队列保持统一表面和间距。 */
.option-panel,
.option-grid,
.watermark-options,
.crop-options {
  margin-top: 14px;
}

.option-panel {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 9px;
}

.option-panel.column {
  align-items: stretch;
  flex-direction: column;
  gap: 9px;
}

.option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.option-copy strong,
.field-block > span {
  color: var(--bm-text-strong);
  font-size: 11px;
  font-weight: 700;
}

.option-copy span,
.field-block small {
  color: var(--bm-text-faint);
  font-size: 9px;
  line-height: 1.4;
}

.range-input {
  width: 146px;
  flex: 0 0 146px;
}

/* 网格字段用于形成整齐的参数面板。 */
.option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 13px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 9px;
}

.option-grid.three-columns {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.option-grid.four-columns {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.option-grid.two-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-block.full-width {
  margin-bottom: 12px;
}

.field-block :deep(.el-input-number),
.field-block :deep(.el-select) {
  width: 100%;
}

.field-block :deep(.el-input__wrapper),
.field-block :deep(.el-textarea__inner),
.field-block :deep(.el-select__wrapper) {
  color: var(--bm-text);
  background: var(--bm-surface);
  box-shadow: 0 0 0 1px var(--bm-border-strong) inset;
}

.field-block :deep(.el-input__inner),
.field-block :deep(.el-textarea__inner) {
  color: var(--bm-text);
}

/* 旋转角度使用分段按钮，比下拉菜单更适合只有三个选项的场景。 */
.segmented-control {
  width: 100%;
}

.segmented-control :deep(.el-radio-button) {
  flex: 1;
}

.segmented-control :deep(.el-radio-button__inner) {
  width: 100%;
}

/* 水印和裁剪是多个小网格的组合，因此只保留外层间距。 */
.watermark-options,
.crop-options {
  display: grid;
  gap: 10px;
}

.slider-field :deep(.el-slider) {
  margin: 0 4px;
}

@media (max-width: 900px) {
  .option-grid.four-columns,
  .option-grid.three-columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .option-panel {
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
  }

  .range-input {
    width: 100%;
    flex-basis: auto;
  }

  .option-grid,
  .option-grid.four-columns,
  .option-grid.three-columns,
  .option-grid.two-columns {
    grid-template-columns: 1fr;
  }
}
</style>
