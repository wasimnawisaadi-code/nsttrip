import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { DSRTemplate, fetchAllTemplates, fetchAssignmentMap, setAssignments } from '@/lib/dsr-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function DSRTemplateAssignment() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<DSRTemplate[]>([]);
  const [employees, setEmployees] = useState<{ user_id: string; name: string; profile_type: string | null }[]>([]);
  const [assignments, setAssignmentsState] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [tpls, map, emps] = await Promise.all([
        fetchAllTemplates(),
        fetchAssignmentMap(),
        supabase.from('profiles').select('user_id, name, profile_type').eq('status', 'active').order('name'),
      ]);
      setTemplates(tpls);
      setEmployees((emps.data || []) as any);
      const obj: Record<string, Set<string>> = {};
      tpls.forEach(t => { obj[t.id] = new Set(map[t.id] || []); });
      setAssignmentsState(obj);
    })();
  }, [isAdmin]);

  if (!isAdmin) return <div className="p-6">Admin only</div>;

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
    setSaving(template.id);
    try {
      await setAssignments(template.id, Array.from(assignments[template.id] || []), user.id);
      toast.success(`Saved assignments for ${template.name}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">DSR Template Assignments</h1>
            <p className="text-sm text-muted-foreground">Assign daily report templates to your employees</p>
          </div>
        </div>
        <Button asChild variant="outline"><Link to="/admin/dsr">Back to DSR</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map(t => {
          const set = assignments[t.id] || new Set();
          return (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2"><span className="text-xl">{t.icon}</span>{t.name}</span>
                  <Badge variant="secondary"><Users className="h-3 w-3 mr-1" />{set.size}</Badge>
                </CardTitle>
                {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto space-y-2 mb-3">
                  {employees.length === 0 ? <p className="text-sm text-muted-foreground">No active employees</p> :
                    employees.map(emp => (
                      <label key={emp.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                        <Checkbox checked={set.has(emp.user_id)} onCheckedChange={() => toggle(t.id, emp.user_id)} />
                        <span className="text-sm flex-1">{emp.name}</span>
                        {emp.profile_type && <Badge variant="outline" className="text-xs">{emp.profile_type}</Badge>}
                      </label>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    setAssignmentsState(prev => ({ ...prev, [t.id]: new Set(employees.map(e => e.user_id)) }));
                  }}>Select All</Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    setAssignmentsState(prev => ({ ...prev, [t.id]: new Set() }));
                  }}>Clear</Button>
                  <Button size="sm" onClick={() => save(t)} disabled={saving === t.id}>
                    <Save className="h-3.5 w-3.5 mr-1" />{saving === t.id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
