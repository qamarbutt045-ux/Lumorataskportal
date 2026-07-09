'use client'

import React, { useState, useEffect } from 'react'
import { 
  Activity, Search, Calendar, User, LogOut, CheckCircle2, 
  Clock, AlertCircle, RefreshCw, Smartphone, Shield, Check, ArrowRight 
} from 'lucide-react'
import { signOut } from '../auth-actions'
import { updateTaskStatus } from './actions'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

interface Profile {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
}

interface Task {
  id: string
  title: string
  description: string | null
  assigned_to: string | null
  deadline: string
  status: 'Pending' | 'In Progress' | 'Done'
  created_at: string
  profiles?: Profile | null
  is_active?: boolean
  next_task_id?: string | null
  in_progress_at?: string | null
  duration_seconds?: number | null
}

interface DashboardClientProps {
  initialTasks: Task[]
  currentUserProfile: Profile
}

export default function DashboardClient({ 
  initialTasks, 
  currentUserProfile 
}: DashboardClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [isUpdating, setIsUpdating] = useState<string | null>(null) // holds taskId being updated
  const [isRefreshing, setIsRefreshing] = useState(false)

  const supabase = createClient()

  const fetchLatestTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          assigned_to,
          deadline,
          status,
          created_at,
          is_active,
          next_task_id,
          profiles:assigned_to (
            id,
            name,
            email,
            phone,
            role
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (data) {
        setTasks(data as unknown as Task[])
      }
    } catch (err) {
      console.error('Error fetching live tasks:', err)
    }
  }

  // Poll for changes every 5 seconds to provide "real-time" dashboard status updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLatestTasks()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchLatestTasks()
    setIsRefreshing(false)
  }

  const handleStatusChange = async (taskId: string, newStatus: 'Pending' | 'In Progress' | 'Done') => {
    setIsUpdating(taskId)
    try {
      const res = await updateTaskStatus(taskId, newStatus)
      if (res?.error) {
        alert(res.error)
      } else {
        await fetchLatestTasks()
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred while updating status')
    } finally {
      setIsUpdating(null)
    }
  }

  // Segment tasks
  const myTasks = tasks.filter(t => t.assigned_to === currentUserProfile.id)
  const otherTasks = tasks.filter(t => t.assigned_to !== currentUserProfile.id)

  const totalMyTasks = myTasks.length
  const completedMyTasks = myTasks.filter(t => t.status === 'Done').length
  const activeMyTasks = myTasks.filter(t => t.status === 'In Progress').length

  // Filter lists based on search & status filter
  const filterList = (taskList: Task[]) => {
    return taskList.filter(task => {
      const matchesSearch = 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.profiles?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }

  const filteredMyTasks = filterList(myTasks)
  const filteredOtherTasks = filterList(otherTasks)

  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return null
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins < 60) return `${mins}m ${secs}s`
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Luxury Navbar */}
      <nav className="glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 shadow-[0_0_10px_rgba(168,85,247,0.25)]">
            <Activity className="w-5 h-5 text-white" />
            <div className="absolute inset-0 rounded-lg border border-white/10" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-[0.25em] text-white">LUMORA</span>
            <span className="text-[9px] tracking-[0.2em] uppercase text-cyan-400 block font-mono">
              Workspace Portal
            </span>
          </div>
        </div>

        {/* Console status */}
        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-white/5">
          <div className="w-2 h-2 rounded-full bg-cyan-500 pulse-glow-cyan animate-pulse" />
          <span className="text-[10px] tracking-widest text-zinc-400 font-mono uppercase">
            Station Active - Link Online
          </span>
        </div>

        <div className="flex items-center gap-4">
          {currentUserProfile.role === 'Admin' && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-950/40 to-cyan-950/40 border border-purple-500/30 text-purple-300 hover:text-white hover:border-purple-400/50 hover:bg-purple-900/30 transition-all duration-300 text-xs font-mono font-medium"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin Console</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
          <div className="text-right hidden sm:block">
            <p className="text-xs font-mono text-zinc-500">Representative</p>
            <p className="text-sm font-semibold text-white tracking-wide">{currentUserProfile.name}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-red-950/20 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition-all duration-300 text-xs font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Terminate Session</span>
            </button>
          </form>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 relative z-10">
        
        {/* MEMBER STATS / METRICS BANNER */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-xl p-5 border border-white/5 flex flex-col">
            <span className="text-[10px] tracking-widest uppercase text-zinc-400 font-mono">My Assignments</span>
            <span className="text-3xl font-bold text-white mt-1">{totalMyTasks}</span>
          </div>

          <div className="glass-card rounded-xl p-5 border border-cyan-500/10 neon-glow-cyan flex flex-col">
            <span className="text-[10px] tracking-widest uppercase text-cyan-400 font-mono">Active Tasks</span>
            <span className="text-3xl font-bold text-cyan-300 mt-1">{activeMyTasks}</span>
          </div>

          <div className="glass-card rounded-xl p-5 border border-emerald-500/10 neon-glow-emerald flex flex-col">
            <span className="text-[10px] tracking-widest uppercase text-emerald-400 font-mono">Completed Tasks</span>
            <span className="text-3xl font-bold text-emerald-300 mt-1">{completedMyTasks}</span>
          </div>

          <div className="glass-card rounded-xl p-5 border border-white/5 flex flex-col">
            <span className="text-[10px] tracking-widest uppercase text-zinc-400 font-mono">Efficiency Rate</span>
            <span className="text-3xl font-bold text-zinc-100 mt-1">
              {totalMyTasks > 0 ? `${Math.round((completedMyTasks / totalMyTasks) * 100)}%` : '100%'}
            </span>
          </div>
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="glass-card rounded-xl p-4 border border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by Task Code, Title, or Assignee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs glass-input"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <div className="flex bg-zinc-950 border border-white/5 rounded-lg p-0.5">
              {['All', 'Pending', 'In Progress', 'Done'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-md text-[10px] tracking-wider uppercase font-mono font-medium transition-all ${
                    statusFilter === status 
                      ? 'bg-white/10 text-white border border-white/5 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-200"
              title="Sync Workspace Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* GRID COLUMNS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: My Assigned Tasks (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-widest text-zinc-400 uppercase font-mono flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                My Assigned Operations ({filteredMyTasks.length})
              </h2>
            </div>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
              {filteredMyTasks.map(task => {
                const statusColors = {
                  Pending: {
                    badge: 'bg-purple-950/40 border-purple-500/20 text-purple-400',
                    dot: 'bg-purple-500',
                    glow: 'neon-glow-purple',
                  },
                  'In Progress': {
                    badge: 'bg-cyan-950/40 border-cyan-500/20 text-cyan-400',
                    dot: 'bg-cyan-500',
                    glow: 'neon-glow-cyan',
                  },
                  Done: {
                    badge: 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400',
                    dot: 'bg-emerald-500',
                    glow: 'neon-glow-emerald',
                  },
                }

                const colors = statusColors[task.status] || statusColors.Pending

                return (
                  <div 
                    key={task.id} 
                    className={`glass-card rounded-xl p-5 border border-white/5 ${colors.glow} flex flex-col justify-between gap-4`}
                  >
                    <div className="space-y-2">
                      {/* Code, Status, Deadline */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold tracking-widest text-white font-mono bg-zinc-950 border border-white/10 px-2 py-0.5 rounded">
                            {task.id}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono tracking-widest uppercase flex items-center gap-1.5 ${colors.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {task.status}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-650" />
                            <span>Deadline: {formatDate(task.deadline)}</span>
                          </span>
                          {task.duration_seconds !== null && task.duration_seconds !== undefined && (
                            <span className="text-emerald-450 font-semibold flex items-center gap-1">
                              ⏱️ Completed in: {formatDuration(task.duration_seconds)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title & Description */}
                      <div>
                        <h3 className="text-base font-semibold text-white tracking-wide">{task.title}</h3>
                        {task.description && (
                          <p className="text-xs text-zinc-400 mt-1 font-light leading-relaxed">{task.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Inline Status Transition Buttons */}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                        Change Status:
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {!task.is_active ? (
                          <div className="flex items-center gap-1.5 text-xs text-amber-500 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>🔒 Locked (Awaiting Predecessor)</span>
                          </div>
                        ) : isUpdating === task.id ? (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Updating...</span>
                          </div>
                        ) : (
                          <>
                            {/* Pending Button */}
                            <button
                              onClick={() => handleStatusChange(task.id, 'Pending')}
                              disabled={task.status === 'Pending'}
                              className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wider uppercase border transition-all ${
                                task.status === 'Pending'
                                  ? 'bg-purple-950/30 border-purple-500/40 text-purple-300'
                                  : 'bg-zinc-950 border-white/5 text-zinc-500 hover:text-purple-400 hover:border-purple-500/30'
                              }`}
                            >
                              Pending
                            </button>

                            {/* Active Button */}
                            <button
                              onClick={() => handleStatusChange(task.id, 'In Progress')}
                              disabled={task.status === 'In Progress'}
                              className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wider uppercase border transition-all ${
                                task.status === 'In Progress'
                                  ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-300'
                                  : 'bg-zinc-950 border-white/5 text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/30'
                              }`}
                            >
                              Active
                            </button>

                            {/* Done Button */}
                            <button
                              onClick={() => handleStatusChange(task.id, 'Done')}
                              disabled={task.status === 'Done'}
                              className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-wider uppercase border transition-all ${
                                task.status === 'Done'
                                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                                  : 'bg-zinc-950 border-white/5 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30'
                              }`}
                            >
                              Done
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredMyTasks.length === 0 && (
                <div className="glass-card rounded-xl p-8 border border-white/5 text-center">
                  <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2.5 bg-emerald-500/10 p-1.5 rounded-full" />
                  <p className="text-sm font-semibold text-zinc-400">All Operations Completed</p>
                  <p className="text-xs text-zinc-500 mt-0.5">No tasks assigned to your terminal code.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Other Workspace Tasks (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-sm font-semibold tracking-widest text-zinc-400 uppercase font-mono flex items-center gap-2">
              Team Tracker ({filteredOtherTasks.length})
            </h2>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredOtherTasks.map(task => {
                const statusColors = {
                  Pending: {
                    badge: 'bg-purple-950/40 border-purple-500/20 text-purple-400',
                    dot: 'bg-purple-500',
                  },
                  'In Progress': {
                    badge: 'bg-cyan-950/40 border-cyan-500/20 text-cyan-400',
                    dot: 'bg-cyan-500',
                  },
                  Done: {
                    badge: 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400',
                    dot: 'bg-emerald-500',
                  },
                }

                const colors = statusColors[task.status] || statusColors.Pending

                return (
                  <div 
                    key={task.id} 
                    className="glass-card rounded-xl p-4 border border-white/5 flex flex-col gap-2 hover:bg-zinc-900/40 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold tracking-widest text-white font-mono bg-zinc-950 border border-white/5 px-1.5 py-0.5 rounded">
                          {task.id}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-mono tracking-widest uppercase flex items-center gap-1 ${colors.badge}`}>
                          <span className={`w-1 h-1 rounded-full ${colors.dot}`} />
                          {task.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">{formatDate(task.deadline)}</span>
                    </div>

                    <h4 className="text-sm font-medium text-white tracking-wide">{task.title}</h4>
                    
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono pt-1 border-t border-white/3">
                      <User className="w-3 h-3 text-zinc-650" />
                      <span>Assignee: <span className="text-zinc-400">{task.profiles?.name || 'Unassigned'}</span></span>
                    </div>
                  </div>
                )
              })}

              {filteredOtherTasks.length === 0 && (
                <div className="glass-card rounded-xl p-8 border border-white/5 text-center text-zinc-500 text-xs">
                  No other active workspace tasks found.
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
