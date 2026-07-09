import { jsPDF } from 'jspdf'

export interface EmployeeReportData {
  name: string
  designation: string
  period: string
  totalAssigned: number
  totalCompleted: number
  leavesCount: number
  completionRate: number
  tasks: {
    id: string
    title: string
    status: string
    deadline: string
    completed_at: string | null
    duration_seconds: number | null
  }[]
  leaves: {
    date: string
  }[]
}

export interface AdminReportData {
  period: string
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  leavesCount: number
  employees: {
    name: string
    designation: string
    assigned: number
    completed: number
    leaves: number
    rate: number
  }[]
}

/**
 * Generates a clean, professional PDF statement document for an individual employee
 */
export function generateEmployeeReportPDF(data: EmployeeReportData): jsPDF {
  const doc = new jsPDF()

  // 1. Draw Tech-Luxury Dark Header
  doc.setFillColor(24, 24, 27) // zinc-900 (#18181b)
  doc.rect(0, 0, 210, 38, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('LUMORA PORTAL', 15, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(161, 161, 170) // zinc-400
  doc.text(`INDIVIDUAL PERFORMANCE STATEMENT  |  ${data.period.toUpperCase()}`, 15, 26)

  // 2. Render Employee Profile Info
  doc.setTextColor(24, 24, 27)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`Employee: ${data.name}`, 15, 52)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(113, 113, 122) // zinc-500
  doc.text(`Designation: ${data.designation}`, 15, 59)

  // 3. Render Aggregate Summary Dashboard Block
  doc.setFillColor(244, 244, 245) // zinc-100
  doc.rect(15, 68, 180, 24, 'F')

  doc.setTextColor(113, 113, 122)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('TOTAL ASSIGNED', 25, 77)
  doc.text('COMPLETED', 70, 77)
  doc.text('UNEXCUSED LEAVES', 115, 77)
  doc.text('SUCCESS RATE', 160, 77)

  doc.setFontSize(11)
  doc.setTextColor(24, 24, 27)
  doc.text(`${data.totalAssigned} Tasks`, 25, 85)
  doc.setTextColor(16, 185, 129) // emerald-500
  doc.text(`${data.totalCompleted} Done`, 70, 85)
  doc.setTextColor(239, 68, 68) // red-500
  doc.text(`${data.leavesCount} Leaves`, 115, 85)

  let rateColor = [24, 24, 27]
  if (data.completionRate < 50) rateColor = [239, 68, 68]
  else if (data.completionRate < 80) rateColor = [245, 158, 11] // amber-500
  else rateColor = [16, 185, 129]

  doc.setTextColor(rateColor[0], rateColor[1], rateColor[2])
  doc.text(`${data.completionRate}%`, 160, 85)

  // 4. Render Completed Tasks List Table
  doc.setTextColor(24, 24, 27)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TASKS TIMELINE DETAILS', 15, 106)
  doc.line(15, 108, 195, 108)

  doc.setFontSize(8)
  doc.text('CODE', 15, 114)
  doc.text('TASK TITLE', 35, 114)
  doc.text('STATUS', 115, 114)
  doc.text('DURATION', 140, 114)
  doc.text('DEADLINE', 170, 114)
  doc.line(15, 116, 195, 116)

  doc.setFont('helvetica', 'normal')
  let y = 122

  data.tasks.forEach(t => {
    if (y > 270) {
      doc.addPage()
      // Redraw simple page headers
      doc.setFillColor(24, 24, 27)
      doc.rect(0, 0, 210, 12, 'F')
      y = 22
    }

    doc.text(t.id, 15, y)

    // Truncate title if too long to fit
    const titleTrunc = t.title.length > 42 ? t.title.substring(0, 39) + '...' : t.title
    doc.text(titleTrunc, 35, y)

    doc.text(t.status, 115, y)

    let durStr = '-'
    if (t.duration_seconds !== null && t.duration_seconds !== undefined) {
      if (t.duration_seconds < 60) {
        durStr = `${t.duration_seconds}s`
      } else {
        const mins = Math.floor(t.duration_seconds / 60)
        if (mins < 60) {
          durStr = `${mins}m`
        } else {
          const hrs = Math.floor(mins / 60)
          const remainingMins = mins % 60
          durStr = `${hrs}h ${remainingMins}m`
        }
      }
    }
    doc.text(durStr, 140, y)

    const dlDate = new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    doc.text(dlDate, 170, y)

    y += 7
  })

  // 5. Footer Footnote
  if (y > 265) {
    doc.addPage()
    doc.setFillColor(24, 24, 27)
    doc.rect(0, 0, 210, 12, 'F')
    y = 22
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(161, 161, 170)
  doc.text('This is a secure, computer-generated document compiled dynamically by Lumora portal.', 15, y + 10)

  return doc
}

/**
 * Generates a clean, professional PDF statement document for the Administrator
 */
export function generateAdminReportPDF(data: AdminReportData): jsPDF {
  const doc = new jsPDF()

  // 1. Header
  doc.setFillColor(24, 24, 27)
  doc.rect(0, 0, 210, 38, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('LUMORA COMMAND CENTER', 15, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(161, 161, 170)
  doc.text(`MASTER AGENCY SUMMARY REPORT  |  ${data.period.toUpperCase()}`, 15, 26)

  // 2. Summary Dashboard Box
  doc.setFillColor(244, 244, 245)
  doc.rect(15, 50, 180, 24, 'F')

  doc.setTextColor(113, 113, 122)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('TOTAL DEPLOYED', 25, 59)
  doc.text('COMPLETED', 70, 59)
  doc.text('PENDING IN QUEUE', 115, 59)
  doc.text('TOTAL LEAVES LOGGED', 155, 59)

  doc.setFontSize(11)
  doc.setTextColor(24, 24, 27)
  doc.text(`${data.totalTasks} Tasks`, 25, 67)
  doc.setTextColor(16, 185, 129)
  doc.text(`${data.completedTasks} Done`, 70, 67)
  doc.setTextColor(245, 158, 11)
  doc.text(`${data.pendingTasks} Active`, 115, 67)
  doc.setTextColor(239, 68, 68)
  doc.text(`${data.leavesCount} Leaves`, 155, 67)

  // 3. Team Leaderboard Overview
  doc.setTextColor(24, 24, 27)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TEAM PERFORMANCE METRICS', 15, 88)
  doc.line(15, 90, 195, 90)

  doc.setFontSize(8)
  doc.text('EMPLOYEE NAME', 15, 96)
  doc.text('DESIGNATION SPECIALIZATION', 55, 96)
  doc.text('ASSIGNED', 115, 96)
  doc.text('COMPLETED', 135, 96)
  doc.text('LEAVES', 155, 96)
  doc.text('COMPLETION RATE', 170, 96)
  doc.line(15, 98, 195, 98)

  doc.setFont('helvetica', 'normal')
  let y = 104

  data.employees.forEach(emp => {
    if (y > 270) {
      doc.addPage()
      doc.setFillColor(24, 24, 27)
      doc.rect(0, 0, 210, 12, 'F')
      y = 22
    }

    doc.text(emp.name, 15, y)

    const desTrunc = emp.designation.length > 32 ? emp.designation.substring(0, 29) + '...' : emp.designation
    doc.text(desTrunc, 55, y)

    doc.text(`${emp.assigned}`, 115, y)
    doc.text(`${emp.completed}`, 135, y)
    doc.text(`${emp.leaves}`, 155, y)
    doc.text(`${emp.rate}%`, 170, y)

    y += 7
  })

  // 4. Footer
  if (y > 265) {
    doc.addPage()
    doc.setFillColor(24, 24, 27)
    doc.rect(0, 0, 210, 12, 'F')
    y = 22
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(161, 161, 170)
  doc.text('This is a secure, computer-generated command center report compiled dynamically by Lumora portal.', 15, y + 10)

  return doc
}
