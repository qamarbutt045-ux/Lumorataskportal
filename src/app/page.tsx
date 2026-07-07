'use client'

import React, { useState } from 'react'
import { Mail, Lock, ArrowRight, Loader2, Activity, Info } from 'lucide-react'
import { signIn } from './auth-actions'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    const formData = new FormData(e.currentTarget)
    try {
      const result = await signIn(formData)
      if (result?.error) {
        setErrorMessage(result.error)
      } else if (result?.redirectUrl) {
        router.push(result.redirectUrl)
      }
    } catch (err: any) {
      if (err.message !== 'NEXT_REDIRECT') {
        setErrorMessage(err.message || 'An unexpected error occurred.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-screen relative overflow-hidden">
      {/* Background glow meshes */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-purple-500/10 blur-[80px]" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[350px] h-[350px] rounded-full bg-cyan-500/10 blur-[80px]" />

      <div className="w-full max-w-[440px] z-10 flex flex-col items-center">
        {/* Logo/Branding */}
        <div className="flex items-center gap-2.5 mb-8 select-none">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Activity className="w-5.5 h-5.5 text-white" />
            <div className="absolute inset-0 rounded-xl border border-white/20" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 font-sans">
              LUMORA
            </span>
            <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 font-mono">
              Task Management
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full glass-card rounded-2xl p-8 border border-white/8 relative">
          {/* Subtle top indicator glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-32 bg-gradient-to-r from-purple-500 to-cyan-500 neon-glow-purple" />

          <h2 className="text-2xl font-semibold tracking-wide text-white mb-2">
            Portal Access
          </h2>
          <p className="text-sm text-zinc-400 mb-6">
            Sign in to access your luxury command center.
          </p>

          {/* Onboarding Notice */}
          <div className="mb-5 p-3.5 rounded-lg bg-white/5 border border-white/8 text-[11px] text-zinc-400 flex gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p>
              <strong>Bootstrap Mode:</strong> Agar database khali hai, to pehla entered email aur password hi automatically **Admin account** ban jayega (requires Secret Key config).
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Address */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-medium text-zinc-400 tracking-wider uppercase font-mono">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="vance@aetheris.com"
                  className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-zinc-400 tracking-wider uppercase font-mono">
                Security Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 glass-input text-sm"
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 animate-fadeIn">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-lg font-medium text-sm transition-all duration-300 relative overflow-hidden group flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Authenticate</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
