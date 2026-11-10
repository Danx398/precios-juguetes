import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' permite que funcione en GitHub Pages sin importar el nombre del repo
export default defineConfig({ plugins: [react()], base: './' })
