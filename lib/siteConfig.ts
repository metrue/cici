// cici's shipped DEFAULT site config — a build-time static import (the path must
// be a literal, so it cannot go through contentPaths). This is only a fallback
// baked into the tool; the real runtime config comes from the active provider
// via contentPaths.siteConfig() (client.ts / publicClient.ts / localClient.server.ts,
// or GitHubProvider.getSiteConfig()). Keep this file's shape in sync with the
// SiteConfig interface below.
import siteConfig from '@/sample-content/cici.json'
import { headers } from 'next/headers'

export interface SiteConfig {
  title: string
  description: string
  author: {
    name: string
    bio: string
    location: string
  }
  keywords: string[]
  social: {
    github: string
    twitter: string
  }
  /** Analytics configuration. Umami is privacy-focused and cookie-free. */
  analytics?: {
    /** Set to true to enable tracking */
    enabled?: boolean
    /** Your Umami website ID (from cloud.umami.is or self-hosted) */
    umamiWebsiteId?: string
    /** Custom script URL (only if self-hosting Umami) */
    umamiScriptUrl?: string
  }
}

export function getSiteConfig(): SiteConfig {
  return siteConfig
}

export async function getDynamicBaseUrl(): Promise<string> {
  try {
    const headersList = await headers()
    const host = headersList.get('host')
    const protocol = headersList.get('x-forwarded-proto') || 'http'
    
    if (host) {
      return `${protocol}://${host}`
    }
  } catch (error) {
    // Fall back to a default URL if headers are not available
    console.warn('Could not get dynamic base URL, falling back to default:', error)
  }
  
  // Fallback for build time or when headers are not available
  return 'https://blog.minghe.me'
}