import { useState, useEffect } from 'react';
import { calculateFinancials, getMonthRange } from '@/lib/accounting-logic';
import { exportToExcel } from '@/lib/excel-export';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, CheckSquare, UserCheck, AlertTriangle, ArrowUpRight, ArrowDownRight, Briefcase, Download, Calendar, Clock, Target, LayoutGrid, BarChart3, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDate, daysUntil, safeTime } from '@/lib/supabase-service';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { fetchEntries } from '@/lib/dsr-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend, LineChart, Line } from 'recharts';
import DSRDashboardWidget from '@/components/dashboard/DSRDashboardWidget';
import SocialLeadsDashboardWidget from '@/components/dashboard/SocialLeadsDashboardWidget';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#7C3AED', '#0891B2'];

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null;

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-xs font-black select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState('dashboard');
  const [dataSource, setDataSource] = useState<'combined' | 'dsr' | 'clients'>('clients');
  const [reportMonth, setReportMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [viewType, setViewType] = useState<'monthly' | 'weekly' | 'annual' | 'custom'>('monthly');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  // ── Single source of truth for ALL DSR data ──────────────────────────────
  // Uses server-side date filtering (proven reliable) instead of main loader.
  // `entries` = current period full rows; `annualEntries` = YTD full rows.
  const [dsrData, setDsrData] = useState<{
    revenue: number; profit: number; lastRevenue: number;
    annualRevenue: number; annualProfit: number;
    entries: any[]; annualEntries: any[];
  }>({ revenue: 0, profit: 0, lastRevenue: 0, annualRevenue: 0, annualProfit: 0, entries: [], annualEntries: [] });

  useEffect(() => {
    (async () => {
      const [rYear, rMonth] = reportMonth.split('-').map(Number);

      // ── Determine period dates based on viewType ──
      let periodFrom: string, periodTo: string;
      if (viewType === 'custom' && customStartDate && customEndDate) {
        periodFrom = customStartDate;
        periodTo   = customEndDate;
      } else if (viewType === 'weekly') {
        const endOfMonth = new Date(rYear, rMonth, 0);
        const weekStart  = new Date(endOfMonth);
        weekStart.setDate(endOfMonth.getDate() - 6);
        periodFrom = weekStart.toISOString().split('T')[0];
        periodTo   = endOfMonth.toISOString().split('T')[0];
      } else if (viewType === 'annual') {
        periodFrom = `${rYear}-01-01`;
        periodTo   = `${rYear}-12-31`;
      } else { // monthly (default)
        const lastDay = new Date(rYear, rMonth, 0).getDate();
        periodFrom = `${rYear}-${String(rMonth).padStart(2, '0')}-01`;
        periodTo   = `${rYear}-${String(rMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }

      // Previous month for comparison
      const prevDate    = new Date(rYear, rMonth - 2, 1);
      const lastFromStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-01`;
      const lastToStr   = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split('T')[0];

      const [curEntries, lastEntries, annualEntries] = await Promise.all([
        fetchEntries({ fromDate: periodFrom, toDate: periodTo, isAdmin: true }),
        fetchEntries({ fromDate: lastFromStr, toDate: lastToStr, isAdmin: true }),
        fetchEntries({ fromDate: `${rYear}-01-01`, toDate: periodTo, isAdmin: true }),
      ]);

      const curStats    = calculateFinancials(curEntries);
      const annualStats = calculateFinancials(annualEntries);
      const lastStats   = calculateFinancials(lastEntries);

      setDsrData({
        revenue:       curStats.revenue,
        profit:        curStats.profit,
        lastRevenue:   lastStats.revenue,
        annualRevenue: annualStats.revenue,
        annualProfit:  annualStats.profit,
        entries:       curEntries,
        annualEntries,
      });
    })();
  }, [reportMonth, viewType, customStartDate, customEndDate]);

  useEffect(() => {
    const load = async () => {
      const [rYear, rMonth] = reportMonth.split('-').map(Number);
      const now = new Date();
      const prevDate = new Date(rYear, rMonth - 2, 1);
      const lastMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      
      const startOfYear = `${rYear}-01-01`;
      const fetchStart = `${lastMonth}-01`; 
      let comparisonStart = startOfYear < fetchStart ? startOfYear : fetchStart;
      if (viewType === 'custom' && customStartDate) {
        if (customStartDate < comparisonStart) comparisonStart = customStartDate;
      }
      
      let fetchEnd = new Date(rYear, rMonth, 0).toISOString().split('T')[0];
      if (viewType === 'custom' && customEndDate) {
        if (customEndDate > fetchEnd) fetchEnd = customEndDate;
      }

      const fetchC = (q: any) => q.or(`created_at.gte.${comparisonStart},updated_at.gte.${comparisonStart}`);
      const fetchT = (q: any) => q.gte('created_at', comparisonStart);
      const fetchA = (q: any) => q.gte('date', comparisonStart);
      const fetchQ = (q: any) => q.gte('created_at', comparisonStart);
      const fetchD = (q: any) => {
        if (viewType === 'annual') {
          return q.gte('entry_date', `${rYear}-01-01`).lte('entry_date', `${rYear}-12-31`);
        } else if (viewType === 'custom' && customStartDate && customEndDate) {
          return q.gte('entry_date', customStartDate).lte('entry_date', customEndDate);
        } else {
          const lastDay = new Date(rYear, rMonth, 0).getDate();
          return q.gte('entry_date', `${rYear}-${String(rMonth).padStart(2, '0')}-01`)
                  .lte('entry_date', `${rYear}-${String(rMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
        }
      };
      const fetchL = (q: any) => q.gte('created_at', comparisonStart);

      const [
        clients, tasks, profiles, attendance, quotations,
        auditRes, leave, dsr, leads, projects, monitoringTasks
      ] = await Promise.all([
        fetchPaginated('clients', fetchC).catch(() => []),
        fetchPaginated('tasks', fetchT).catch(() => []),
        fetchPaginated('profiles').catch(() => []),
        fetchPaginated('attendance', fetchA).catch(() => []),
        fetchPaginated('quotations', fetchQ).catch(() => []),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
        fetchPaginated('leave_requests').catch(() => []),
        fetchPaginated('dsr_entries', fetchD).catch(() => []),
        fetchPaginated('social_leads', fetchL).catch(() => []),
        fetchPaginated('monitoring_projects' as any).catch(() => []),
        fetchPaginated('monitoring_tasks' as any).catch(() => []),
      ]);

      const clientIds = new Set((clients || []).map(c => c.id));
      const tasksFiltered = (tasks || []).filter((t: any) => t.client_id && clientIds.has(t.client_id));
      const employees = profiles || [];
      const quotationsFiltered = (quotations || []).filter((q: any) => q.client_id && clientIds.has(q.client_id));
      const auditLog = auditRes?.data || [];
      const dsrEntries = dsr || [];
      const monProjects = projects || [];
      const monTasks = monitoringTasks || [];

      // Ensure data exists before processing
      const curEntries = Array.isArray(dsr) ? dsr : [];
      const curStats = calculateFinancials(curEntries);
      
      // DSR stats calculation
      setDsrData({
        revenue:       curStats.revenue || 0,
        profit:        curStats.profit || 0,
        lastRevenue:   0, 
        salesCount:    curStats.count || 0,
        annualRevenue: curStats.revenue || 0,
        annualProfit:  curStats.profit || 0,
        annualSales:   curStats.count || 0
      });

      // Use filtered data as the main collections
      const finalTasks = tasksFiltered;
      const finalQuotations = quotationsFiltered;

      const monitoringProjects = monProjects.map((p: any) => {
        const pTasks = monTasks.filter((t: any) => t.project_id === p.id);
        const totalProgress = pTasks.length > 0
          ? Math.round(pTasks.reduce((acc: number, t: any) => acc + (t.progress_percentage || 0), 0) / pTasks.length)
          : 0;
        return { ...p, totalProgress };
      }).sort((a: any, b: any) => b.totalProgress - a.totalProgress);

      const today = now.toISOString().split('T')[0];

      const matchesFilter = (dateStr: string | null) => {
        if (!dateStr) return false;
        if (viewType === 'custom') {
          const d = dateStr.slice(0, 10);
          if (customStartDate && d < customStartDate) return false;
          if (customEndDate && d > customEndDate) return false;
          return true;
        }
        if (viewType === 'monthly') return dateStr.startsWith(reportMonth);
        if (viewType === 'annual') return dateStr.startsWith(String(rYear));
        if (viewType === 'weekly') {
          const d = new Date(dateStr);
          const end = new Date(rYear, rMonth, 0); 
          const diff = (end.getTime() - d.getTime()) / 86400000;
          return diff >= 0 && diff < 7;
        }
        return true;
      };

      const dsrMatches = (e: any) => e.entry_date ? matchesFilter(e.entry_date) : false;
      const clientMatches = (c: any) => c.created_at ? matchesFilter(c.created_at) : false;

      const eligibleClients = (clients || []).filter(c => !c.dsr_entry_id);
      const clientsThisMonthCount = eligibleClients.filter(clientMatches).length;
      const clientsLastMonthCount = eligibleClients.filter((c: any) => c.created_at && c.created_at.startsWith(lastMonth)).length;

      // DSR financials are NOT computed here — they come from dsrData (reliable independent fetch)
      // Loader only computes CLIENT financials
      const clientStats = calculateFinancials(eligibleClients.filter(clientMatches));
      const clientLastStats = calculateFinancials(eligibleClients.filter((c: any) => c.created_at?.startsWith(lastMonth)));
      const clientAnnual = eligibleClients.filter(c => c.created_at?.startsWith(String(rYear)));

      const revenueThisMonth = clientStats.revenue;
      const revenueLastMonth = clientLastStats.revenue;
      const profitThisMonth  = clientStats.profit;
      const totalRevenue     = calculateFinancials(clientAnnual).revenue;
      const totalProfit      = calculateFinancials(clientAnnual).profit;

      const activeTasks = tasks.filter((t: any) => t.status === 'New' || t.status === 'Processing').length;
      const overdueTasks = tasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.due_date && new Date(t.due_date) < now).length;
      const completedTasks = tasks.filter((t: any) => t.status === 'Completed' && matchesFilter(t.completed_date)).length;

      const activeEmployeeIds = new Set(employees.filter(e => e.status === 'active').map(e => e.user_id));
      const onlineEmployeesList = attendance
        .filter((a: any) => a.date === today && !a.logout_time && activeEmployeeIds.has(a.employee_id))
        .map((a: any) => {
          const emp = employees.find((e: any) => e.user_id === a.employee_id);
          return { name: emp?.name || 'Unknown', photo: emp?.photo_url, id: emp?.user_id };
        });
      const employeesOnline = onlineEmployeesList.length;
      const totalActiveEmp = employees.filter((e: any) => e.status === 'active').length;
      const pendingLeave = leave.filter((l: any) => l.status === 'Pending').length;

      // Service counts — CLIENT-ONLY (DSR services added at render time from dsrData)
      const serviceCounts: Record<string, number> = {};
      const serviceRevenue: Record<string, number> = {};
      clients.filter(c => !c.dsr_entry_id && clientMatches(c)).forEach((c: any) => {
        if (c.service) {
          serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
          serviceRevenue[c.service] = (serviceRevenue[c.service] || 0) + (c.revenue || 0);
        }
      });
      const serviceData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value, revenue: serviceRevenue[name] || 0 }));

      // Chart data — CLIENT-ONLY (DSR merged at render time from dsrData)
      const getRevForDate = (datePrefix: string, exactMatch = false) => {
        let rev = 0, prof = 0, clt = 0;
        const m = clients.filter((c: any) => {
          if (c.dsr_entry_id) return false;
          return exactMatch ? c.created_at?.startsWith(datePrefix) : c.created_at?.startsWith(datePrefix);
        });
        const stats = calculateFinancials(m);
        rev += stats.revenue; prof += stats.profit; clt += m.length;
        return { rev, prof, clt };
      };

      const revenueData: any[] = [];
      if (viewType === 'weekly') {
        const end = new Date(rYear, rMonth, 0); // End of month
        for (let i = 6; i >= 0; i--) {
          const d = new Date(end); d.setDate(end.getDate() - i);
          const key = d.toISOString().split('T')[0];
          const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
          const { rev, prof, clt } = getRevForDate(key, true);
          revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
        }
      } else if (viewType === 'annual') {
        for (let i = 2; i >= 0; i--) {
          const year = rYear - i;
          const label = String(year);
          const { rev, prof, clt } = getRevForDate(label, false);
          revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
        }
      } else if (viewType === 'custom') {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
          if (diffDays <= 31) {
            for (let i = 0; i <= diffDays; i++) {
              const d = new Date(start); d.setDate(start.getDate() + i);
              const key = d.toISOString().split('T')[0];
              const label = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
              const { rev, prof, clt } = getRevForDate(key, true);
              revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
            }
          } else {
            // Group by month if range is large
            let current = new Date(start.getFullYear(), start.getMonth(), 1);
            while (current <= end) {
              const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
              const label = current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              const { rev, prof, clt } = getRevForDate(key, false);
              revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
              current.setMonth(current.getMonth() + 1);
            }
          }
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = new Date(rYear, rMonth - 1 - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const label = d.toLocaleDateString('en-US', { month: 'short' });
          const { rev, prof, clt } = getRevForDate(key, false);
          revenueData.push({ month: label, revenue: rev, profit: prof, clients: clt });
        }
      }

      const statusCounts: Record<string, number> = { New: 0, Processing: 0, Success: 0, Failed: 0 };
      clients.forEach((c: any) => { if (statusCounts[c.status] !== undefined) statusCounts[c.status]++; });

      const upcomingDates: any[] = [];
      clients.forEach((c: any) => {
        Object.entries((c.important_dates as Record<string, string>) || {}).forEach(([type, val]) => {
          if (!val || type === 'passportNo') return;
          const days = daysUntil(val as string);
          if (days >= 0 && days <= 30) upcomingDates.push({ clientName: c.name, clientId: c.id, type, date: val, days, mobile: c.mobile });
        });
      });
      upcomingDates.sort((a, b) => a.days - b.days);

      const todayAttendance = attendance
        .filter((a: any) => a.date === today && activeEmployeeIds.has(a.employee_id))
        .map((a: any) => {
          const emp = employees.find((e: any) => e.user_id === a.employee_id);
          return { ...a, name: emp?.name || 'Unknown', photo: emp?.photo_url, last_seen_at: emp?.last_seen_at };
        });

      const topEmployees = employees.filter((e: any) => e.status === 'active').map((e: any) => {
        const empAttendance = attendance.filter((a: any) => a.employee_id === e.user_id && matchesFilter(a.date));
        let netHours = empAttendance.reduce((s: number, a: any) => s + (a.hours_worked || 0), 0);
        let grossHours = empAttendance.reduce((s: number, a: any) => {
          if (!a.login_time) return s;
          const loginDate = new Date(a.login_time);
          const logoutDate = a.logout_time ? new Date(a.logout_time) : (a.date < today ? new Date(new Date(a.date).setHours(19, 0, 0, 0)) : new Date());
          return s + Math.max(0, (logoutDate.getTime() - loginDate.getTime()) / 3600000);
        }, 0);

        let totalBreakMinutes = empAttendance.reduce((s: number, a: any) => s + (a.total_break_minutes || 0), 0);

        // Include live shift duration for currently logged-in employees
        const active = empAttendance.find((a: any) => a.login_time && !a.logout_time && a.date === today);
        if (active) {
          const loginTime = new Date(active.login_time).getTime();
          const nowMs = new Date().getTime();
          const breakMs = (Number(active.total_break_minutes) || 0) * 60000;
          const offlineMs = (Number(active.offline_minutes) || 0) * 60000;

          const liveGross = (nowMs - loginTime) / 3600000;
          const liveNet = (nowMs - loginTime - breakMs - offlineMs) / 3600000;

          grossHours += Math.max(0, liveGross);
          netHours += Math.max(0, liveNet);
        }

        // Employee stats — CLIENT-ONLY (DSR stats added at render time from dsrData)
        let empRev = 0, empProf = 0, empClientsCount = 0;

        const cc = clients.filter((c_cl: any) => !c_cl.dsr_entry_id && c_cl.created_by === e.user_id && clientMatches(c_cl));
        empClientsCount = cc.length;
        empRev = cc.reduce((s: number, c_cl: any) => s + (c_cl.revenue || 0), 0);
        empProf = cc.reduce((s: number, c_cl: any) => s + (c_cl.profit || 0), 0);

        const successRate = empClientsCount > 0 ? 100 : 0;
        const isClockedIn = !!empAttendance.find(a => a.login_time && !a.logout_time && a.date === today);
        const isOnline = e.last_seen_at && (new Date().getTime() - new Date(e.last_seen_at).getTime() < 60000);

        return {
          name: e.name, id: e.user_id, photo: e.photo_url,
          clients: empClientsCount,
          revenue: empRev,
          profit: empProf,
          tasks: tasks.filter((t: any) => t.assigned_to === e.user_id && t.status === 'Completed').length,
          successRate,
          presentDays: empAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length,
          totalHours: Math.round(grossHours * 10) / 10,
          netHours: Math.round(netHours * 10) / 10,
          totalBreakMinutes,
          avgHours: empAttendance.length > 0 ? Math.round((grossHours / empAttendance.length) * 10) / 10 : 0,
          isClockedIn,
          isOnline
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const topSocialLeadsEmployees = employees.map((e: any) => {
        const empLeads = dsrEntries.filter((l: any) => l.employee_id === e.user_id && dsrMatches(l)); // Note: social leads matches don't have entry_date, they have created_at. So we'll use clientMatches logic but for social_leads.
        // Actually, let's use the fetched social_leads.
        const allEmpLeads = (leads || []).filter((l: any) => l.assigned_to === e.user_id && clientMatches(l));
        const conv = allEmpLeads.filter((l: any) => l.status === 'CONVERTED').length;
        return {
          name: e.name, photo: e.photo_url, id: e.user_id,
          assigned: allEmpLeads.length,
          converted: conv,
          rate: allEmpLeads.length > 0 ? Math.round((conv / allEmpLeads.length) * 100) : 0
        };
      }).filter(e => e.assigned > 0).sort((a, b) => b.converted - a.converted);

      const leadCounts: Record<string, number> = {};
      const leadRevenue: Record<string, number> = {};
      if (dataSource === 'combined' || dataSource === 'clients') {
        clients.filter(clientMatches).forEach((c: any) => {
          if (c.lead_source) {
            leadCounts[c.lead_source] = (leadCounts[c.lead_source] || 0) + 1;
            leadRevenue[c.lead_source] = (leadRevenue[c.lead_source] || 0) + (c.revenue || 0);
          }
        });
      }
      const leadData = Object.entries(leadCounts).map(([name, value]) => ({ name, value, revenue: leadRevenue[name] || 0 }));

      const nationalityCounts: Record<string, number> = {};
      clients.forEach((c: any) => {
        const nat = c.nationality || (c.service_details as any)?.nationality || 'Unknown';
        if (nat) nationalityCounts[nat] = (nationalityCounts[nat] || 0) + 1;
      });
      const nationalityData = Object.entries(nationalityCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);

      // ----- Total Clients based on selected filter -----
      let totalClientsFiltered = 0;
      const countClientsInRange = (start: string, end: string) =>
        clients.filter((c: any) => {
          const created = c.created_at;
          const endEod = end.includes('T') ? end : end + 'T23:59:59';
          return created && created >= start && created <= endEod;
        }).length;

      if (viewType === 'weekly') {
        const end = new Date(rYear, rMonth, 0);
        const weekStart = new Date(end);
        weekStart.setDate(end.getDate() - 6);
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        totalClientsFiltered = countClientsInRange(startStr, endStr);
      } else if (viewType === 'annual') {
        const startStr = `${rYear}-01-01`;
        const endStr = `${rYear}-12-31`;
        totalClientsFiltered = countClientsInRange(startStr, endStr);
      } else if (viewType === 'custom' && customStartDate && customEndDate) {
        totalClientsFiltered = countClientsInRange(customStartDate, customEndDate);
      } else {
        // monthly (default)
        const startStr = `${rYear}-${String(rMonth).padStart(2, '0')}-01`;
        const endStr = new Date(rYear, rMonth, 0).toISOString().split('T')[0];
        totalClientsFiltered = countClientsInRange(startStr, endStr);
      }

      setData({
        totalClients: totalClientsFiltered,
        clientsThisMonth: clientsThisMonthCount,
        clientsLastMonth: clientsLastMonthCount,
        revenueThisMonth,
        revenueLastMonth,
        profitThisMonth,
        totalRevenue,
        totalProfit,
        activeTasks,
        overdueTasks,
        completedTasks,
        pendingLeave,
        employeesOnline,
        totalActiveEmp,
        serviceData,
        revenueData,
        statusCounts,
        upcomingDates,
        todayAttendance,
        recentAudit: auditLog,
        topEmployees,
        topSocialLeadsEmployees,
        leadData,
        nationalityData,
        onlineEmployeesList,
        allClients: (clients || []).filter(clientMatches),
        allEmployees: employees,
        allTasks: tasksFiltered,
        allQuotations: quotationsFiltered,
        monitoringProjects: monitoringProjects,
      });
    };
    load();
  }, [reportMonth, viewType, customStartDate, customEndDate]);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;


  // ── Summary card values (period-specific) ───────────────────────────────
  const displayRevenue = dataSource === 'dsr' ? dsrData.revenue
    : dataSource === 'clients' ? data.revenueThisMonth
    : dsrData.revenue + data.revenueThisMonth;
  const displayProfit = dataSource === 'dsr' ? dsrData.profit
    : dataSource === 'clients' ? data.profitThisMonth
    : dsrData.profit + data.profitThisMonth;
  const displayLastRevenue = dataSource === 'dsr' ? dsrData.lastRevenue
    : dataSource === 'clients' ? data.revenueLastMonth
    : dsrData.lastRevenue + data.revenueLastMonth;
  const revenueChange = displayLastRevenue > 0 ? Math.round(((displayRevenue - displayLastRevenue) / displayLastRevenue) * 100) : 0;
  const clientChange  = data.clientsLastMonth > 0 ? Math.round(((data.clientsThisMonth - data.clientsLastMonth) / data.clientsLastMonth) * 100) : 0;

  // ── Annual totals (Reports & Revenue tabs) ───────────────────────────────
  // reports tab = always Client Only; revenue tab = always Combined
  const reportsAnnualRevenue = data.totalRevenue;
  const reportsAnnualProfit  = data.totalProfit;
  const revenueAnnualRevenue = dsrData.annualRevenue + data.totalRevenue;
  const revenueAnnualProfit  = dsrData.annualProfit  + data.totalProfit;

  const displayAnnualRevenue = tab === 'reports' ? reportsAnnualRevenue
    : tab === 'revenue' ? revenueAnnualRevenue
    : dataSource === 'dsr' ? dsrData.annualRevenue
    : dataSource === 'clients' ? data.totalRevenue
    : dsrData.annualRevenue + data.totalRevenue;

  const displayAnnualProfit = tab === 'reports' ? reportsAnnualProfit
    : tab === 'revenue' ? revenueAnnualProfit
    : dataSource === 'dsr' ? dsrData.annualProfit
    : dataSource === 'clients' ? data.totalProfit
    : dsrData.annualProfit + data.totalProfit;

  const profitMargin = displayAnnualRevenue > 0 ? Math.round((displayAnnualProfit / displayAnnualRevenue) * 100) : 0;

  // ── Employees tab: enrich with DSR revenue from reliable dsrData ─────────
  const dsrEmpMap = dsrData.entries.reduce((map: Record<string, { revenue: number; profit: number; clients: number }>, e: any) => {
    const id = e.employee_id;
    if (id) {
      if (!map[id]) map[id] = { revenue: 0, profit: 0, clients: 0 };
      map[id].revenue  += Number(e.sale_amount   || 0);
      map[id].profit   += Number(e.profit_amount || 0);
      map[id].clients  += 1;
    }
    return map;
  }, {});

  const enrichedEmployees: any[] = (data.topEmployees || []).map((emp: any) => {
    const dsr = dsrEmpMap[emp.id] || { revenue: 0, profit: 0, clients: 0 };
    if (dataSource === 'dsr')      return { ...emp, revenue: dsr.revenue,              profit: dsr.profit,              clients: dsr.clients };
    if (dataSource === 'combined') return { ...emp, revenue: emp.revenue + dsr.revenue, profit: emp.profit + dsr.profit, clients: emp.clients + dsr.clients };
    return emp; // clients-only
  }).filter((e: any) => e.revenue > 0 || e.profit > 0 || e.clients > 0 || e.tasks > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue);

  // ── Services tab: build from dsrData.entries + client services ───────────
  const dsrSvcCounts: Record<string, number>  = {};
  const dsrSvcRevenue: Record<string, number> = {};
  dsrData.entries.forEach((d: any) => {
    const svc = d.service_type || d.service || (d.template_key ? d.template_key.replace(/_/g, ' ') : null) || 'DSR Entry';
    dsrSvcCounts[svc]   = (dsrSvcCounts[svc]   || 0) + 1;
    dsrSvcRevenue[svc]  = (dsrSvcRevenue[svc]  || 0) + Number(d.sale_amount || 0);
  });

  let enrichedServiceData: any[];
  const useDataSourceSvc = (tab === 'reports' ? 'clients' : (tab === 'revenue' ? 'combined' : dataSource));

  if (useDataSourceSvc === 'dsr') {
    enrichedServiceData = Object.entries(dsrSvcCounts).map(([name, value]) => ({ name, value, revenue: dsrSvcRevenue[name] || 0 }));
  } else if (useDataSourceSvc === 'clients') {
    enrichedServiceData = data.serviceData || [];
  } else {
    const merged: Record<string, { value: number; revenue: number }> = {};
    (data.serviceData || []).forEach((s: any) => { merged[s.name] = { value: s.value, revenue: s.revenue }; });
    Object.entries(dsrSvcCounts).forEach(([name, count]) => {
      if (merged[name]) { merged[name].value += count; merged[name].revenue += dsrSvcRevenue[name] || 0; }
      else { merged[name] = { value: count, revenue: dsrSvcRevenue[name] || 0 }; }
    });
    enrichedServiceData = Object.entries(merged).map(([name, v]) => ({ name, ...v }));
  }

  // ── Revenue chart: monthly DSR breakdown from reliable dsrData.annualEntries
  const dsrMonthlyMap = dsrData.annualEntries.reduce((map: Record<string, { revenue: number; profit: number }>, e: any) => {
    const key = e.entry_date?.slice(0, 7); // 'YYYY-MM'
    if (key) {
      if (!map[key]) map[key] = { revenue: 0, profit: 0 };
      map[key].revenue += Number(e.sale_amount   || 0);
      map[key].profit  += Number(e.profit_amount || 0);
    }
    return map;
  }, {});

  // Merge DSR monthly data into revenueData chart array
  const enrichedRevenueData = (data.revenueData || []).map((item: any, idx: number) => {
    // item.month is a short label (e.g. 'Jun'); we need the YYYY-MM key
    // Reconstruct from position: last 12 months ending at reportMonth
    const [rYear, rMonth] = reportMonth.split('-').map(Number);
    const d = new Date(rYear, rMonth - 1 - (11 - idx), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dsr = dsrMonthlyMap[key] || { revenue: 0, profit: 0 };

    // revenue tab always uses combined logic for the chart
    const useDataSource = tab === 'revenue' ? 'combined' : dataSource;

    if (useDataSource === 'dsr')      return { ...item, revenue: dsr.revenue,              profit: dsr.profit,              clients: dsrData.annualEntries.filter((e: any) => e.entry_date?.startsWith(key)).length };
    if (useDataSource === 'combined') return { ...item, revenue: item.revenue + dsr.revenue, profit: item.profit + dsr.profit };
    return item; // clients-only
  });


  const exportCSV = (rows: any[], filename: string) => {
    exportToExcel(rows, filename.replace(/\.csv$/, ''), 'Sheet1');
  };

  const tabs = ['dashboard', 'reports', 'clients', 'employees', 'services', 'revenue'];

  return (
    <div className="space-y-8 animate-fade-in max-w-[1600px] mx-auto">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold font-display tracking-tight text-primary">Business Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground font-medium">Real-time performance analytics and operational insights</p>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(tab !== 'reports' && tab !== 'revenue') && (
            <select value={dataSource} onChange={(e) => setDataSource(e.target.value as any)} className="input-nawi w-auto text-sm bg-primary/5 border-primary/20 font-semibold">
              <option value="combined">Data: Combined (All)</option>
              <option value="dsr">Data: DSR Only</option>
              <option value="clients">Data: Clients Only</option>
            </select>
          )}
          <select value={viewType} onChange={(e) => setViewType(e.target.value as any)} className="input-nawi w-auto text-sm">
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="annual">Annual</option>
            <option value="custom">Custom Range</option>
          </select>
          {viewType === 'custom' ? (
            <div className="flex items-center gap-1">
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="input-nawi w-auto text-sm" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="input-nawi w-auto text-sm" />
            </div>
          ) : (
            <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="input-nawi w-auto text-sm" />
          )}
        </div>
      </div>

      {tab === 'dashboard' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="card-nawi-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-secondary/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
              <div className="relative">
                <Users className="w-5 h-5 text-secondary mb-2" />
                <p className="text-2xl font-black font-display">{data.totalClients}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Clients</p>
                {clientChange !== 0 && <span className={`text-xs font-bold ${clientChange > 0 ? 'text-success' : 'text-destructive'}`}>{clientChange > 0 ? '↑' : '↓'} {Math.abs(clientChange)}%</span>}
              </div>
            </div>
            <div className="card-nawi-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-success/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
              <div className="relative">
                <TrendingUp className="w-5 h-5 text-success mb-2" />
                <p className="text-2xl font-black font-display">{formatCurrency(displayRevenue)}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Net Revenue</p>
                {revenueChange !== 0 && <span className={`text-xs font-bold ${revenueChange > 0 ? 'text-success' : 'text-destructive'}`}>{revenueChange > 0 ? '↑' : '↓'} {Math.abs(revenueChange)}%</span>}
              </div>
            </div>
            <div className="card-nawi-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
              <div className="relative">
                <span className="w-5 h-5 flex items-center justify-center text-primary font-bold text-xs mb-2 bg-primary/10 rounded-full">AED</span>
                <p className="text-2xl font-black font-display text-success">{formatCurrency(displayProfit)}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Profit</p>
              </div>
            </div>
            <div className="card-nawi-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-warning/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
              <div className="relative">
                <CheckSquare className="w-5 h-5 text-warning mb-2" />
                <p className="text-2xl font-black font-display">{data.activeTasks}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tasks Pending</p>
                {data.overdueTasks > 0 && <span className="text-[10px] text-destructive font-black animate-pulse">{data.overdueTasks} OVERDUE</span>}
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <div className="card-nawi-hover relative overflow-hidden cursor-pointer group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
                  <div className="relative">
                    <UserCheck className="w-5 h-5 text-primary mb-2" />
                    <p className="text-2xl font-black font-display">{data.employeesOnline}<span className="text-xs text-muted-foreground font-medium">/{data.totalActiveEmp}</span></p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Live Support</p>
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 bg-card border-border shadow-xl rounded-xl">
                <h4 className="text-[10px] font-black mb-3 border-b pb-2 flex items-center gap-2 uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Active Sessions ({data.employeesOnline})
                </h4>
                {data.onlineEmployeesList.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No active employees</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {data.onlineEmployeesList.map((emp: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted transition-colors">
                        {emp.photo ? (
                          <img src={emp.photo} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold uppercase">
                            {emp.name.split(' ').map((n: any) => n[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <span className="text-[11px] font-bold truncate">{emp.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <div className="card-nawi-hover relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-16 h-16 bg-warning/5 rounded-bl-[40px] transition-all group-hover:w-20 group-hover:h-20" />
              <div className="relative">
                <Calendar className="w-5 h-5 text-warning mb-2" />
                <p className="text-2xl font-black font-display">{data.pendingLeave}</p>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Leave Requests</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.statusCounts).map(([status, count]) => (
              <div key={status} className="card-nawi flex items-center justify-between py-3">
                <StatusBadge status={status} />
                <span className="text-lg font-bold font-display">{count as number}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DSRDashboardWidget 
              basePath="/admin" 
              viewType={viewType as any} 
              reportMonth={reportMonth} 
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
            <SocialLeadsDashboardWidget 
              basePath="/admin" 
              viewType={viewType as any} 
              reportMonth={reportMonth} 
              customStartDate={customStartDate}
              customEndDate={customEndDate}
            />
          </div>

          <div className="space-y-8">
            <div className="card-nawi p-8">
              <h3 className="text-lg font-bold font-display mb-6">Revenue & Profit Trend</h3>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data.revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.1} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                    <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0A7040" stopOpacity={0.1} /><stop offset="95%" stopColor="#0A7040" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500 }} tickFormatter={v => `AED ${v / 1000}k`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} formatter={(v: number) => formatCurrency(v)} />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#052F59" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="profit" name="Profit" stroke="#0A7040" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card-nawi p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 border-b border-border/50 pb-6">
                <div>
                  <h3 className="text-xl font-black font-display text-primary tracking-tight uppercase tracking-widest text-sm">Service Insights Matrix</h3>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">
                    {selectedService ? `Viewing details for: ${selectedService}` : 'Click a service to view specific processing status'}
                  </p>
                </div>
                <div className="flex gap-4">
                  {selectedService && (
                    <button
                      onClick={() => setSelectedService(null)}
                      className="px-5 py-2.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-primary/30 active:scale-95"
                    >
                      Show All Services
                    </button>
                  )}
                  <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/10">
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Services</p>
                    <p className="text-lg font-black text-primary">{data.serviceData.length}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
                <div className="lg:col-span-4 flex flex-col items-center">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-8 self-start">Volume Distribution</p>
                  <div className="h-[280px] w-full cursor-pointer">
                    {data.serviceData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground bg-muted/10 rounded-xl border border-dashed border-border">
                        No data available
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.serviceData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={75}
                            outerRadius={105}
                            paddingAngle={8}
                            stroke="none"
                            label={renderCustomizedLabel}
                            labelLine={false}
                            onClick={(entry) => setSelectedService(entry.name)}
                          >
                            {data.serviceData.map((_: any, i: number) => (
                              <Cell
                                key={i}
                                fill={COLORS[i % COLORS.length]}
                                opacity={selectedService === null || selectedService === data.serviceData[i].name ? 1 : 0.3}
                                className="transition-all duration-300"
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                            formatter={(v: any, name: any) => [`${v} Clients`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-8">Service Breakdown</p>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-4 scrollbar-thin">
                    {data.serviceData.sort((a: any, b: any) => b.value - a.value).map((s: any, i: number) => (
                      <div
                        key={i}
                        onClick={() => setSelectedService(s.name)}
                        className={`flex items-center justify-between group p-4 rounded-2xl transition-all border shadow-sm cursor-pointer ${selectedService === s.name ? 'bg-primary text-white border-primary shadow-xl scale-[1.02]' : 'hover:bg-muted/40 border-transparent hover:border-border/50'
                          }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-4 h-4 rounded-full shadow-sm ${selectedService === s.name ? 'ring-2 ring-white' : ''}`} style={{ background: selectedService === s.name ? 'white' : COLORS[i % COLORS.length] }} />
                          <div>
                            <p className={`text-sm font-black ${selectedService === s.name ? 'text-white' : 'text-foreground'}`}>{s.name}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedService === s.name ? 'text-white/70' : 'text-muted-foreground'}`}>Revenue Impact</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-base font-black ${selectedService === s.name ? 'text-white' : 'text-primary'}`}>{s.value} <span className={`text-[10px] font-medium uppercase ${selectedService === s.name ? 'text-white/70' : 'text-muted-foreground'}`}>Clients</span></p>
                          <p className={`text-xs font-mono font-bold ${selectedService === s.name ? 'text-white' : 'text-success'}`}>{formatCurrency(s.revenue)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-4 lg:border-l border-border/50 lg:pl-8 xl:pl-12 pl-0 pt-6 lg:pt-0">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" /> {selectedService ? `${selectedService} Status` : 'Overall Status'}
                  </p>
                  <div className="space-y-8">
                    {(['New', 'Processing', 'Success', 'Failed'] as const).map(st => {
                      // Filter counts if a service is selected
                      let count = 0;
                      if (selectedService) {
                        count = data.allClients.filter((c: any) => c.service === selectedService && c.status === st).length;
                      } else {
                        count = (data.statusCounts[st] as number) || 0;
                      }

                      const total = selectedService
                        ? data.allClients.filter((c: any) => c.service === selectedService).length || 1
                        : data.totalClients || 1;
                      const pct = Math.round((count / total) * 100);
                      const color = st === 'New' ? '#1A5B96' : st === 'Processing' ? '#C45000' : st === 'Success' ? '#0A7040' : '#C0392B';
                      return (
                        <div key={st} className="space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-muted-foreground uppercase tracking-wider">{st}</span>
                            <span className="font-mono font-black text-primary text-sm">{count} <span className="text-[10px] text-muted-foreground font-medium">({pct}%)</span></span>
                          </div>
                          <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden shadow-inner">
                            <div className="h-full rounded-full transition-all duration-1000 ease-in-out shadow-sm" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Top Performers</h3>
              {data.topEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed rounded-lg">
                  <Target className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs">No performance data found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.topEmployees.slice(0, 5).map((emp: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      {emp.photo ? <img src={emp.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate hover:whitespace-normal hover:break-all relative cursor-help" title={emp.name}>{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.clients} clients</p>
                      </div>
                      <span className="text-sm font-semibold text-success">{formatCurrency(emp.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Top Converters (Leads)</h3>
              {data.topSocialLeadsEmployees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed rounded-lg">
                  <Target className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs">No leads data found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.topSocialLeadsEmployees.slice(0, 5).map((emp: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      {emp.photo ? <img src={emp.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate hover:whitespace-normal hover:break-all relative cursor-help" title={emp.name}>{emp.name}</p>
                        <p className="text-[10px] text-muted-foreground">{emp.assigned} total assigned</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-success block">{emp.converted} conv.</span>
                        <span className="text-[10px] text-muted-foreground">{emp.rate}% rate</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Lead Sources</h3>
              {data.leadData.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No data</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.leadData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip /><Bar dataKey="value" fill="#1A5B96" radius={[0, 4, 4, 0]} name="Clients" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-nawi">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold font-display">Upcoming Dates</h3>
                <Link to="/admin/important-dates" className="text-xs text-secondary hover:underline">View All →</Link>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {data.upcomingDates.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No upcoming dates</p> :
                  data.upcomingDates.slice(0, 8).map((d: any, i: number) => (
                    <Link key={i} to={`/admin/clients/${d.clientId}`} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors">
                      <div>
                        <p className="text-sm font-medium">{d.clientName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{d.type.replace(/([A-Z])/g, ' $1').trim()}</p>
                      </div>
                      <span className={`text-xs font-bold ${d.days <= 3 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : 'text-success'}`}>
                        {d.days === 0 ? 'Today!' : `${d.days}d`}
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="card-nawi">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold font-display flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-primary" /> Active Projects Pulse
                </h3>
                <Link to="/admin/monitoring" className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase hover:bg-primary/20 transition-colors">Open Monitor</Link>
              </div>
              <div className="space-y-4">
                {(!data.monitoringProjects || data.monitoringProjects.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-8 opacity-40 border border-dashed rounded-lg">
                    <LayoutGrid className="w-8 h-8 mb-2" />
                    <p className="text-xs">No active projects yet. Click Open Monitor to start.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {data.monitoringProjects.slice(0, 3).map((p: any) => (
                      <div key={p.id} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold truncate pr-4">{p.title}</span>
                          <span className="font-black text-primary">{p.totalProgress}%</span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${p.totalProgress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-nawi border-l-4 border-warning">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold font-display flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" /> Shield Alerts
                </h3>
                <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-bold uppercase">Real-Time</span>
              </div>
              <div className="space-y-3">
                {/* Currently Offline due to Auto-Logout */}
                {data.todayAttendance.filter((a: any) => a.is_auto_logout && a.logout_time).length > 0 && (
                  <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/10">
                    <p className="text-[10px] font-bold text-destructive mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" /> LIVE: Currently Kicked (Auto)
                    </p>
                    <div className="space-y-2">
                      {data.todayAttendance.filter((a: any) => a.is_auto_logout && a.logout_time).map((a: any) => (
                        <div key={a.id} className="flex flex-col gap-1 border-b border-destructive/5 pb-1.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>{a.name}</span>
                            <span className="text-[10px] text-destructive bg-destructive/10 px-1 rounded animate-pulse">OFFLINE since {safeTime(a.logout_time)}</span>
                          </div>
                          <div className="text-[9px] text-muted-foreground font-medium italic">
                            System kick detected. Waiting for employee to re-login.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Auto-Logout Detailed History */}
                {data.todayAttendance.filter((a: any) => (a.auto_logout_count || 0) > 0).length > 0 && (
                  <div className="p-2.5 rounded-lg bg-warning/5 border border-warning/10">
                    <p className="text-[10px] font-bold text-warning mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Live Shield: Re-login History
                    </p>
                    <div className="space-y-3">
                      {data.todayAttendance.filter((a: any) => (a.auto_logout_count || 0) > 0).map((a: any) => (
                        <div key={a.id} className="flex flex-col gap-1.5 border-b border-warning/10 pb-2.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-primary">{a.name}</span>
                            <span className="bg-warning text-white text-[9px] px-1.5 rounded-full font-black shadow-sm">
                              {a.auto_logout_count} {a.auto_logout_count === 1 ? 'Auto-Kick' : 'Auto-Kicks'}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {a.work_summary?.includes('Offline:') ? (
                              <div className="grid grid-cols-1 gap-1">
                                {a.work_summary.split('Offline:').slice(1).map((log: string, idx: number) => {
                                  const parts = log.split('to');
                                  const logoutTime = parts[0]?.trim();
                                  const loginPart = parts[1]?.split('(');
                                  const loginTime = loginPart ? loginPart[0]?.trim() : 'Active';
                                  const duration = loginPart && loginPart[1] ? `(${loginPart[1].split(')')[0]})` : '';

                                  return (
                                    <div key={idx} className="flex items-center justify-between bg-warning/10 px-2 py-1 rounded text-[9px] border border-warning/5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-warning/20 flex items-center justify-center text-[7px] font-bold text-warning">{idx + 1}</span>
                                        <span className="font-bold text-destructive">{logoutTime}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="font-bold text-success">{loginTime}</span>
                                      </div>
                                      <span className="text-muted-foreground font-medium">{duration}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-[9px] text-muted-foreground italic bg-muted/30 p-1 rounded px-2">
                                Analyzing session data for patterns...
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Active Breaks */}
                {data.todayAttendance.filter((a: any) => a.break_start_time).length > 0 && (
                  <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
                    <p className="text-[10px] font-bold text-blue-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Employees on Break
                    </p>
                    <div className="space-y-1.5">
                      {data.todayAttendance.filter((a: any) => a.break_start_time).map((a: any) => (
                        <div key={a.id} className="flex items-center justify-between text-xs">
                          <span className="font-medium">{a.name}</span>
                          <span className="text-muted-foreground animate-pulse font-medium">Started {safeTime(a.break_start_time)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.todayAttendance.filter((a: any) => a.break_start_time || a.is_auto_logout || (a.auto_logout_count || 0) > 0).length === 0 && (
                  <div className="text-center py-6 border border-dashed rounded-lg">
                    <UserCheck className="w-6 h-6 mx-auto mb-2 opacity-20 text-success" />
                    <p className="text-xs text-muted-foreground">No anomalies detected today</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card-nawi">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold font-display">Today's Attendance</h3>
                <Link to="/admin/attendance" className="text-xs text-secondary hover:underline">View All →</Link>
              </div>
              {data.todayAttendance.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No records</p> : (
                <div className="grid grid-cols-1 gap-2">
                  {data.todayAttendance.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                      {a.photo ? <img src={a.photo} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">{a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{a.name}</p>
                          {a.last_seen_at && (new Date().getTime() - new Date(a.last_seen_at).getTime() < 60000) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_rgba(34,197,94,0.6)]" title="Online now" />
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">
                            {safeTime(a.login_time)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {a.is_auto_logout && a.work_summary?.includes('forgot') ? (
                          <StatusBadge status="Without Checkout" />
                        ) : (
                          <StatusBadge status={a.status} />
                        )}
                        {a.is_auto_logout && !a.work_summary?.includes('forgot') && (
                          <span className="text-[7px] font-black text-warning bg-warning/10 px-1 rounded-sm border border-warning/20 animate-pulse uppercase tracking-tighter">System Kick</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-3">Recent Activity</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.recentAudit.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No activity</p> :
                  data.recentAudit.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.action.includes('delete') ? 'bg-destructive' : a.action.includes('create') ? 'bg-success' : 'bg-secondary'}`} />
                      <div>
                        <p><span className="font-medium">{a.user_name}</span> {a.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="stat-card"><div className="stat-card-icon bg-primary"><Briefcase className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Clients</p><p className="text-xl font-bold font-display">{data.totalClients}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-success"><TrendingUp className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display">{formatCurrency(data.revenueThisMonth)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-secondary"><span className="text-primary-foreground font-bold text-sm">AED</span></div><div><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display">{formatCurrency(data.profitThisMonth)}</p></div></div>
            <div className="stat-card"><div className="stat-card-icon bg-warning"><Target className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Conversion Rate</p><p className="text-xl font-bold font-display">{data.totalClients > 0 ? Math.round((data.statusCounts.Success / data.totalClients) * 100) : 0}%</p></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Client Acquisition & Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.revenueData}>
                  <defs>
                    <linearGradient id="rG2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.15} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => typeof v === 'number' && v > 100 ? formatCurrency(v) : v} />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#rG2)" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="clients" stroke="#C45000" strokeWidth={2} name="New Clients" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Revenue by Lead Source</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.leadData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#1A5B96" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Top Social Leads Converters</h3>
              {data.topSocialLeadsEmployees.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No data</p> : (
                <div className="space-y-3">
                  {data.topSocialLeadsEmployees.map((emp: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
                      <div className="flex items-center gap-3">
                        {emp.photo ? <img src={emp.photo} alt="" className="w-10 h-10 rounded-full object-cover" /> :
                          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                        <div>
                          <p className="text-sm font-semibold">{emp.name}</p>
                          <p className="text-xs text-muted-foreground">{emp.assigned} leads handled</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-success font-display">{emp.converted}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Converted ({emp.rate}%)</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card-nawi">
              <h3 className="text-base font-semibold font-display mb-4">Nationality Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.nationalityData} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} /><Tooltip /><Bar dataKey="value" fill="#052F59" radius={[0, 4, 4, 0]} name="Clients" /></BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input 
              type="text" 
              placeholder="Search clients..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="input-nawi text-sm"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi text-sm">
              <option value="">All Statuses</option>
              {['New', 'Processing', 'Success', 'Failed'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="input-nawi text-sm">
              <option value="">All Services</option>
              {Array.from(new Set(data.allClients.map((c: any) => c.service).filter(Boolean))).map((s: any) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => exportCSV(data.allClients.map((c: any) => ({ ID: c.display_id, Name: c.name, Service: c.service, Status: c.status, Revenue: c.revenue, Profit: c.profit, LeadSource: c.lead_source, Nationality: c.nationality || '', Created: formatDate(c.created_at) })), 'clients_report.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button>
          </div>
          <div className="card-nawi p-0 overflow-hidden">
            <div className="table-container border-none">
              <table className="table-nawi w-full"><thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Lead Source</th><th>Revenue</th><th>Profit</th><th>Created</th></tr></thead>
                <tbody>{data.allClients
                  .filter((c: any) => {
                    if (searchTerm && !c.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !c.display_id?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
                    if (statusFilter && c.status !== statusFilter) return false;
                    if (serviceFilter && c.service !== serviceFilter) return false;
                    return true;
                  })
                  .slice(0, 100).map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.display_id}</td><td>{c.name}</td><td>{c.service}</td><td><StatusBadge status={c.status} /></td><td>{c.lead_source}</td><td>{formatCurrency(c.revenue || 0)}</td><td className="text-success">{formatCurrency(c.profit || 0)}</td><td>{formatDate(c.created_at)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <div className="card-nawi p-0">
          <div className="p-4 flex justify-end"><button onClick={() => exportCSV(data.topEmployees.map((e: any) => ({ Name: e.name, Clients: e.clients, Revenue: e.revenue, Profit: e.profit, TasksDone: e.tasks, SuccessRate: e.successRate + '%', PresentDays: e.presentDays })), 'employee_performance.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export</button></div>
          <div className="table-container border-none">
            <table className="table-nawi w-full text-sm">
              <thead><tr><th>Employee</th><th>Status</th><th>Revenue</th><th>Profit</th><th>Success %</th><th>Total Hours</th><th>Net Hours</th><th>Avg/Day</th></tr></thead>
              <tbody>{enrichedEmployees.map((e: any) => (
                <tr key={e.id}>
                  <td className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        {e.photo ? <img src={e.photo} alt="" className="w-7 h-7 rounded-full object-cover" /> :
                          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">{e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                        {e.isOnline && (
                          <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-success border border-card shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" title="Online now" />
                        )}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td>
                    {e.isClockedIn ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success border border-success/20 flex items-center gap-1 w-fit">
                        <div className="w-1 h-1 rounded-full bg-success animate-ping" /> CLOCKED IN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border w-fit">
                        OFFLINE
                      </span>
                    )}
                  </td>
                  <td>{formatCurrency(e.revenue)}</td>
                  <td className="text-success font-semibold">{formatCurrency(e.profit)}</td>
                  <td><div className="flex items-center gap-2"><div className="w-16 h-2 bg-muted rounded-full"><div className="h-full bg-primary rounded-full" style={{ width: `${e.successRate}%` }} /></div><span className="text-xs">{e.successRate}%</span></div></td>
                  <td className="font-semibold">{e.totalHours}h</td>
                  <td className="font-semibold text-primary">{e.netHours}h</td>
                  <td className="text-muted-foreground font-medium">{e.avgHours}h</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'services' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="card-nawi lg:col-span-5 xl:col-span-4 flex flex-col min-h-[450px]">
              <h3 className="text-base font-semibold font-display mb-8">Volume Distribution</h3>
              <div className="flex-1 flex flex-col justify-center">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={enrichedServiceData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={5}
                      label={renderCustomizedLabel}
                      labelLine={false}
                      stroke="none"
                    >
                      {enrichedServiceData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(v: any, name: any) => [`${v} Clients`, name]}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      formatter={(value) => {
                        const item = enrichedServiceData.find(d => d.name === value);
                        return <span className="text-[11px] font-bold text-primary px-2">{value}: {item?.value || 0}</span>;
                      }}
                      wrapperStyle={{ paddingTop: '30px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card-nawi lg:col-span-7 xl:col-span-8 flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-base font-semibold font-display">Service Performance Matrix</h3>
                <div className="flex gap-2">
                  <div className="px-3 py-1 bg-primary/5 rounded-full text-[10px] font-bold text-primary uppercase tracking-widest">Live Metrics</div>
                </div>
              </div>
              <div className="table-container border-none flex-1 overflow-visible">
                <table className="table-nawi w-full text-[13px]">
                  <thead>
                    <tr className="bg-transparent border-b-2 border-primary/10">
                      <th className="py-4 text-left font-black text-muted-foreground uppercase tracking-widest text-[10px]">Service Name</th>
                      <th className="py-4 text-center font-black text-muted-foreground uppercase tracking-widest text-[10px]">Clients</th>
                      <th className="py-4 text-center font-black text-muted-foreground uppercase tracking-widest text-[10px]">Market Share</th>
                      <th className="py-4 text-right font-black text-muted-foreground uppercase tracking-widest text-[10px]">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {enrichedServiceData.sort((a: any, b: any) => b.value - a.value).map((s: any, i: number) => {
                      const totalValue = enrichedServiceData.reduce((acc: number, curr: any) => acc + curr.value, 0) || 1;
                      const pct = ((s.value / totalValue) * 100).toFixed(1);
                      return (
                        <tr key={i} className="hover:bg-primary/[0.02] transition-colors group">
                          <td className="py-4 font-bold flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ background: COLORS[i % COLORS.length] }} />
                            {s.name}
                          </td>
                          <td className="py-4 text-center font-mono font-black text-primary">{s.value}</td>
                          <td className="py-4">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-20 h-2 bg-muted rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-mono text-[11px] font-bold text-muted-foreground">{pct}%</span>
                            </div>
                          </td>
                          <td className="py-4 text-right font-black text-success text-[14px]">{formatCurrency(s.revenue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="card-nawi p-8">
            <h3 className="text-base font-semibold font-display mb-8">Revenue Comparison by Service</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={enrichedServiceData} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} width={120} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                  cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                />
                <Bar dataKey="revenue" fill="#052F59" radius={[0, 6, 6, 0]} barSize={32} animationDuration={1500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-2xl font-bold font-display">{formatCurrency(displayRevenue)}</p></div>
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-2xl font-bold font-display text-success">{formatCurrency(displayProfit)}</p></div>
            <div className="card-nawi text-center"><p className="text-xs text-muted-foreground">Profit Margin</p><p className="text-2xl font-bold font-display">{displayRevenue > 0 ? Math.round((displayProfit / displayRevenue) * 100) : 0}%</p></div>
          </div>
          <div className="card-nawi">
            <h3 className="text-base font-semibold font-display mb-4">Revenue vs Profit by Month</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={enrichedRevenueData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Legend /><Bar dataKey="revenue" fill="#052F59" radius={[4, 4, 0, 0]} name="Revenue" /><Bar dataKey="profit" fill="#0A7040" radius={[4, 4, 0, 0]} name="Profit" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <footer className="mt-16 pb-8 text-center border-t border-border/10 pt-8">
        <p className="text-[10px] tracking-wider text-muted-foreground/60 font-medium italic">
          Designed and Developed by Mhd Wasim
        </p>
      </footer>
    </div>
  );
}
