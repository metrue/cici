import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getProvider } from '@/lib/runtime/provider'
import { isAuthorizedToWrite } from '@/lib/runtime/authz'
import { normalizeUploadFile } from '@/lib/imageTranscode'
import type { AssetInput } from '@/lib/runtime/types'

/**
 * Image upload — one endpoint for every backend. Routes the file through the
 * active provider's `uploadAsset`:
 *   - local (`--dir`)  → writes to <dir>/assets, returns an /api/asset/… URL
 *   - github           → commits to the repo, returns a raw GitHub URL
 * Authorization matches the editor: owner-only on a hosted OAuth deploy.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const provider = getProvider(session?.accessToken)

  if (!(await isAuthorizedToWrite(session))) {
    return NextResponse.json(
      { error: 'Not authorized to upload.' },
      { status: 403 }
    )
  }

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    // HEIC (iPhone photos) → JPEG before storing, so it renders in every
    // browser. Non-HEIC files pass through untouched.
    const normalized = await normalizeUploadFile(file as unknown as AssetInput)

    const url = await provider.uploadAsset(normalized)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Upload failed:', error)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
