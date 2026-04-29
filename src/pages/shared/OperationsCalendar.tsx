import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Target, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';

export default function OperationsCalendar() {
  const { user, profile, isAdmin } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [taskForm, setTaskForm] = useState({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });
  const [goalForm, setGoalForm] = useState({ title: '', assignedTo: '', startDate: '', endDate: '', description: '', goalTasks: [{ title: '', dueDate: '' }] as { title: string; dueDate: string }[] });

  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  const reload = async () => {
    const [t, g, e, c] = await Promise.all([
      isAdmin ? supabase.from('tasks').select('*') : supabase.from('tasks').select('*').or(`assigned_to.eq.${user?.id},created_by.eq.${user?.id}`),
      supabase.from('goals').select('*'),
      supabase.from('profiles').select('*').eq('status', 'active'),
      supabase.from('clients').select('id, name, service, display_id'),
    ]);
    setTasks(t.data || []);
    setGoals(g.data || []);
    setEmployees(e.data || []);
    setClients(c.data || []);
  };

  useEffect(() => { reload(); }, [isAdmin, user]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date();
  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

  const getTasksForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasks.filter((t: any) => t.due_date === dateStr);
  };

  const monthGoals = goals.filter((g: any) => {
    if (g.year_month) return g.year_month === yearMonth;
    if (g.start_date && g.end_date) {
      const start = g.start_date.substring(0, 7);
      const end = g.end_date.substring(0, 7);
      return yearMonth >= start && yearMonth <= end;
    }
    return false;
  });

  const handlePrev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const handleNext = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const client = clients.find((c: any) => c.id === taskForm.clientId);
    const emp = employees.find((e: any) => e.user_id === taskForm.assignedTo);
    const displayId = await generateDisplayId('TSK');
    await supabase.from('tasks').insert({
      display_id: displayId, client_id: taskForm.clientId || null, client_name: client?.name || null,
      service: taskForm.service || client?.service || null, title: taskForm.title,
      assigned_to: isAdmin ? taskForm.assignedTo || null : user.id,
      assigned_to_name: isAdmin ? emp?.name || null : profile?.name || null,
      due_date: taskForm.dueDate, status: 'New' as const, notes: taskForm.notes,
      created_by: user.id,
    });
    await auditLog('task_created', 'task', displayId, {});
    setShowAddTask(false);
    setTaskForm({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });
    reload();
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const displayId = await generateDisplayId('GOAL');
    const emp = employees.find((e: any) => e.user_id === goalForm.assignedTo);
    await supabase.from('goals').insert({
      display_id: displayId, title: goalForm.title, assigned_to: goalForm.assignedTo || null,
      start_date: goalForm.startDate || null, end_date: goalForm.endDate || null,
      description: goalForm.description || null, year_month: yearMonth, service: 'General',
      created_by: user.id,
    });

    for (const gt of goalForm.goalTasks) {
      if (!gt.title) continue;
      const taskDisplayId = await generateDisplayId('TSK');
      await supabase.from('tasks').insert({
        display_id: taskDisplayId, title: gt.title,
        assigned_to: goalForm.assignedTo || null,
        assigned_to_name: emp?.name || 'All',
        due_date: gt.dueDate || goalForm.endDate || null, status: 'New' as const,
        notes: `Goal: ${goalForm.title}`, created_by: user.id,
      });
    }

    await auditLog('goal_created', 'goal', displayId, { tasksCount: goalForm.goalTasks.filter(t => t.title).length });
    setShowAddGoal(false);
    setGoalForm({ title: '', assignedTo: '', startDate: '', endDate: '', description: '', goalTasks: [{ title: '', dueDate: '' }] });
    reload();
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    const updates: any = { status };
    if (status === 'Completed') {
      const profitStr = prompt('Enter profit amount (AED):');
      if (profitStr) {
        updates.profit = Number(profitStr);
        updates.completed_date = new Date().toISOString().split('T')[0];
      }
    }
    await supabase.from('tasks').update(updates).eq('id', taskId);
    await auditLog('task_updated', 'task', taskId, { status });
    reload();
  };

  const dayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="btn-outline p-2"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold font-display">{new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={handleNext} className="btn-outline p-2"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => setShowAddGoal(true)} className="btn-outline"><Target className="w-4 h-4" /> Set Goal</button>}
          <button onClick={() => setShowAddTask(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Task</button>
        </div>
      </div>

      {monthGoals.length > 0 && (
        <div className="card-nawi bg-primary/5 border-primary/20">
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2"><Target className="w-4 h-4" /> Goals</h3>
          <div className="space-y-2">
            {monthGoals.map((g: any) => {
              const emp = employees.find((e: any) => e.user_id === g.assigned_to);
              const goalTasks = tasks.filter((t: any) => t.notes?.includes(`Goal: ${g.title}`));
              const completedCount = goalTasks.filter((t: any) => t.status === 'Completed').length;
              return (
                <div key={g.id} className="p-3 bg-background rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{g.title}</p>
                    {goalTasks.length > 0 && <span className="text-xs font-medium text-primary">{completedCount}/{goalTasks.length} tasks</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {emp?.name || 'All'} • {g.start_date ? `${formatDate(g.start_date)} → ${formatDate(g.end_date)}` : g.year_month}
                  </p>
                  {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  {goalTasks.length > 0 && (
                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-muted rounded-full">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${goalTasks.length > 0 ? (completedCount / goalTasks.length) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-2 space-y-1">
                        {goalTasks.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between text-xs">
                            <span className={t.status === 'Completed' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                            <StatusBadge status={t.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <div className="card-nawi flex-1">
          <div className="grid grid-cols-7 gap-px">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className={`text-center text-xs font-medium py-2 ${d === 'Fri' || d === 'Sat' ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayT = getTasksForDay(day);
              const hasOverdue = dayT.some((t: any) => (t.status === 'New' || t.status === 'Processing') && new Date(t.due_date) < today);
              const dayOfWeek = new Date(year, month, day).getDay();
              const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
              return (
                <button key={day} onClick={() => setSelectedDay(day)}
                  className={`relative p-2 rounded-lg text-sm transition-all min-h-[48px] ${
                    selectedDay === day ? 'bg-primary text-primary-foreground' :
                    isToday(day) ? 'border-2 border-primary' :
                    hasOverdue ? 'bg-destructive/10' :
                    isWeekend ? 'bg-muted/30 text-muted-foreground' :
                    'hover:bg-muted'
                  }`}>
                  {day}
                  {dayT.length > 0 && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded-full ${selectedDay === day ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{dayT.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDay && (
          <div className="card-nawi w-80 flex-shrink-0 animate-slide-in-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold font-display">{new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tasks</p>
            ) : (
              <div className="space-y-3">
                {dayTasks.map((t: any) => (
                  <div key={t.id} className="p-3 border border-border rounded-lg">
                    <p className="font-medium text-sm">{t.title}</p>
                    {t.client_name && <p className="text-xs text-muted-foreground">{t.client_name} • {t.service}</p>}
                    {t.assigned_to_name && <p className="text-xs text-muted-foreground">→ {t.assigned_to_name}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <StatusBadge status={t.status} />
                      <select value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value)} className="text-xs border border-border rounded px-1 py-0.5">
                        <option>New</option><option>Processing</option><option>Completed</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setTaskForm({ ...taskForm, dueDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` }); setShowAddTask(true); }} className="btn-outline w-full mt-4"><Plus className="w-4 h-4" /> Add Task</button>
          </div>
        )}
      </div>

      {showAddTask && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddTask(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Add Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client</label>
                <select value={taskForm.clientId} onChange={(e) => { const c = clients.find((c: any) => c.id === e.target.value); setTaskForm({ ...taskForm, clientId: e.target.value, service: c?.service || '' }); }} className="input-nawi">
                  <option value="">Select (optional)...</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.display_id})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Title *</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="input-nawi" required /></div>
              {isAdmin && (
                <div><label className="block text-sm font-medium mb-1">Assign To</label>
                  <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} className="input-nawi">
                    <option value="">Select...</option>{employees.map((e: any) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className="input-nawi" rows={2} /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAddTask(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Add Task</button></div>
            </form>
          </div>
        </div>
      )}

      {showAddGoal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddGoal(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4 flex items-center gap-2"><Target className="w-5 h-5" /> Set Goal with Tasks</h2>
            <form onSubmit={handleAddGoal} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Goal Title *</label><input value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} className="input-nawi" required placeholder="e.g., Process 50 UAE Visas" /></div>
              <div><label className="block text-sm font-medium mb-1">Assign To</label>
                <select value={goalForm.assignedTo} onChange={(e) => setGoalForm({ ...goalForm, assignedTo: e.target.value })} className="input-nawi">
                  <option value="">All Employees</option>{employees.map((e: any) => <option key={e.user_id} value={e.user_id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start Date</label><input type="date" value={goalForm.startDate} onChange={(e) => setGoalForm({ ...goalForm, startDate: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">End Date</label><input type="date" value={goalForm.endDate} onChange={(e) => setGoalForm({ ...goalForm, endDate: e.target.value })} className="input-nawi" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} className="input-nawi" rows={2} placeholder="Details for the employee..." /></div>
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold">Tasks under this Goal</label>
                  <button type="button" onClick={() => setGoalForm({ ...goalForm, goalTasks: [...goalForm.goalTasks, { title: '', dueDate: '' }] })} className="btn-outline text-xs py-1"><Plus className="w-3 h-3" /> Add Task</button>
                </div>
                {goalForm.goalTasks.map((gt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={gt.title} onChange={(e) => { const u = [...goalForm.goalTasks]; u[i].title = e.target.value; setGoalForm({ ...goalForm, goalTasks: u }); }} className="input-nawi flex-1" placeholder={`Task ${i + 1} title`} />
                    <input type="date" value={gt.dueDate} onChange={(e) => { const u = [...goalForm.goalTasks]; u[i].dueDate = e.target.value; setGoalForm({ ...goalForm, goalTasks: u }); }} className="input-nawi w-36" />
                    {goalForm.goalTasks.length > 1 && <button type="button" onClick={() => setGoalForm({ ...goalForm, goalTasks: goalForm.goalTasks.filter((_, j) => j !== i) })} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAddGoal(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Create Goal & Tasks</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
