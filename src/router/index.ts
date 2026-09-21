/**
 * 项目路由配置。
 *
 * 对于这个工具站首页，路由系统不是必需的，但保留它可以让后续加入
 * “使用帮助、用户中心、图片处理”等独立页面时，不必重新调整项目入口。
 */
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  // createWebHistory 使用正常的浏览器地址，例如 /、/about。
  // import.meta.env.BASE_URL 会自动兼容部署到子目录的情况。
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
  ],
})

export default router
