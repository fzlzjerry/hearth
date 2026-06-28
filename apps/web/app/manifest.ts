import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'hearth — tmux dashboard',
    short_name: 'hearth',
    description: 'A browser TUI for managing tmux sessions across servers.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0e0f',
    theme_color: '#0d0e0f',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
