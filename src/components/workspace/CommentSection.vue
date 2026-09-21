<!--
  CommentSection.vue 是页面底部留言区。
  当前没有后端，因此使用 localStorage 做本地演示，刷新页面后仍能看到自己的留言。
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ChatDotRound, Position } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// 单条留言的数据结构。
interface UserComment {
  id: number
  name: string
  content: string
  createdAt: string
}

// localStorage 使用固定键名，后续接入接口时只替换读写函数即可。
const COMMENT_STORAGE_KEY = 'baimeow-comments'

// 初次打开页面时显示一条站点欢迎留言，让评论区不会显得空荡。
const defaultComments: UserComment[] = [
  {
    id: 1,
    name: 'BaiMeow',
    content: '欢迎留下使用建议。以后接入后端后，这里可以替换成真实评论数据。',
    createdAt: new Date().toISOString(),
  },
]

// comments 是当前展示列表；输入中的姓名和内容分别保存在 form 中。
const comments = ref<UserComment[]>(defaultComments)
const form = reactive({
  name: '',
  content: '',
})

/**
 * 从 localStorage 读取历史留言。
 * JSON.parse 可能因旧数据损坏而报错，因此使用 try/catch 保证页面正常打开。
 */
function loadComments() {
  const rawValue = localStorage.getItem(COMMENT_STORAGE_KEY)
  if (!rawValue) return

  try {
    const parsedValue: unknown = JSON.parse(rawValue)

    // 只接受数组，且对内层数据做基础字段检查，避免异常值破坏页面。
    if (
      Array.isArray(parsedValue) &&
      parsedValue.every(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          'name' in item &&
          'content' in item &&
          'createdAt' in item,
      )
    ) {
      comments.value = parsedValue as UserComment[]
    }
  } catch {
    // 数据损坏时删除旧值，下一次提交留言会重新写入干净的数据。
    localStorage.removeItem(COMMENT_STORAGE_KEY)
  }
}

// 继续将最新留言同步到 localStorage。
function persistComments() {
  localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(comments.value))
}

/**
 * 提交留言：
 * 1. 清理首尾空格并校验必填；
 * 2. 用当前时间生成唯一 id；
 * 3. 将新留言放到数组开头，最新内容优先显示。
 */
function submitComment() {
  const trimmedName = form.name.trim()
  const trimmedContent = form.content.trim()

  if (!trimmedName || !trimmedContent) {
    ElMessage.warning('请填写昵称和留言内容。')
    return
  }

  comments.value.unshift({
    id: Date.now(),
    name: trimmedName.slice(0, 20),
    content: trimmedContent.slice(0, 300),
    createdAt: new Date().toISOString(),
  })

  form.name = ''
  form.content = ''
  persistComments()
  ElMessage.success('留言已保存在当前浏览器。')
}

// 将 ISO 时间转换为适合直接展示的中文格式。
function formatTime(dateText: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateText))
}

// 不同留言使用不同头像底色，避免列表过于单调。
const avatarColors = ['#526f66', '#2f9e91', '#cf765e', '#6d7fc8', '#9b7a52']

function getAvatarColor(commentId: number) {
  // 对数组长度取余，确保任意 id 都能得到有效索引。
  return avatarColors[commentId % avatarColors.length] ?? avatarColors[0]
}

// 组件挂载后读取历史数据；没有历史数据时保留默认欢迎留言。
onMounted(loadComments)
</script>

