import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawBasePath = env.VITE_BASE_PATH?.trim() || '/'
  const startsWithSlash = rawBasePath.startsWith('/')
  const withLeadingSlash = startsWithSlash ? rawBasePath : `/${rawBasePath}`
  const normalizedBasePath =
    withLeadingSlash === '/' || withLeadingSlash.endsWith('/')
      ? withLeadingSlash
      : `${withLeadingSlash}/`

  return {
    plugins: [react()],
    base: normalizedBasePath,
  }
})
