/**
 * 应用入口文件。
 *
 * 这里负责完成三件事情：
 * 1. 引入全站基础样式；
 * 2. 注册 Vue 的全局插件（Pinia、Router、Element Plus）；
 * 3. 将根组件 App.vue 挂载到 index.html 中的 #app 节点。
 */
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

// 创建 Vue 应用实例。
const app = createApp(App)

// Pinia 负责管理跨组件状态，例如当前主题。
app.use(createPinia())

// Router 负责页面地址与页面组件的映射。
app.use(router)

// Element Plus 提供按钮、抽屉、提示、进度条等基础组件。
app.use(ElementPlus)

// 将应用挂载到浏览器 DOM 中。
app.mount('#app')
