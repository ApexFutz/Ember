import { useEffect, useState } from 'react'

// Reactive viewport check. Components branch their inline styles on this since
// the app styles inline (no CSS-module media queries). Default breakpoint 768px
// covers phones (375–414) and small tablets in portrait.
export function useIsMobile(maxWidth = 768): boolean {
  const query = `(max-width: ${maxWidth}px)`
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return isMobile
}
