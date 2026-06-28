import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'hearth · tmux dashboard', template: '%s · hearth' },
  description: 'A browser TUI for managing tmux sessions across servers.',
  applicationName: 'hearth',
  appleWebApp: { capable: true, title: 'hearth', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0d0e0f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body>{children}</body>
    </html>
  )
}
