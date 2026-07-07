'use server'

import { createClient as createServerSupabase } from '@/utils/supabase/server'
import { createClient as createStaticSupabase } from '@supabase/supabase-js'

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createServerSupabase()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // 1. Try to log in first
  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // 2. If login fails with credentials mismatch or not found
  if (authError && (authError.message.includes('Invalid login credentials') || authError.status === 400 || authError.status === 422)) {
    // Check if the database has any profiles (is it empty?)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)

    const isDatabaseEmpty = !profiles || profiles.length === 0

    if (isDatabaseEmpty && serviceRoleKey) {
      console.log('[Auth] Database empty. Checking for existing auth records to bootstrap Admin...')
      const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)
      
      // Look up existing users by listing them
      const { data: userData, error: listError } = await adminClient.auth.admin.listUsers()

      if (listError) {
        return { error: `Failed to check existing users: ${listError.message}` }
      }

      const existingUser = userData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      )

      if (existingUser) {
        console.log('[Auth] User already exists in Auth. Resetting password and confirming email...')
        const { error: updateError } = await adminClient.auth.admin.updateUserById(
          existingUser.id,
          {
            password: password,
            email_confirm: true,
            user_metadata: {
              name: 'System Administrator',
              phone: '+923445552403',
            }
          }
        )

        if (updateError) {
          return { error: `Failed to update existing admin: ${updateError.message}` }
        }
      } else {
        console.log('[Auth] Admin user does not exist. Creating new Admin user...')
        const { error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name: 'System Administrator',
            phone: '+923445552403',
          }
        })

        if (createError) {
          return { error: `Failed to create Admin: ${createError.message}` }
        }
      }

      // Retry sign in
      const retryLogin = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      authData = retryLogin.data
      authError = retryLogin.error
    }
  }

  // If there's still an error (e.g. wrong password on subsequent logins), return it
  if (authError) {
    return { error: authError.message }
  }

  if (!authData || !authData.user) {
    return { error: 'Authentication failed: User data not found.' }
  }

  // 3. Ensure profile exists (e.g. if the user existed in Auth but not in public.profiles)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single()

  if (!profile && serviceRoleKey) {
    console.log('[Auth] Profile missing for authenticated user. Creating Admin profile...')
    const adminClient = createStaticSupabase(supabaseUrl, serviceRoleKey)
    
    const { error: profileError } = await adminClient
      .from('profiles')
      .insert({
        id: authData.user.id,
        name: authData.user.user_metadata?.name || 'System Administrator',
        email: authData.user.email!,
        phone: authData.user.phone || authData.user.user_metadata?.phone || null,
        role: 'Admin'
      })

    if (profileError) {
      return { error: `Failed to create profile: ${profileError.message}` }
    }
  }

  // Fetch final user role
  const { data: finalProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !finalProfile) {
    return { success: true, redirectUrl: '/dashboard' }
  }

  if (finalProfile.role === 'Admin') {
    return { success: true, redirectUrl: '/admin' }
  } else {
    return { success: true, redirectUrl: '/dashboard' }
  }
}

export async function signOut() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  const { redirect } = await import('next/navigation')
  redirect('/')
}