<template>
  <section class="comment-section">
    <div class="comment-heading">
      <div>
        <span class="section-index">03</span>
        <h2>留言评论</h2>
        <p>分享你的使用体验和想增加的功能</p>
      </div>

      <div class="comment-count">
        <el-icon :size="16"><ChatDotRound /></el-icon>
        <span>{{ comments.length }} 条留言</span>
      </div>
    </div>

    <div class="comment-layout">
      <!-- 留言输入卡 -->
      <div class="comment-form-card">
        <div class="form-title">
          <strong>写下想法</strong>
          <span>{{ form.content.length }}/300</span>
        </div>

        <el-input
          v-model="form.name"
          class="name-input"
          maxlength="20"
          placeholder="你的昵称"
          aria-label="留言昵称"
        />

        <el-input
          v-model="form.content"
          type="textarea"
          :rows="5"
          maxlength="300"
          resize="none"
          placeholder="你对 BaiMeow 有什么建议？"
          aria-label="留言内容"
        />

        <el-button type="primary" :icon="Position" @click="submitComment"> 发布留言 </el-button>
      </div>

      <!-- 留言列表，最新留言会出现在最前面。 -->
      <div class="comment-list">
        <article v-for="comment in comments" :key="comment.id" class="comment-item">
          <div
            class="comment-avatar"
            :style="{ backgroundColor: getAvatarColor(comment.id) }"
            aria-hidden="true"
          >
            {{ comment.name.slice(0, 1).toUpperCase() }}
          </div>

          <div class="comment-body">
            <div class="comment-meta">
              <strong>{{ comment.name }}</strong>
              <time :datetime="comment.createdAt">{{ formatTime(comment.createdAt) }}</time>
            </div>
            <p>{{ comment.content }}</p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 评论区与上方工具区留出明显间距，形成页面最后一个内容区块。 */
.comment-section {
  margin-top: 18px;
  padding: 20px;
  background: var(--bm-surface);
  border: 1px solid var(--bm-border);
  border-radius: 12px;
  box-shadow: var(--bm-shadow-soft);
}

.comment-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.section-index {
  color: var(--bm-accent);
  font-family: Georgia, serif;
  font-size: 11px;
  font-weight: 700;
}

.comment-heading h2 {
  margin: 4px 0 0;
  color: var(--bm-text-strong);
  font-size: 20px;
  line-height: 1.2;
}

.comment-heading p {
  margin: 5px 0 0;
  color: var(--bm-text-muted);
  font-size: 11px;
}

.comment-count {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--bm-primary);
  font-size: 11px;
  white-space: nowrap;
}

/* 左侧输入、右侧列表的比例基于内容重要程度设置。 */
.comment-layout {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.28fr);
  gap: 18px;
}

.comment-form-card {
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bm-surface-soft);
  border: 1px solid var(--bm-border);
  border-radius: 10px;
}

.form-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--bm-text-strong);
}

.form-title strong {
  font-size: 13px;
}

.form-title span {
  color: var(--bm-text-faint);
  font-size: 10px;
}

/* Element Plus 输入框通过深度选择器适配主题变量。 */
.comment-form-card :deep(.el-input__wrapper),
.comment-form-card :deep(.el-textarea__inner) {
  color: var(--bm-text);
  background: var(--bm-surface);
  box-shadow: 0 0 0 1px var(--bm-border-strong) inset;
}

.comment-form-card :deep(.el-input__wrapper.is-focus),
.comment-form-card :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--bm-primary) inset;
}

.comment-form-card :deep(.el-input__inner),
.comment-form-card :deep(.el-textarea__inner) {
  color: var(--bm-text);
}

.comment-form-card :deep(.el-input__inner::placeholder),
.comment-form-card :deep(.el-textarea__inner::placeholder) {
  color: var(--bm-text-faint);
}

/* 发布按钮占满宽度，移动端也更容易点击。 */
.comment-form-card :deep(.el-button) {
  width: 100%;
  min-height: 38px;
}

/* 留言列表限制高度，留言很多时内部滚动，不影响整个页面长度。 */
.comment-list {
  max-height: 320px;
  padding-right: 4px;
  overflow-y: auto;
}

/* 每条留言使用头像 + 正文结构。 */
.comment-item {
  padding: 13px 2px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.comment-item + .comment-item {
  border-top: 1px solid var(--bm-border);
}

.comment-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  color: #fff;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.comment-body {
  min-width: 0;
  flex: 1;
}

.comment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comment-meta strong {
  overflow: hidden;
  color: var(--bm-text-strong);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-meta time {
  flex: 0 0 auto;
  color: var(--bm-text-faint);
  font-size: 9px;
}

.comment-body p {
  margin: 6px 0 0;
  color: var(--bm-text-muted);
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .comment-section {
    padding: 15px;
  }

  .comment-layout {
    grid-template-columns: 1fr;
  }

  .comment-list {
    max-height: none;
  }
}

@media (max-width: 480px) {
  .comment-heading {
    align-items: flex-start;
  }

  .comment-count span {
    display: none;
  }
}
</style>
