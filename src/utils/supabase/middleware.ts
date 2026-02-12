
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protected Routes Logic
    // If user is NOT signed in and trying to access anything OTHER than login or auth callback or static assets
    // redirect to /login
    if (
        !user &&
        !request.nextUrl.pathname.startsWith('/login') &&
        !request.nextUrl.pathname.startsWith('/auth') &&
        !request.nextUrl.pathname.startsWith('/_next') &&
        !request.nextUrl.pathname.startsWith('/static') &&
        !request.nextUrl.pathname.startsWith('/pricing') &&
        !request.nextUrl.pathname.startsWith('/api/webhooks') &&
        request.nextUrl.pathname !== '/favicon.ico'
    ) {
        // Allow landing page? The user said "Auth: Permettere agli utenti di registrarsi". 
        // Assuming main page IS the app.
        // Redirect to login.
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // If user IS signed in and tries to go to login, redirect to home
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }


    return response
}
