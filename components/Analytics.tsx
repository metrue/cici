'use client'

import Script from 'next/script'
import { useEffect } from 'react'

interface AnalyticsProps {
  websiteId?: string
  scriptUrl?: string
  domains?: string[]
  enabled?: boolean
}

/**
 * Umami Analytics — privacy-focused, cookie-free tracking.
 *
 * Props are passed from the server component (layout.tsx) at runtime.
 * Configuration priority: --umami-site CLI > cici.json > NEXT_PUBLIC_* env.
 */
export default function Analytics({
  websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
  scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js',
  domains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS?.split(',') || [],
  enabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true'
}: AnalyticsProps = {}) {
  useEffect(() => {
    // Log configuration in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Analytics Configuration:', {
        enabled,
        websiteId: websiteId ? '***' + websiteId.slice(-4) : 'Not set',
        scriptUrl,
        domains,
        environment: process.env.NODE_ENV
      })
    }
  }, [enabled, websiteId, scriptUrl, domains])

  // Don't render if analytics is disabled or required config is missing
  if (!enabled || !websiteId) {
    return null
  }

  return (
    <>
      <Script
        src={scriptUrl}
        data-website-id={websiteId}
        data-domains={domains.length > 0 ? domains.join(',') : undefined}
        strategy="afterInteractive"
        onLoad={() => {
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Umami Analytics loaded successfully')
          }
        }}
        onError={(e) => {
          console.error('❌ Failed to load Umami Analytics:', e)
        }}
      />
    </>
  )
}

// Umami global interface
declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void
    }
  }
}

/**
 * Custom event tracking hook
 * Usage: const trackEvent = useUmamiTracking()
 *        trackEvent('button-click', { button: 'header-cta' })
 */
export function useUmamiTracking() {
  const trackEvent = (eventName: string, eventData?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && window.umami) {
      window.umami.track(eventName, eventData)
    } else if (process.env.NODE_ENV === 'development') {
      console.log('📊 Would track event:', eventName, eventData)
    }
  }

  return trackEvent
}

/**
 * Page view tracking hook for manual tracking
 * Usage: const trackPageView = useUmamiPageView()
 *        trackPageView('/custom-page', 'Custom Page Title')
 */
export function useUmamiPageView() {
  const trackPageView = (url?: string, title?: string) => {
    if (typeof window !== 'undefined' && window.umami) {
      window.umami.track('pageview', { url, title })
    } else if (process.env.NODE_ENV === 'development') {
      console.log('📊 Would track page view:', { url, title })
    }
  }

  return trackPageView
}
