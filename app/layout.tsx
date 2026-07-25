import './globals.css'

import { getLocale, getMessages } from 'next-intl/server'

import CreateButton from '@/components/CreateButton'
import Head from 'next/head'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { SessionProvider } from '../components/SessionProvider'
import { EditProvider } from '@/components/EditContext'
import { Toaster } from '@/components/ui/toaster'
import { authOptions } from '@/lib/auth'
import { getProvider } from '@/lib/runtime/provider'
import { isAuthorizedToWrite } from '@/lib/runtime/authz'
import { getIconUrls } from '@/lib/githubApi'
import { getServerSession } from 'next-auth/next'
import { gowun_wodum } from '@/components/ui/font'
import { getSiteConfig } from '@/lib/siteConfig'
import Analytics from '@/components/Analytics'

export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession(authOptions)
  // Prefer the served site's config (so --dir/--repo show their own metadata);
  // fall back to the build-time config in production.
  const siteConfig = (await getProvider(session?.accessToken).getSiteConfig()) ?? getSiteConfig()

  const title = siteConfig.title
  const description = siteConfig.description

  const { iconPath } = await getIconPaths(session?.accessToken)

  return {
    title,
    description,
    keywords: siteConfig.keywords,
    authors: [{ name: siteConfig.author.name }],
    creator: siteConfig.author.name,
    publisher: siteConfig.author.name,
    manifest: '/manifest.json',
    openGraph: {
      title,
      description,
      images: [{ url: iconPath, width: 512, height: 512, alt: 'App Logo' }],
      type: 'website',
      siteName: siteConfig.title,
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [iconPath],
      creator: `@${siteConfig.social.twitter}`,
      site: `@${siteConfig.social.twitter}`,
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const session = await getServerSession(authOptions)
  // Show edit affordances only to whoever is actually authorized to write
  // (owner-only on a hosted OAuth deploy) — matches the editor/upload gate.
  const canEdit = await isAuthorizedToWrite(session)

  const { iconPath } = await getIconPaths(session?.accessToken)

  return (
    <html lang={locale}>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <link rel='apple-touch-icon' href={iconPath} />
      </Head>
      <Analytics />
      <body className={`${gowun_wodum.className} bg-[#f6f8fa]`}>
        <NextIntlClientProvider messages={messages}>
          <SessionProvider>
            <EditProvider canEdit={canEdit}>
              <main className='pb-20 m-auto'>{children}</main>
              <CreateButton messages={messages} />
              <Toaster />
            </EditProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

async function getIconPaths(accessToken: string | undefined) {
  const defaultIconPath = '/icon.jpg'
  const defaultAppleTouchIconPath = '/icon-144.jpg'

  if (accessToken) {
    const iconUrls = await getIconUrls(accessToken)
    return iconUrls
  }

  return {
    iconPath: defaultIconPath,
    appleTouchIconPath: defaultAppleTouchIconPath,
  }
}
