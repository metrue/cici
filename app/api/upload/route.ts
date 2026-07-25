import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { getProvider } from '@/lib/runtime/provider'
import { isAuthorizedToWrite } from '@/lib/runtime/authz'

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

    const url = await provider.uploadAsset(file as unknown as File)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Upload failed:', error)
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 })
  }
}
