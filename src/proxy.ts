import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  const { pathname } = request.nextUrl

  // Ignore internal Next.js assets, public images, and WhatsApp webhook route
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/whatsapp/webhook') ||
    pathname === '/favicon.ico'
  ) {
    return response
  }

  // Create a quick local client to check authentication status
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const { createServerClient } = await import('@supabase/ssr')

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect admin and dashboard routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
