'use client'

import { createContext, useContext } from 'react'

/**
 * Whether editing is available, computed server-side via `isAuthorizedToWrite()`
 * and pushed to the client. True when:
 *   - local mode (`--dir` / `next dev`), or
 *   - localhost CLI with `--token`, or
 *   - a hosted OAuth deploy and the logged-in user is the repo owner.
 * The render layer uses this instead of inspecting the session or the backend
 * kind directly.
 */
const EditContext = createContext(false)

export function EditProvider({
  canEdit,
  children,
}: {
  canEdit: boolean
  children: React.ReactNode
}) {
  return <EditContext.Provider value={canEdit}>{children}</EditContext.Provider>
}

export function useCanEdit(): boolean {
  return useContext(EditContext)
}
