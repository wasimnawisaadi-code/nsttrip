import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { DSRTemplate, fetchAllTemplates, fetchAssignmentMap, setAssignments } from '@/lib/dsr-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, Save, Users, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function DSRTemplateAssignment() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<DSRTemplate[]>([]);
  const [employees, setEmployees] = useState<{ user_id: string; name: string; profile_type: string | null }[]>([]);
  const [assignments, setAssignmentsState] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const [tpls, map, emps] = await Promise.all([
          fetchAllTemplates(),
          fetchAssignmentMap(),
          supabase.from('profiles').select('user_id, name, profile_type').eq('status', 'active').order('name'),
        ]);
        setTemplates(tpls);
        setEmployees((emps.data || []) as any);
        const obj: Record<string, Set<string>> = {};
        const exp: Record<string, boolean> = {};
        tpls.forEach(t => { 
          obj[t.id] = new Set(map[t.id] || []);
          exp[t.id] = false; // Default collapsed for production safety
        });
        setAssignmentsState(obj);
        setExpanded(exp);
      } catch (err: any) {
        toast.error("Failed to load templates: " + err.message);
      }
    })();
  }, [isAdmin]);

  if (!isAdmin) return <div className="p-6">Admin only</div>;

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const toggle = (templateId: string, empId: string) => {
    setAssignmentsState(prev => {
      const next = { ...prev };
      const s = new Set(next[templateId] || []);
      if (s.has(empId)) s.delete(empId); else s.add(empId);
      next[templateId] = s;
      return next;
    });
  };

  const save = async (template: DSRTemplate) => {
    if (!user) return;
    if (!template.id) {
      toast.error("Critical Error: Template ID is missing for " + template.name);
      return;
    }
    
    setSaving(template.id);
    try {
      const employeeIds = Array.from(assignments[template.id] || []);
      await setAssignments(template.id, employeeIds, user.id);
      toast.success(`Successfully assigned ${template.name} to ${employeeIds.length} employees`);
    } catch (e: any) { 
      console.error('Save failed:', e);
      toast.error(`Database Error: ${e.message || 'Could not update assignments'}`); 
    }
    finally { setSaving(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">DSR Template Assignments</h1>
            <p className="text-sm text-muted-foreground">Manage which employees see which reports</p>
          </div>
        </div>
        <Button asChild variant="outline"><Link to="/admin/dsr">Back to DSR</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map(t => {
          const set = assignments[t.id] || new Set();
          const isExp = expanded[t.id];
          return (
            <Card key={t.id} className={`transition-all duration-200 border-2 ${isExp ? 'border-primary/20 shadow-lg' : 'border-border hover:border-primary/10'}`}>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-4" onClick={() => toggleExpand(t.id)}>
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{t.icon}</span>
                    <div className="flex flex-col">
                      <span>{t.name}</span>
                      <span className="text-[10px] text-muted-foreground font-normal tracking-wider">{t.template_key}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={set.size > 0 ? "secondary" : "outline"} className="h-6">
                      <Users className="h-3 w-3 mr-1" />{set.size}
                    </Badge>
                    {isExp ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </CardTitle>
                {t.description && isExp && <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">{t.description}</p>}
              </CardHeader>
              
              {isExp && (
                <CardContent className="border-t border-border pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="max-h-72 overflow-y-auto space-y-1 mb-4 pr-1 scrollbar-nawi">
                    {employees.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground italic">
                        <AlertCircle className="w-5 h-5 mb-1 opacity-20" />
                        <p className="text-sm">No active employees found</p>
                      </div>
                    ) :
                      employees.map(emp => (
                        <label key={emp.user_id} className={`flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer ${set.has(emp.user_id) ? 'bg-primary/5 border border-primary/20 shadow-sm' : 'hover:bg-muted border border-transparent'}`}>
                          <Checkbox checked={set.has(emp.user_id)} onCheckedChange={() => toggle(t.id, emp.user_id)} />
                          <span className={`text-sm flex-1 ${set.has(emp.user_id) ? 'font-medium text-primary' : ''}`}>{emp.name}</span>
                          {emp.profile_type && <Badge variant="outline" className="text-[9px] uppercase tracking-tighter opacity-70">{emp.profile_type}</Badge>}
                        </label>
                      ))}
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="text-[11px] h-8 font-medium" onClick={(e) => {
                        e.stopPropagation();
                        setAssignmentsState(prev => ({ ...prev, [t.id]: new Set(employees.map(e => e.user_id)) }));
                      }}>Select All</Button>
                      <Button size="sm" variant="ghost" className="text-[11px] h-8 font-medium text-destructive hover:text-destructive hover:bg-destructive/5" onClick={(e) => {
                        e.stopPropagation();
                        setAssignmentsState(prev => ({ ...prev, [t.id]: new Set() }));
                      }}>Clear All</Button>
                    </div>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); save(t); }} disabled={saving === t.id} className="h-8 min-w-[80px]">
                      {saving === t.id ? (
                        <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Saving</>
                      ) : (
                        <><Save className="h-3.5 w-3.5 mr-1" /> Save</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
