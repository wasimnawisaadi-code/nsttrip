import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  Plus, Search, LayoutGrid, List, MoreVertical, 
  Clock, CheckCircle2, AlertCircle, FileText, 
  MessageSquare, UserPlus, Calendar, BarChart3,
  TrendingUp, CheckSquare, Target, Paperclip
} from 'lucide-react';
import { formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';

export default function ProjectMonitoring() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProject, setShowAddProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [newProject, setNewProject] = useState({ title: '', description: '' });
  const [newTask, setNewTask] = useState({
    name: '', description: '', assigned_to: '', 
    start_date: new Date().toISOString().split('T')[0],
    deadline: '', status: 'To Do', progress_percentage: 0
  });

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
    const { data } = await supabase.from('monitoring_tasks').insert([{
      ...newTask,
      project_id: selectedProject.id
    }]).select();
    if (data) {
      setShowAddTask(false);
      setNewTask({ name: '', description: '', assigned_to: '', start_date: new Date().toISOString().split('T')[0], deadline: '', status: 'To Do', progress_percentage: 0 });
      loadData();
    }
  };

  const updateTaskProgress = async (taskId: string, progress: number) => {
    const status = progress === 100 ? 'Completed' : progress > 0 ? 'In Progress' : 'To Do';
    await supabase.from('monitoring_tasks').update({ progress_percentage: progress, status }).eq('id', taskId);
    loadData();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display">Project Monitoring</h2>
          <p className="text-sm text-muted-foreground">Track enterprise integrations and development progress</p>
        </div>
        <button onClick={() => setShowAddProject(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Create New Project
        </button>
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
                className={`card-nawi cursor-pointer transition-all border-l-4 ${selectedProject?.id === p.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-transparent hover:border-muted'}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-sm truncate">{p.title}</h4>
                  <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded uppercase tracking-tighter">{p.tasks.length} Tasks</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mb-3">{p.description || 'No description'}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-muted-foreground">COMPLETION</span>
                    <span className="text-primary">{p.totalProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${p.totalProgress}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {selectedProject ? (
            <div className="card-nawi p-6 animate-slide-up">
              <div className="flex justify-between items-start mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-xl font-bold font-display">{selectedProject.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{selectedProject.description}</p>
                </div>
                <button onClick={() => setShowAddTask(true)} className="btn-outline text-xs">
                  <Plus className="w-3.5 h-3.5" /> Add Sub Task
                </button>
              </div>

              {/* Progress Analytics Bar */}
              <div className="grid grid-cols-3 gap-4 mb-8 bg-muted/30 p-4 rounded-2xl border border-dashed">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mb-1">To Do</p>
                  <p className="text-lg font-bold text-muted-foreground">{selectedProject.tasks.filter((t: any) => t.status === 'Pending' || t.status === 'To Do').length}</p>
                </div>
                <div className="text-center border-x border-border/50">
                  <p className="text-[10px] text-primary uppercase font-bold mb-1">In Progress</p>
                  <p className="text-lg font-bold text-primary">{selectedProject.tasks.filter((t: any) => t.status === 'In Progress').length}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-success uppercase font-bold mb-1">Completed</p>
                  <p className="text-lg font-bold text-success">{selectedProject.tasks.filter((t: any) => t.status === 'Completed').length}</p>
                </div>
              </div>

              <div className="space-y-4">
                {selectedProject.tasks.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-xl opacity-50">
                    <CheckSquare className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No tasks added yet. Start by adding a sub-task.</p>
                  </div>
                ) : (
                  selectedProject.tasks.map((t: any) => (
                    <div key={t.id} className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-sm">{t.name}</h5>
                          <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <UserPlus className="w-3 h-3" />
                          <span className="font-medium">{employees.find(e => e.user_id === t.assigned_to)?.name || 'Unassigned'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span className="font-medium">Due: {t.deadline ? formatDate(t.deadline) : 'No date'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <BarChart3 className="w-3 h-3" />
                          <span className="font-medium">Progress: {t.progress_percentage}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                           <Paperclip className="w-3 h-3" />
                           <span className="font-medium cursor-pointer hover:text-primary">Upload Files</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="1"
                          value={t.progress_percentage}
                          onChange={(e) => updateTaskProgress(t.id, parseInt(e.target.value))}
                          className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <span className="text-xs font-bold text-primary min-w-[30px]">{t.progress_percentage}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center card-nawi border-dashed opacity-50">
              <LayoutGrid className="w-12 h-12 mb-4 text-muted-foreground" />
              <p className="font-medium">Select a project to view detailed monitoring</p>
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

      {showAddTask && (
        <div className="fixed inset-0 bg-foreground/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-lg rounded-2xl shadow-elevated p-6 animate-scale-in">
            <h3 className="text-xl font-bold font-display mb-4">Add Sub Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-bold uppercase mb-1">Task Name *</label><input required value={newTask.name} onChange={e => setNewTask({...newTask, name: e.target.value})} className="input-nawi" /></div>
                <div className="col-span-2"><label className="block text-xs font-bold uppercase mb-1">Description</label><textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} className="input-nawi" rows={2} /></div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Assigned To</label>
                  <select value={newTask.assigned_to} onChange={e => setNewTask({...newTask, assigned_to: e.target.value})} className="input-nawi">
                    <option value="">Select Employee</option>
                    {employees.map(emp => <option key={emp.user_id} value={emp.user_id}>{emp.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-bold uppercase mb-1">Deadline</label><input type="date" value={newTask.deadline} onChange={e => setNewTask({...newTask, deadline: e.target.value})} className="input-nawi" /></div>
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
