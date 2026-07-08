'use client'

import React, { useState, useEffect } from 'react'
import { 
  Activity, Plus, Search, Calendar, User, Trash2, LogOut, CheckCircle, 
  Clock, AlertCircle, RefreshCw, Smartphone, Users, ShieldAlert, KeyRound 
} from 'lucide-react'
import { signOut } from '../auth-actions'
import { createTask, deleteTask, createTeamMember } from './actions'
import { updateTaskStatus } from '../dashboard/actions'
import { createClient } from '@/utils/supabase/client'

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
}

interface AdminDashboardClientProps {
  initialTasks: Task[]
  profiles: Profile[]
  adminName: string
}

export default function AdminDashboardClient({ 
  initialTasks, 
  profiles, 
  adminName 
}: AdminDashboardClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [activeTab, setActiveTab] = useState<'task' | 'member'>('task')
  
  // Task form state
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null)

  // Member form state
  const [isSubmittingMember, setIsSubmittingMember] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null)

  const [isRefreshing, setIsRefreshing] = useState(false)

  // Initialize browser-based Supabase client for polling
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

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formElement = e.currentTarget // Capture reference synchronously
    setIsSubmittingTask(true)
    setTaskError(null)
    setTaskSuccess(null)

    const formData = new FormData(formElement)
    try {
      const res = await createTask(formData)
      if (res.error) {
        setTaskError(res.error)
      } else {
        setTaskSuccess(`Task successfully generated under Code: ${res.task?.id}`)
        formElement.reset() // Safely reset using captured reference
        await fetchLatestTasks()
      }
    } catch (err: any) {
      setTaskError(err.message || 'An error occurred while creating the task')
    } finally {
      setIsSubmittingTask(false)
    }
  }

  const handleCreateMember = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formElement = e.currentTarget // Capture reference synchronously
    setIsSubmittingMember(true)
    setMemberError(null)
    setMemberSuccess(null)

    const formData = new FormData(formElement)
    try {
      const res = await createTeamMember(formData)
      if (res.error) {
        setMemberError(res.error)
      } else {
        setMemberSuccess('Representative registered successfully! Account is verified and active.')
        formElement.reset() // Safely reset using captured reference
        // Wait for server state revalidation
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (err: any) {
      setMemberError(err.message || 'An error occurred during registration')
    } finally {
      setIsSubmittingMember(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm(`Are you sure you want to decommission Task ${taskId}?`)) return

    try {
      const res = await deleteTask(taskId)
      if (res.error) {
        alert(res.error)
      } else {
        await fetchLatestTasks()
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred while deleting the task')
    }
  }

  const handleMarkAsDone = async (taskId: string) => {
    if (!confirm(`Are you sure you want to mark Task ${taskId} as Done manually?`)) return

    try {
      const res = await updateTaskStatus(taskId, 'Done')
      if (res.error) {
        alert(res.error)
      } else {
        await fetchLatestTasks()
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred while updating the task status')
    }
  }

  // Compute metrics
  const totalTasks = tasks.length
  const pendingTasks = tasks.filter(t => t.status === 'Pending').length
  const progressTasks = tasks.filter(t => t.status === 'In Progress').length
  const completedTasks = tasks.filter(t => t.status === 'Done').length

  // Filter tasks based on search & status filter
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.profiles?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'All' || task.status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Format date utility
  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
            <span className="text-[9px] tracking-[0.2em] uppercase text-purple-400 block font-mono">
              Admin Command
            </span>
          </div>
        </div>

        {/* Live Network Status Indicator */}
        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-white/5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-glow-cyan animate-pulse" />
          <span className="text-[10px] tracking-widest text-zinc-400 font-mono uppercase">
            System Link Active
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-mono text-zinc-500">Authenticated Admin</p>
            <p className="text-sm font-semibold text-white tracking-wide">{adminName}</p>
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
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* LEFT COLUMN: Controls Tabs (4 cols on lg) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Tab Selector */}
          <div className="glass-card rounded-xl p-1 border border-white/5 flex">
            <button
              onClick={() => setActiveTab('task')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${
                activeTab === 'task'
                  ? 'bg-gradient-to-r from-purple-650 to-cyan-550 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Deploy Task
            </button>
            <button
              onClick={() => setActiveTab('member')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${
                activeTab === 'member'
                  ? 'bg-gradient-to-r from-purple-650 to-cyan-550 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Manage Team
            </button>
          </div>

          {/* TAB 1: Deploy Task Form */}
          {activeTab === 'task' ? (
            <div className="glass-card rounded-xl p-6 border border-white/8 relative">
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-purple-500 to-cyan-500" />
              
              <h2 className="text-lg font-semibold text-white tracking-wider mb-1 flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                Generate Task
              </h2>
              <p className="text-xs text-zinc-400 mb-5">
                Draft and code a new assignment for deployment.
              </p>

              <form onSubmit={handleCreateTask} className="space-y-4">
                {/* Task Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Task Title
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="Deploy webhook integration"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Write clear instructions for team tracking..."
                    className="w-full px-3.5 py-2.5 glass-input text-sm resize-none"
                  />
                </div>

                {/* Team Assignee */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Assign Representative
                  </label>
                  <div className="relative">
                    <select
                      name="assigned_to"
                      required
                      defaultValue=""
                      className="w-full px-3.5 py-2.5 glass-input text-sm appearance-none bg-zinc-950 text-white"
                    >
                      <option value="" disabled>Select Team Member...</option>
                      {profiles.map(member => (
                        <option key={member.id} value={member.id}>
                          {member.name} ({member.role})
                        </option>
                      ))}
                      {profiles.length === 0 && (
                        <option value="unassigned">No team members registered</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Deadline */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Deadline Date & Time
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      name="deadline"
                      required
                      className="w-full px-3.5 py-2.5 glass-input text-sm text-white"
                    />
                  </div>
                </div>

                {taskError && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{taskError}</span>
                  </div>
                )}

                {taskSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{taskSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="w-full py-3 mt-2 rounded-lg font-medium text-xs tracking-widest uppercase bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {isSubmittingTask ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Coding Task...
                    </span>
                  ) : (
                    <span>Generate Task Code</span>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* TAB 2: Register Team Member Form */
            <div className="glass-card rounded-xl p-6 border border-white/8 relative">
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-cyan-500 to-emerald-500" />
              
              <h2 className="text-lg font-semibold text-white tracking-wider mb-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                Register Representative
              </h2>
              <p className="text-xs text-zinc-400 mb-5">
                Create user IDs/profiles directly. Verification is auto-approved.
              </p>

              <form onSubmit={handleCreateMember} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Alexander Vance"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="vance@aetheris.com"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                </div>

                {/* Phone Number with Country Code */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Phone (with Country Code)
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    placeholder="+923445552403"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                  <span className="text-[9px] text-zinc-500 block font-mono">
                    Important for WhatsApp Done validation.
                  </span>
                </div>

                {/* Security Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Assign Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="Min 6 characters..."
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                </div>

                {/* Role selection */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Portal Role
                  </label>
                  <select
                    name="role"
                    required
                    defaultValue="Member"
                    className="w-full px-3.5 py-2.5 glass-input text-sm appearance-none bg-zinc-950 text-white"
                  >
                    <option value="Member">Member (Representative)</option>
                    <option value="Admin">Admin (Control Center)</option>
                  </select>
                </div>

                {memberError && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{memberError}</span>
                  </div>
                )}

                {memberSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{memberSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingMember}
                  className="w-full py-3 mt-2 rounded-lg font-medium text-xs tracking-widest uppercase bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {isSubmittingMember ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Provisioning...
                    </span>
                  ) : (
                    <span>Register Representative</span>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Tasks Monitor (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* STATS BANNER */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Total */}
            <div className="glass-card rounded-xl p-4 border border-white/5 flex flex-col">
              <span className="text-[10px] tracking-widest uppercase text-zinc-400 font-mono">Tasks</span>
              <span className="text-2xl font-bold text-white mt-1">{totalTasks}</span>
            </div>

            {/* Pending */}
            <div className="glass-card rounded-xl p-4 border border-purple-500/10 neon-glow-purple flex flex-col">
              <span className="text-[10px] tracking-widest uppercase text-purple-400 font-mono">Pending</span>
              <span className="text-2xl font-bold text-purple-300 mt-1">{pendingTasks}</span>
            </div>

            {/* In Progress */}
            <div className="glass-card rounded-xl p-4 border border-cyan-500/10 neon-glow-cyan flex flex-col">
              <span className="text-[10px] tracking-widest uppercase text-cyan-400 font-mono">Active</span>
              <span className="text-2xl font-bold text-cyan-300 mt-1">{progressTasks}</span>
            </div>

            {/* Done */}
            <div className="glass-card rounded-xl p-4 border border-emerald-500/10 neon-glow-emerald flex flex-col">
              <span className="text-[10px] tracking-widest uppercase text-emerald-400 font-mono">Done</span>
              <span className="text-2xl font-bold text-emerald-350 mt-1">{completedTasks}</span>
            </div>
          </div>

          {/* FILTER & CONTROL PANEL */}
          <div className="glass-card rounded-xl p-4 border border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by Code, Title, Assignee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs glass-input"
              />
            </div>

            {/* Filters & Refresh */}
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
                title="Refresh Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* TASKS LIST */}
          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {filteredTasks.map(task => {
              const statusColors = {
                Pending: {
                  badge: 'bg-purple-950/40 border-purple-500/20 text-purple-400',
                  dot: 'bg-purple-500',
                  cardBorder: 'border-white/5 hover:border-purple-500/20',
                },
                'In Progress': {
                  badge: 'bg-cyan-950/40 border-cyan-500/20 text-cyan-400',
                  dot: 'bg-cyan-500',
                  cardBorder: 'border-white/5 hover:border-cyan-500/20',
                },
                Done: {
                  badge: 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400',
                  dot: 'bg-emerald-500',
                  cardBorder: 'border-white/5 hover:border-emerald-500/20',
                },
              }

              const colors = statusColors[task.status] || statusColors.Pending

              return (
                <div 
                  key={task.id} 
                  className={`glass-card rounded-xl p-5 border ${colors.cardBorder} flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300`}
                >
                  <div className="space-y-1.5 max-w-lg">
                    {/* Header line: code + status */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold tracking-widest text-white font-mono bg-zinc-950 border border-white/10 px-2 py-0.5 rounded">
                        {task.id}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono tracking-widest uppercase flex items-center gap-1.5 ${colors.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        {task.status}
                      </span>
                    </div>

                    {/* Title & Desc */}
                    <h3 className="text-base font-semibold text-white tracking-wide">{task.title}</h3>
                    {task.description && (
                      <p className="text-xs text-zinc-400 font-light leading-relaxed">{task.description}</p>
                    )}

                    {/* Team Details & Deadline */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-[11px] text-zinc-500 font-mono">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-zinc-650" />
                        Assignee: <span className="text-zinc-350">{task.profiles?.name || 'Unassigned'}</span>
                      </span>
                      {task.profiles?.phone && (
                        <span className="flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-zinc-650" />
                          Phone: <span className="text-zinc-350">{task.profiles.phone}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-zinc-650" />
                        Deadline: <span className="text-zinc-350">{formatDate(task.deadline)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 border-t border-white/5 md:border-none pt-3 md:pt-0">
                    {task.status !== 'Done' && (
                      <button
                        onClick={() => handleMarkAsDone(task.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-950/20 text-zinc-500 hover:text-emerald-400 transition-all duration-300 text-xs font-mono"
                        title="Mark Task as Done"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 rounded-lg bg-zinc-950 border border-white/5 hover:border-red-500/30 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 transition-all duration-300"
                      title="Decommission Task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {filteredTasks.length === 0 && (
              <div className="glass-card rounded-xl p-8 border border-white/5 text-center">
                <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-zinc-400">No tasks found matching query.</p>
                <p className="text-xs text-zinc-500 mt-0.5">Use the generator side-panel to deploy a task.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
