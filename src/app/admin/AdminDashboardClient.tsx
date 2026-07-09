'use client'

import React, { useState, useEffect } from 'react'
import { 
  Activity, Plus, Search, Calendar, User, Trash2, LogOut, CheckCircle, 
  Clock, AlertCircle, RefreshCw, Smartphone, Users, ShieldAlert, KeyRound,
  FileText, Upload, Download, Check
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
  designation?: string | null
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
  next_task_id?: string | null
  is_active?: boolean
  in_progress_at?: string | null
  duration_seconds?: number | null
}

interface PerformanceLog {
  id: string
  date: string
  profile_id: string
  assigned_count: number
  completed_count: number
  is_leave: boolean
  profiles?: {
    name: string
    role: string
    designation: string | null
  } | null
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
  const [activeTab, setActiveTab] = useState<'task' | 'member' | 'reports'>('task')
  
  // Task form state
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskSuccess, setTaskSuccess] = useState<string | null>(null)

  // Member form state
  const [isSubmittingMember, setIsSubmittingMember] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null)

  // Calendar upload state
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  // Performance log states
  const [performanceLogs, setPerformanceLogs] = useState<PerformanceLog[]>([])
  const [reportSearch, setReportSearch] = useState('')

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
          in_progress_at,
          duration_seconds,
          next_task_id,
          is_active,
          profiles:assigned_to (
            id,
            name,
            email,
            phone,
            role,
            designation
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

  const fetchPerformanceLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('performance_logs')
        .select(`
          id,
          date,
          profile_id,
          assigned_count,
          completed_count,
          is_leave,
          profiles:profile_id (
            name,
            role,
            designation
          )
        `)
        .order('date', { ascending: false })

      if (error) throw error
      if (data) {
        setPerformanceLogs(data as unknown as PerformanceLog[])
      }
    } catch (err) {
      console.error('Error fetching performance logs:', err)
    }
  }

  // Poll for changes every 5 seconds to provide "real-time" dashboard status updates
  useEffect(() => {
    fetchPerformanceLogs()
    const interval = setInterval(() => {
      fetchLatestTasks()
      fetchPerformanceLogs()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    await fetchLatestTasks()
    await fetchPerformanceLogs()
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

  const handleFileUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formElement = e.currentTarget
    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    const formData = new FormData(formElement)
    try {
      const res = await fetch('/api/admin/calendar/upload', {
        method: 'POST',
        body: formData
      })
      const result = await res.json()
      if (result.success) {
        setUploadSuccess(result.message)
        formElement.reset()
        await fetchLatestTasks()
        await fetchPerformanceLogs()
      } else {
        setUploadError(result.error || 'Failed to import calendar')
      }
    } catch (err: any) {
      setUploadError(err.message || 'An error occurred during file upload')
    } finally {
      setIsUploading(false)
    }
  }

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Date,Assignee,Title,Description\n2026-07-08,Qamar,Video Shoot,Shoot Meta ads creative video\n2026-07-08,Ayesha,Graphic Design,Create Instagram post layout\n2026-07-08,Husnain,Video Editing,Edit Meta ads video raw clip\n2026-07-08,Urraish Raza,Web Development,Deploy landing page updates\n"
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "lumora_calendar_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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

  // Group performance logs by user to display aggregated stats
  const employeeStats: Record<string, {
    name: string,
    designation: string,
    assigned: number,
    completed: number,
    leaves: number
  }> = {}

  profiles.forEach(p => {
    employeeStats[p.id] = {
      name: p.name,
      designation: p.designation || 'Staff Member',
      assigned: 0,
      completed: 0,
      leaves: 0
    }
  })

  performanceLogs.forEach(log => {
    if (employeeStats[log.profile_id]) {
      employeeStats[log.profile_id].assigned += log.assigned_count
      employeeStats[log.profile_id].completed += log.completed_count
      if (log.is_leave) {
        employeeStats[log.profile_id].leaves += 1
      }
    }
  })

  const filteredStats = Object.values(employeeStats).filter(stat => 
    stat.name.toLowerCase().includes(reportSearch.toLowerCase()) ||
    stat.designation.toLowerCase().includes(reportSearch.toLowerCase())
  )

  const leaderboard = [...filteredStats].sort((a, b) => {
    const rateA = a.assigned > 0 ? (a.completed / a.assigned) * 100 : 100
    const rateB = b.assigned > 0 ? (b.completed / b.assigned) * 100 : 100
    const rateDiff = rateB - rateA
    if (rateDiff !== 0) return rateDiff
    const leavesDiff = a.leaves - b.leaves
    if (leavesDiff !== 0) return leavesDiff
    return b.completed - a.completed
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

  // Format work duration helper
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
          <div className="glass-card rounded-xl p-1 border border-white/5 flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('task')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-mono tracking-widest uppercase flex items-center justify-center gap-1 transition-all ${
                activeTab === 'task'
                  ? 'bg-gradient-to-r from-purple-650 to-cyan-550 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Plus className="w-3 h-3" />
              Deploy Task
            </button>
            <button
              onClick={() => setActiveTab('member')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-mono tracking-widest uppercase flex items-center justify-center gap-1 transition-all ${
                activeTab === 'member'
                  ? 'bg-gradient-to-r from-purple-650 to-cyan-550 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Users className="w-3 h-3" />
              Team Panel
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex-1 py-2 rounded-lg text-[9px] font-mono tracking-widest uppercase flex items-center justify-center gap-1 transition-all ${
                activeTab === 'reports'
                  ? 'bg-gradient-to-r from-purple-650 to-cyan-550 text-white shadow-md'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <FileText className="w-3 h-3" />
              Calendar Import
            </button>
          </div>

          {/* TAB 1: Deploy Task Form */}
          {activeTab === 'task' && (
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
                      <option value="" disabled className="bg-zinc-950 text-white">Select Team Member...</option>
                      {profiles.map(member => (
                        <option key={member.id} value={member.id} className="bg-zinc-950 text-white">
                          {member.name} - {member.designation || 'Staff'} ({member.role})
                        </option>
                      ))}
                      {profiles.length === 0 && (
                        <option value="unassigned" className="bg-zinc-950 text-white">No team members registered</option>
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

                {/* Successor Task Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Downstream Successor Task (Pipeline Link)
                  </label>
                  <div className="relative">
                    <select
                      name="next_task_id"
                      defaultValue=""
                      className="w-full px-3.5 py-2.5 glass-input text-sm appearance-none bg-zinc-950 text-white"
                    >
                      <option value="" className="bg-zinc-950 text-white">None (Standalone Task)</option>
                      {tasks.map(t => (
                        <option key={t.id} value={t.id} className="bg-zinc-950 text-white">
                          {t.id} - {t.title} ({t.profiles?.name || 'Unassigned'})
                        </option>
                      ))}
                    </select>
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
          )}

          {/* TAB 2: Register Team Member Form */}
          {activeTab === 'member' && (
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
                    placeholder="Qamar / Ayesha / Husnain"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
                </div>

                {/* Designation */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Job Designation (Role)
                  </label>
                  <select
                    name="designation"
                    required
                    defaultValue=""
                    className="w-full px-3.5 py-2.5 glass-input text-sm appearance-none bg-zinc-950 text-white"
                  >
                    <option value="" disabled className="bg-zinc-950 text-white">Select Job Role...</option>
                    <option value="Meta Ads Expert, Photographer, Videographer" className="bg-zinc-950 text-white">Meta Ads Expert, Photographer, Videographer</option>
                    <option value="Graphic Designer" className="bg-zinc-950 text-white">Graphic Designer</option>
                    <option value="Team Lead and Video Editor" className="bg-zinc-950 text-white">Team Lead and Video Editor</option>
                    <option value="Stories Uploading Holder and Conversions" className="bg-zinc-950 text-white">Stories Uploading Holder and Conversions</option>
                    <option value="Web Developer" className="bg-zinc-950 text-white">Web Developer</option>
                  </select>
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
                    placeholder="member@lumora.com"
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
                    placeholder="+923701645009"
                    className="w-full px-3.5 py-2.5 glass-input text-sm"
                  />
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
                    Portal Privilege
                  </label>
                  <select
                    name="role"
                    required
                    defaultValue="Member"
                    className="w-full px-3.5 py-2.5 glass-input text-sm appearance-none bg-zinc-950 text-white"
                  >
                    <option value="Member" className="bg-zinc-950 text-white">Member (Representative)</option>
                    <option value="Admin" className="bg-zinc-950 text-white">Admin (Control Center)</option>
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

          {/* TAB 3: Import Calendar File */}
          {activeTab === 'reports' && (
            <div className="glass-card rounded-xl p-6 border border-white/8 relative">
              <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-purple-500 to-cyan-500" />
              
              <h2 className="text-lg font-semibold text-white tracking-wider mb-1 flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-400" />
                Import Calendar
              </h2>
              <p className="text-xs text-zinc-400 mb-5">
                Upload monthly calendar (Excel/CSV) to batch deploy tasks.
              </p>

              <form onSubmit={handleFileUpload} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-zinc-400 tracking-widest uppercase font-mono">
                    Excel/CSV Calendar File
                  </label>
                  <input
                    type="file"
                    name="file"
                    required
                    accept=".xlsx,.xls,.csv"
                    className="w-full px-3.5 py-2.5 glass-input text-xs text-white"
                  />
                </div>

                {uploadError && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {uploadSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-full py-3 mt-2 rounded-lg font-medium text-xs tracking-widest uppercase bg-gradient-to-r from-purple-650 to-cyan-550 hover:from-purple-600 hover:to-cyan-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)] flex items-center justify-center gap-2 transition-all duration-300 disabled:opacity-50"
                >
                  {isUploading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading Sheet...
                    </span>
                  ) : (
                    <span>Upload & Parse Calendar</span>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/5 space-y-3">
                <h3 className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Template Download</h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Use our formatted header template to ensure error-free calendar updates.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="w-full py-2.5 rounded-lg border border-white/10 hover:border-zinc-500 text-zinc-350 hover:text-white transition-all text-xs font-mono flex items-center justify-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV Template
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Tasks Monitor OR Monthly Analytics Report (8 cols on lg) */}
        <div className="lg:col-span-8 space-y-6">
          
          {activeTab !== 'reports' ? (
            <>
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
                          {task.next_task_id && (
                            <span className="text-purple-400 font-semibold flex items-center gap-1">
                              🔗 Successor: {task.next_task_id}
                            </span>
                          )}
                          {!task.is_active && (
                            <span className="text-amber-450 font-semibold flex items-center gap-1">
                              🔒 Locked (Waiting for Predecessor)
                            </span>
                          )}
                          {task.duration_seconds !== null && task.duration_seconds !== undefined && (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                              ⏱️ Duration: {formatDuration(task.duration_seconds)}
                            </span>
                          )}
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
            </>
          ) : (
            /* MONTHLY REPORTS VIEW */
            <div className="glass-card rounded-xl p-6 border border-white/5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white tracking-wider flex items-center gap-2">
                    <FileText className="w-5 h-5 text-cyan-400" />
                    Monthly Performance Analytics
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Aggregated tracking of tasks, unexcused leaves, and work completion logs.
                  </p>
                </div>
                
                {/* Search reports */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search by Employee..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs glass-input"
                  />
                </div>
              </div>

              {/* LEADERBOARD WIDGET */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {leaderboard.slice(0, 3).map((player, index) => {
                  const rate = player.assigned > 0 ? Math.round((player.completed / player.assigned) * 100) : 100
                  const trophyColors = [
                    'from-yellow-950/40 via-yellow-900/10 to-transparent border-yellow-500/30 neon-glow-yellow', // Gold
                    'from-zinc-800/40 via-zinc-900/10 to-transparent border-zinc-400/30 neon-glow-zinc',      // Silver
                    'from-amber-950/40 via-amber-900/10 to-transparent border-amber-600/30 neon-glow-amber'   // Bronze
                  ]
                  const medalEmoji = index === 0 ? '🏆 GOLD' : index === 1 ? '🥈 SILVER' : '🥉 BRONZE'

                  return (
                    <div 
                      key={player.name}
                      className={`relative overflow-hidden glass-card rounded-xl p-5 border bg-gradient-to-br ${trophyColors[index] || 'from-zinc-900 to-zinc-950 border-white/5'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] tracking-widest uppercase font-mono text-zinc-400">{medalEmoji}</span>
                          <h3 className="text-base font-bold text-white tracking-wide mt-1">{player.name}</h3>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{player.designation}</p>
                        </div>
                        <span className="text-xs font-bold font-mono tracking-wider text-purple-400 bg-purple-950/40 border border-purple-500/20 px-2 py-0.5 rounded">
                          RANK #{index + 1}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/5 text-center font-mono">
                        <div>
                          <div className="text-[8px] text-zinc-500 uppercase">Assigned</div>
                          <div className="text-xs font-semibold text-white">{player.assigned}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-zinc-500 uppercase">Completed</div>
                          <div className="text-xs font-semibold text-emerald-450">{player.completed}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-zinc-500 uppercase">Rate</div>
                          <div className="text-xs font-semibold text-cyan-400">{rate}%</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* REPORT TABLE */}
              <div className="overflow-x-auto border border-white/5 rounded-xl bg-zinc-950/30">
                <table className="w-full border-collapse text-left text-sm text-zinc-350">
                  <thead className="border-b border-white/5 bg-white/2 text-[10px] tracking-widest uppercase font-mono font-medium text-zinc-400">
                    <tr>
                      <th className="px-5 py-4">Employee Name</th>
                      <th className="px-5 py-4">Specialization</th>
                      <th className="px-5 py-4 text-center">Assigned Tasks</th>
                      <th className="px-5 py-4 text-center">Done Tasks</th>
                      <th className="px-5 py-4 text-center">Unexcused Leaves</th>
                      <th className="px-5 py-4 text-right">Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-light">
                    {filteredStats.map(stat => {
                      const totalAssigned = stat.assigned
                      const totalDone = stat.completed
                      const rate = totalAssigned > 0 ? Math.round((totalDone / totalAssigned) * 100) : 100
                      
                      let rateColor = 'text-emerald-450'
                      if (rate < 50) rateColor = 'text-red-400'
                      else if (rate < 80) rateColor = 'text-amber-400'

                      return (
                        <tr key={stat.name} className="hover:bg-white/2 transition-colors">
                          <td className="px-5 py-4 font-medium text-white">{stat.name}</td>
                          <td className="px-5 py-4 text-xs font-mono text-zinc-450">{stat.designation}</td>
                          <td className="px-5 py-4 text-center font-mono">{totalAssigned}</td>
                          <td className="px-5 py-4 text-center font-mono text-emerald-400">{totalDone}</td>
                          <td className="px-5 py-4 text-center font-mono text-red-400">
                            {stat.leaves > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-red-950/30 border border-red-500/20">
                                {stat.leaves} Leaves
                              </span>
                            ) : (
                              <span className="text-zinc-550">-</span>
                            )}
                          </td>
                          <td className={`px-5 py-4 text-right font-mono font-semibold ${rateColor}`}>{rate}%</td>
                        </tr>
                      )
                    })}

                    {filteredStats.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-zinc-550">
                          No representative profiles found in database.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
