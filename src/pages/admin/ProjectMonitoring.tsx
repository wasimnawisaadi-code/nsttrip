import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, Search, LayoutGrid, List, 
  Clock, CheckCircle2, AlertCircle, FileText, 
  MessageSquare, UserPlus, Calendar, BarChart3,
  TrendingUp, CheckSquare, Target, Paperclip, Trash2, Edit, Check,
  ChevronLeft, ChevronRight, Sparkles, Globe, CalendarDays
} from 'lucide-react';
import { formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { toast } from 'sonner';

export default function ProjectMonitoring() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newProject, setNewProject] = useState({ title: '', description: '' });
  const [editProject, setEditProject] = useState({ id: '', title: '', description: '' });
  const [newTask, setNewTask] = useState({
    name: '', description: '', assigned_to: '', 
    start_date: new Date().toISOString().split('T')[0],
    deadline: '', status: 'To Do', progress_percentage: 0
  });

  // Real-Time Dubai Time Clock States
  const [dubaiTime, setDubaiTime] = useState('');
  const [dubaiDate, setDubaiDate] = useState('');
  const [dubaiDay, setDubaiDay] = useState('');
  const [blinkColon, setBlinkColon] = useState(true);

  // Interactive Calendar States
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calSelectedDay, setCalSelectedDay] = useState<number | null>(null);

  // Ticking Effect for Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Dubai is UTC+4. Calculate UTC then add 4 hours.
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const dxbTime = new Date(utc + (3600000 * 4));
      
      let hours = dxbTime.getHours();
      const minutes = String(dxbTime.getMinutes()).padStart(2, '0');
      const seconds = String(dxbTime.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, '0');

      setDubaiTime(`${formattedHours}:${minutes}:${seconds} ${ampm}`);
      setDubaiDate(dxbTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      setDubaiDay(dxbTime.toLocaleDateString('en-US', { weekday: 'long' }));
      
      setBlinkColon(prev => !prev);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calendar Helpers
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calFirstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const calToday = new Date();
  
  const isCalToday = (d: number) => 
    calYear === calToday.getFullYear() && 
    calMonth === calToday.getMonth() && 
    d === calToday.getDate();

  const handleCalPrev = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
    setCalSelectedDay(null);
  };

  const handleCalNext = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
    setCalSelectedDay(null);
  };

  const getItemsForDay = (day: number) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Match project creation dates
    const dayProjects = projects.filter(p => {
      const pDate = p.created_at ? p.created_at.split('T')[0] : '';
      return pDate === dateStr;
    });

    // Match task creation dates
    const dayTasks: any[] = [];
    projects.forEach(p => {
      if (p.tasks) {
        const pTasks = p.tasks.filter((t: any) => {
          const tDate = t.created_at ? t.created_at.split('T')[0] : '';
          return tDate === dateStr;
        });
        pTasks.forEach((t: any) => {
          dayTasks.push({ ...t, projectTitle: p.title });
        });
      }
    });

    return { projects: dayProjects, tasks: dayTasks };
  };

  // Clock string parsers
  const clockParts = dubaiTime.split(' ');
  const timeStr = clockParts[0] || '';
  const ampmStr = clockParts[1] || '';
  const [hh, mm, ss] = timeStr.split(':');

  const loadData = async () => {
    setLoading(true);
    const { data: projs } = await supabase.from('monitoring_projects').select('*').order('created_at', { ascending: false });
    const { data: tasks } = await supabase.from('monitoring_tasks').select('*');
    const { data: emps } = await supabase.from('profiles').select('user_id, name');

    const projectsWithTasks = projs?.map(p => {
      const pTasks = tasks?.filter(t => t.project_id === p.id) || [];
      const totalProgress = pTasks.length > 0 
        ? Math.round(pTasks.reduce((acc, t) => acc + (t.progress_percentage || 0), 0) / pTasks.length)
        : 0;
      return { ...p, tasks: pTasks, totalProgress };
    }) || [];

    setProjects(projectsWithTasks);
    setEmployees(emps || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('monitoring_projects').insert([newProject]).select();
    if (data) {
      setShowAddProject(false);
      setNewProject({ title: '', description: '' });
      loadData();
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    
    // Ensure empty strings are sent as null for UUID/Date fields
    const taskData = {
      name: newTask.name,
      description: newTask.description,
      project_id: selectedProject.id,
      status: 'To Do',
      progress_percentage: 0
    };

    const { data, error } = await supabase.from('monitoring_tasks').insert([taskData]).select();
    
    if (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task: ' + error.message);
      return;
    }

    if (data) {
      setShowAddTask(false);
      setNewTask({ name: '', description: '', assigned_to: '', start_date: new Date().toISOString().split('T')[0], deadline: '', status: 'To Do', progress_percentage: 0 });
      loadData();
      toast.success('Task added successfully!');
    }
  };

  const updateTaskProgress = async (taskId: string, progress: number) => {
    const status = progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'To Do';
    await supabase.from('monitoring_tasks').update({ progress_percentage: progress, status }).eq('id', taskId);
    loadData();
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project and all its tasks?')) {
      await supabase.from('monitoring_projects').delete().eq('id', id);
      if (selectedProject?.id === id) setSelectedProject(null);
      loadData();
      toast.success('Project deleted');
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (confirm('Delete this sub-task?')) {
      await supabase.from('monitoring_tasks').delete().eq('id', id);
      loadData();
      toast.success('Task deleted');
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data } = await supabase.from('monitoring_projects').update({
      title: editProject.title,
      description: editProject.description
    }).eq('id', editProject.id).select();
    if (data) {
      setShowEditProject(false);
      loadData();
      toast.success('Project updated');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight text-primary">Project Monitoring</h2>
          <p className="text-sm text-muted-foreground font-medium">Track enterprise integrations and development progress</p>
        </div>
        <div className="flex items-center gap-3">
          {hh && (
            <div className="hidden md:flex flex-col items-end bg-primary/5 px-3 py-1 border border-primary/10 rounded-xl">
              <span className="text-[9px] font-black text-primary flex items-center gap-1 uppercase tracking-wider">
                <Clock className="w-2.5 h-2.5 text-primary animate-pulse" /> Dubai Time
              </span>
              <span className="text-xs font-mono font-bold mt-0.5">
                {hh}:{mm} <span className="text-[9px] font-black text-muted-foreground">{ampmStr}</span>
              </span>
            </div>
          )}
          <button onClick={() => setShowAddProject(true)} className="btn-primary shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
            <Plus className="w-4 h-4" /> Create New Project
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-card-icon bg-primary"><TrendingUp className="w-5 h-5 text-primary-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">Active Projects</p><p className="text-xl font-bold">{projects.length}</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon bg-success"><CheckSquare className="w-5 h-5 text-primary-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">Completed Tasks</p><p className="text-xl font-bold">{projects.reduce((acc, p) => acc + p.tasks.filter((t: any) => t.status === 'Completed').length, 0)}</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon bg-warning"><Clock className="w-5 h-5 text-primary-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">Pending Tasks</p><p className="text-xl font-bold">{projects.reduce((acc, p) => acc + p.tasks.filter((t: any) => t.status !== 'Completed').length, 0)}</p></div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon bg-secondary"><Target className="w-5 h-5 text-primary-foreground" /></div>
          <div><p className="text-xs text-muted-foreground">Average Completion</p><p className="text-xl font-bold">{projects.length > 0 ? Math.round(projects.reduce((acc, p) => acc + p.totalProgress, 0) / projects.length) : 0}%</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" /> All Projects
          </h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {projects.map(p => (
              <div 
                key={p.id} 
                onClick={() => setSelectedProject(p)}
                className={`card-nawi cursor-pointer transition-all border-l-4 relative group min-h-[110px] ${selectedProject?.id === p.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-transparent hover:border-muted'}`}
              >
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-sm truncate pr-20">{p.title}</h4>
                    <div className="absolute top-3 right-3 flex gap-1.5 z-10">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditProject({ id: p.id, title: p.title, description: p.description || '' }); setShowEditProject(true); }} 
                        className="p-1.5 rounded-md bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteProject(p.id, e)} 
                        className="p-1.5 rounded-md bg-destructive/5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black bg-muted text-muted-foreground px-2 py-0.5 rounded-full uppercase tracking-widest">{p.tasks.length} TASKS</span>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-1 mb-auto pr-4">{p.description || 'No description'}</p>
                  
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-[9px] font-black tracking-widest">
                      <span className="text-muted-foreground uppercase">Progress</span>
                      <span className="text-primary">{p.totalProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(var(--primary),0.4)]" style={{ width: `${p.totalProgress}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedProject ? (
            <div className="card-nawi p-6 animate-slide-up bg-card/50 backdrop-blur-sm">
              <div className="flex justify-between items-start mb-6 pb-6 border-b border-border/50">
                <div>
                  <h3 className="text-2xl font-black font-display text-primary tracking-tight">{selectedProject.title}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-black bg-success/10 text-success px-2 py-0.5 rounded uppercase tracking-widest">{selectedProject.totalProgress}% DONE</span>
                    <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-widest">{100 - selectedProject.totalProgress}% LEFT</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3 font-medium">{selectedProject.description}</p>
                </div>
                <button onClick={() => setShowAddTask(true)} className="btn-primary shadow-lg shadow-primary/20">
                  <Plus className="w-4 h-4" /> Add Sub Task
                </button>
              </div>

              {/* Progress Analytics Bar */}
              <div className="grid grid-cols-3 gap-6 mb-8 bg-muted/20 p-6 rounded-[2rem] border-2 border-primary/5">
                <div className="text-center group/stat">
                  <p className="text-[10px] text-muted-foreground uppercase font-black mb-1 tracking-[0.2em]">To Do</p>
                  <p className="text-4xl font-black text-muted-foreground/80">{selectedProject.tasks.filter((t: any) => t.status === 'Pending' || t.status === 'To Do').length}</p>
                </div>
                <div className="text-center border-x-2 border-primary/5 group/stat">
                  <p className="text-[10px] text-primary uppercase font-black mb-1 tracking-[0.2em]">In Progress</p>
                  <p className="text-4xl font-black text-primary">{selectedProject.tasks.filter((t: any) => t.status === 'In Progress').length}</p>
                </div>
                <div className="text-center group/stat">
                  <p className="text-[10px] text-success uppercase font-black mb-1 tracking-[0.2em]">Completed</p>
                  <p className="text-4xl font-black text-success">{selectedProject.tasks.filter((t: any) => t.status === 'Completed').length}</p>
                </div>
              </div>

              {/* Enhanced Visual Progress */}
              <div className="mb-8 px-2">
                 <div className="flex justify-between text-[11px] font-black uppercase tracking-tighter mb-2">
                    <span className="text-success">Work Completed ({selectedProject.totalProgress}%)</span>
                    <span className="text-primary">Remaining Gap ({100 - selectedProject.totalProgress}%)</span>
                 </div>
                 <div className="h-4 w-full bg-primary/10 rounded-full overflow-hidden flex border border-primary/10 shadow-inner">
                    <div className="h-full bg-success transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(34,197,94,0.4)]" style={{ width: `${selectedProject.totalProgress}%` }} />
                    <div className="h-full bg-transparent flex-1" />
                 </div>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {selectedProject.tasks.length === 0 ? (
                  <div className="text-center py-20 border-2 border-dashed rounded-[2rem] border-muted-foreground/20 opacity-40">
                    <CheckSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-bold text-lg">No sub-tasks found</p>
                    <p className="text-sm">Create your first task to start monitoring</p>
                  </div>
                ) : (
                  selectedProject.tasks.map((t: any) => (
                    <div key={t.id} className={`p-5 rounded-2xl border transition-all relative ${t.progress_percentage === 100 ? 'bg-success/5 border-success/20' : t.progress_percentage > 0 ? 'bg-primary/5 border-primary/20' : 'bg-muted/10 border-border hover:border-primary/30'}`}>
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                          onClick={() => handleDeleteTask(t.id)} 
                          className="p-1.5 rounded-lg bg-destructive/5 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-start justify-between gap-4 mb-4 pr-12">
                        <div className="flex-1 min-w-0">
                          <h5 className={`font-bold text-base ${t.progress_percentage === 100 ? 'line-through text-muted-foreground/60' : ''}`}>{t.name}</h5>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-6">
                         <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-widest">
                               Weight: {Math.round(100 / (selectedProject.tasks.length || 1))}% of Project
                            </span>
                            {t.progress_percentage === 100 && (
                               <span className="text-[10px] font-black bg-success text-success-foreground px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5 stroke-[4px]" /> Contribution Full
                               </span>
                            )}
                         </div>
                      </div>

                      <div className="flex items-center gap-4 bg-background/30 p-4 rounded-xl border border-border/50 mt-4">
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="1"
                          value={t.progress_percentage}
                          onChange={async (e) => {
                            const val = parseInt(e.target.value);
                            let status = 'To Do';
                            if (val === 100) status = 'Completed';
                            else if (val > 0) status = 'In Progress';
                            
                            // High-speed optimistic update
                            const updatedProjects = projects.map(p => {
                              if (p.id === selectedProject.id) {
                                const updatedTasks = p.tasks.map((task: any) => 
                                  task.id === t.id ? { ...task, progress_percentage: val, status: status } : task
                                );
                                const totalProgress = Math.round(updatedTasks.reduce((acc: number, tk: any) => acc + (tk.progress_percentage || 0), 0) / updatedTasks.length);
                                return { ...p, tasks: updatedTasks, totalProgress };
                              }
                              return p;
                            });
                            setProjects(updatedProjects);
                            setSelectedProject(updatedProjects.find(p => p.id === selectedProject.id));

                            await supabase.from('monitoring_tasks').update({ 
                              progress_percentage: val,
                              status: status
                            }).eq('id', t.id);
                          }}
                          className="flex-1 h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="min-w-[60px] text-right">
                           <span className="text-lg font-black text-primary">{t.progress_percentage}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="card-nawi p-8 bg-gradient-to-br from-primary/5 via-transparent to-success/5 border-primary/10">
                <div className="flex items-center gap-4 mb-8">
                   <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                      <TrendingUp className="w-6 h-6 text-primary-foreground" />
                   </div>
                   <div>
                      <h3 className="text-xl font-black font-display tracking-tight">Organization Health Dashboard</h3>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Global task distribution across {projects.length} projects</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                   <div className="p-6 rounded-[2rem] bg-background/50 border border-border/50 text-center hover:scale-105 transition-transform cursor-default">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">Total Tasks</p>
                      <p className="text-5xl font-black text-foreground">{projects.reduce((acc, p) => acc + p.tasks.length, 0)}</p>
                   </div>
                   <div className="p-6 rounded-[2rem] bg-primary/5 border border-primary/20 text-center hover:scale-105 transition-transform cursor-default">
                      <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">In Progress</p>
                      <p className="text-5xl font-black text-primary">{projects.reduce((acc, p) => acc + p.tasks.filter((t:any) => t.status === 'In Progress').length, 0)}</p>
                   </div>
                   <div className="p-6 rounded-[2rem] bg-success/5 border border-success/20 text-center hover:scale-105 transition-transform cursor-default">
                      <p className="text-[10px] font-black text-success uppercase tracking-[0.2em] mb-2">Completed</p>
                      <p className="text-5xl font-black text-success">{projects.reduce((acc, p) => acc + p.tasks.filter((t:any) => t.status === 'Completed').length, 0)}</p>
                   </div>
                </div>

                <div className="space-y-6">
                   <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Completion Velocity</h4>
                   <div className="space-y-4">
                      {projects.slice(0, 5).map(p => (
                         <div key={p.id} className="group cursor-pointer" onClick={() => setSelectedProject(p)}>
                            <div className="flex justify-between items-center mb-2 px-2">
                               <span className="text-xs font-bold group-hover:text-primary transition-colors">{p.title}</span>
                               <span className="text-[10px] font-black text-primary">{p.totalProgress}%</span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden border border-border/50">
                               <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${p.totalProgress}%` }} />
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Monthly Interactive Calendar */}
                <div className="card-nawi p-5 bg-card/65 backdrop-blur-md border border-border/80 shadow-md">
                  <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <CalendarDays className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-primary">Operations Calendar</h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={handleCalPrev} className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground transition-all">
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold font-display px-1.5 min-w-[90px] text-center">
                        {new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                      <button onClick={handleCalNext} className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground transition-all">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
                      <span key={idx} className={`text-[10px] font-black uppercase py-1 ${idx === 0 || idx === 6 ? 'text-muted-foreground/50' : 'text-muted-foreground/80'}`}>
                        {d}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: calFirstDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square" />
                    ))}
                    {Array.from({ length: calDaysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dayData = getItemsForDay(day);
                      const hasProj = dayData.projects.length > 0;
                      const hasTask = dayData.tasks.length > 0;
                      const isSelected = calSelectedDay === day;
                      
                      return (
                        <button
                          key={day}
                          onClick={() => setCalSelectedDay(isSelected ? null : day)}
                          className={`aspect-square relative rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all duration-300 ${
                            isSelected 
                              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105' 
                              : isCalToday(day)
                                ? 'border border-primary text-primary bg-primary/5 font-black' 
                                : 'hover:bg-muted/80 text-foreground'
                          }`}
                        >
                          <span>{day}</span>
                          {(hasProj || hasTask) && (
                            <span className="absolute bottom-1.5 flex gap-0.5 justify-center">
                              {hasProj && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-primary animate-ping'}`} />}
                              {hasTask && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-emerald-500'}`} />}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Dubai Live Clock & Details Panel */}
                <div className="card-nawi p-5 bg-gradient-to-br from-primary/5 via-transparent to-emerald-500/5 border border-border/80 shadow-md flex flex-col justify-between min-h-[300px]">
                  {calSelectedDay ? (
                    // Day Activity Details View
                    <div className="space-y-4 h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-border/50 pb-3">
                          <h4 className="text-xs font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Activity: {new Date(calYear, calMonth, calSelectedDay).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                          </h4>
                          <button 
                            onClick={() => setCalSelectedDay(null)}
                            className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground px-2 py-1 rounded transition-all"
                          >
                            Show Clock
                          </button>
                        </div>

                        <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1 mt-3 scrollbar-thin">
                          {getItemsForDay(calSelectedDay).projects.length === 0 && getItemsForDay(calSelectedDay).tasks.length === 0 ? (
                            <div className="text-center py-8 opacity-50">
                              <Sparkles className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                              <p className="text-xs font-bold text-muted-foreground">No operations recorded</p>
                              <p className="text-[9px] text-muted-foreground/60 mt-0.5">Perfect day to initiate new projects</p>
                            </div>
                          ) : (
                            <>
                              {getItemsForDay(calSelectedDay).projects.map(p => (
                                <div key={p.id} className="p-2.5 rounded-xl bg-primary/5 border border-primary/10 hover:scale-[1.01] transition-transform animate-fade-in">
                                  <span className="text-[8px] font-black bg-primary text-primary-foreground px-1.5 py-0.5 rounded uppercase tracking-widest">Project Launched</span>
                                  <p className="text-xs font-bold text-foreground mt-1.5">{p.title}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{p.description || 'No description'}</p>
                                </div>
                              ))}
                              {getItemsForDay(calSelectedDay).tasks.map(t => (
                                <div key={t.id} className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 hover:scale-[1.01] transition-transform animate-fade-in">
                                  <span className="text-[8px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded uppercase tracking-widest">Task Assigned</span>
                                  <p className="text-xs font-bold text-foreground mt-1.5">{t.name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">Project: {t.projectTitle}</p>
                                  <div className="flex items-center gap-1.5 mt-2">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase">{t.status}</span>
                                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-emerald-500" style={{ width: `${t.progress_percentage}%` }} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground/60 border-t border-border/50 pt-2 font-medium italic">
                        Visualizing operations from actual local database integrations.
                      </p>
                    </div>
                  ) : (
                    // Live Dubai Time Clock View
                    <div className="flex flex-col items-center justify-center text-center py-6">
                      <div className="relative mb-3 flex items-center justify-center">
                        <div className="absolute inset-0 w-16 h-16 bg-primary/10 rounded-full animate-ping opacity-25" />
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse">
                          <Clock className="w-6 h-6 text-white" />
                        </div>
                      </div>
                      
                      <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">Dubai Control Center</h4>
                      
                      {hh ? (
                        <div className="flex items-baseline justify-center gap-1 font-mono tracking-tight text-3xl font-black text-primary select-none">
                          <span className="drop-shadow-[0_0_8px_rgba(var(--primary),0.3)]">{hh}</span>
                          <span className={`transition-opacity duration-300 ${blinkColon ? 'opacity-100' : 'opacity-20'}`}>:</span>
                          <span className="drop-shadow-[0_0_8px_rgba(var(--primary),0.3)]">{mm}</span>
                          <span className={`transition-opacity duration-300 ${blinkColon ? 'opacity-100' : 'opacity-20'}`}>:</span>
                          <span className="text-secondary drop-shadow-[0_0_8px_rgba(var(--secondary),0.3)]">{ss}</span>
                          <span className="ml-2 text-[10px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase tracking-wider">{ampmStr}</span>
                        </div>
                      ) : (
                        <div className="h-9 flex items-center justify-center">
                          <span className="text-xs text-muted-foreground animate-pulse font-bold">Synchronizing Live Node...</span>
                        </div>
                      )}
                      
                      <p className="text-xs font-semibold text-muted-foreground mt-2">{dubaiDay}, {dubaiDate}</p>

                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider mt-5 select-none transition-all hover:bg-emerald-500/15">
                        <Globe className="w-3.5 h-3.5 text-emerald-500 animate-spin-slow" />
                        GST Timezone (UTC+4)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddProject && (
        <div className="fixed inset-0 bg-foreground/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-elevated p-6 animate-scale-in">
            <h3 className="text-xl font-bold font-display mb-4">Create Monitoring Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div><label className="block text-xs font-bold uppercase mb-1">Project Title *</label><input required value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} className="input-nawi" placeholder="e.g. Airline Integration" /></div>
              <div><label className="block text-xs font-bold uppercase mb-1">Description</label><textarea value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} className="input-nawi" rows={3} placeholder="Overall project goals..." /></div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddProject(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditProject && (
        <div className="fixed inset-0 bg-foreground/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-elevated p-6 animate-scale-in">
            <h3 className="text-xl font-bold font-display mb-4">Edit Monitoring Project</h3>
            <form onSubmit={handleUpdateProject} className="space-y-4">
              <div><label className="block text-xs font-bold uppercase mb-1">Project Title *</label><input required value={editProject.title} onChange={e => setEditProject({...editProject, title: e.target.value})} className="input-nawi" /></div>
              <div><label className="block text-xs font-bold uppercase mb-1">Description</label><textarea value={editProject.description} onChange={e => setEditProject({...editProject, description: e.target.value})} className="input-nawi" rows={3} /></div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowEditProject(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 bg-foreground/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl shadow-elevated p-6 animate-scale-in">
            <h3 className="text-xl font-bold font-display mb-4">Add Sub Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="space-y-4">
                <div><label className="block text-xs font-bold uppercase mb-1">Task Name *</label><input required value={newTask.name} onChange={e => setNewTask({...newTask, name: e.target.value})} className="input-nawi" /></div>
                <div><label className="block text-xs font-bold uppercase mb-1">Description</label><textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} className="input-nawi" rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddTask(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Add Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
