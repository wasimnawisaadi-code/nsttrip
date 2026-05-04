import { useState, useEffect, useRef } from 'react';
import { Send, Users, X, Hash, User, Mic, Paperclip, Square, Play, Pause, FileText, Download, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

type Msg = any;

function AudioPlayer({ url, duration }: { url: string; duration?: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const toggle = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-background/20 hover:bg-background/30 flex items-center justify-center flex-shrink-0">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 h-1 bg-background/30 rounded-full overflow-hidden">
        <div className="h-full bg-current transition-all" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-[10px] tabular-nums opacity-80">{fmt(duration || 0)}</span>
      <audio
        ref={ref} src={url} preload="metadata"
        onTimeUpdate={(e) => { const a = e.currentTarget; setProgress((a.currentTime / (a.duration || 1)) * 100); }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
    </div>
  );
}

export default function TeamChat() {
  const { user, profile } = useAuth();
  const [activeChat, setActiveChat] = useState<string>('');
  const [activeChatType, setActiveChatType] = useState<'group' | 'direct'>('group');
  const [message, setMessage] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', members: [] as string[] });
  const [groups, setGroups] = useState<any[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [dmConversations, setDmConversations] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadUnread = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('chat_messages')
      .select('group_id, sender_id, message_type')
      .eq('is_read', false)
      .neq('sender_id', user.id);
    const counts: Record<string, number> = {};
    (data || []).forEach((m: any) => {
      const key = m.message_type === 'group' ? m.group_id : m.sender_id;
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    setUnreadCounts(counts);
  };
  useEffect(() => { loadUnread(); const i = setInterval(loadUnread, 15000); return () => clearInterval(i); }, [user]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('user_id, name, photo_url').eq('status', 'active');
      setAllUsers(data || []);
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchGroups = async () => {
      const { data } = await supabase
        .from('chat_groups')
        .select('*')
        .contains('members', [user.id])
        .order('created_at', { ascending: true });

      // Dedupe any accidental duplicate "General" rows — keep the OLDEST, delete the rest
      const generals = (data || []).filter((g) => g.name === 'General');
      let cleaned = data || [];
      if (generals.length > 1) {
        const keep = generals[0];
        const dupeIds = generals.slice(1).map((g) => g.id);
        await supabase.from('chat_groups').delete().in('id', dupeIds);
        cleaned = (data || []).filter((g) => !dupeIds.includes(g.id));
      }

      setGroups(cleaned);

      if (cleaned.length === 0 && allUsers.length > 0) {
        // Bootstrap a single shared General room (only if none exists in their view)
        const allUserIds = allUsers.map((u) => u.user_id);
        const { data: newGroup } = await supabase.from('chat_groups').insert([{
          name: 'General', members: allUserIds, created_by: user.id,
        }]).select().single();
        if (newGroup) {
          setGroups([newGroup]);
          setActiveChat(newGroup.id);
        }
      } else if (cleaned.length > 0 && !activeChat) {
        setActiveChat(cleaned[0].id);
      }
    };
    fetchGroups();
  }, [user, allUsers.length]);

  useEffect(() => {
    if (!activeChat || !user) return;
    const fetchMessages = async () => {
      let query = supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
      if (activeChatType === 'group') {
        query = query.eq('group_id', activeChat).eq('message_type', 'group' as any);
      } else {
        query = query.eq('message_type', 'direct' as any)
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${activeChat}),and(sender_id.eq.${activeChat},recipient_id.eq.${user.id})`);
      }
      const { data } = await query;
      setMessages(data || []);
      const toMark = (data || []).filter((m: any) => !m.is_read && m.sender_id !== user.id).map((m: any) => m.id);
      if (toMark.length > 0) {
        await supabase.from('chat_messages').update({ is_read: true }).in('id', toMark);
        loadUnread();
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-${activeChat}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any;
        if (activeChatType === 'group' && msg.group_id === activeChat) {
          setMessages(prev => [...prev, msg]);
        } else if (activeChatType === 'direct' &&
          ((msg.sender_id === user.id && msg.recipient_id === activeChat) ||
           (msg.sender_id === activeChat && msg.recipient_id === user.id))) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const oldMsg = payload.old as any;
        setMessages(prev => prev.filter(m => m.id !== oldMsg.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat, activeChatType, user]);

  useEffect(() => {
    if (!user) return;
    const fetchDMs = async () => {
      const { data } = await supabase.from('chat_messages').select('sender_id, recipient_id')
        .eq('message_type', 'direct' as any)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
      const others = new Set<string>();
      (data || []).forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (otherId) others.add(otherId);
      });
      setDmConversations(Array.from(others));
    };
    fetchDMs();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchDMs = async () => {
      const { data } = await supabase.from('chat_messages').select('sender_id, recipient_id')
        .eq('message_type', 'direct' as any)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
      const others = new Set<string>();
      (data || []).forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (otherId) others.add(otherId);
      });
      setDmConversations(Array.from(others));
    };
    fetchDMs();
  }, [user]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const buildBaseMsg = () => {
    const base: any = {
      sender_id: user!.id, sender_name: profile!.name, sender_photo: profile!.photo_url,
      message_type: activeChatType,
    };
    if (activeChatType === 'group') base.group_id = activeChat; else base.recipient_id = activeChat;
    return base;
  };

  const pushNotif = async (preview: string) => {
    if (activeChatType === 'group') {
      const group = groups.find(g => g.id === activeChat);
      const recipients = (group?.members || []).filter((m: string) => m !== user!.id);
      const notifs = recipients.map((memberId: string) => ({
        user_id: memberId, title: `New message in ${group?.name}`,
        message: `${profile!.name}: ${preview.slice(0, 80)}`, type: 'chat',
      }));
      if (notifs.length > 0) await supabase.from('notifications').insert(notifs);
    } else {
      await supabase.from('notifications').insert([{
        user_id: activeChat, title: `New message from ${profile!.name}`,
        message: preview.slice(0, 80), type: 'chat',
      }]);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !user || !profile) return;
    const msg = { ...buildBaseMsg(), text: message.trim() };
    await supabase.from('chat_messages').insert([msg]);
    await pushNotif(message.trim());
    setMessage('');
  };

  const uploadToBucket = async (blob: Blob, filename: string) => {
    const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
    const path = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('chat-media').upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
      recChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        const duration = Math.round((Date.now() - recStartRef.current) / 1000);
        setRecording(false); setRecordSeconds(0);
        const blob = new Blob(recChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 500) return;
        try {
          setUploading(true);
          const url = await uploadToBucket(blob, 'voice.webm');
          await supabase.from('chat_messages').insert([{
            ...buildBaseMsg(), text: '',
            attachment_url: url, attachment_type: 'audio', attachment_name: 'Voice message', attachment_duration: duration,
          }]);
          await pushNotif('🎤 Voice message');
        } catch (e: any) {
          toast.error('Upload failed: ' + e.message);
        } finally { setUploading(false); }
      };
      recRef.current = mr;
      recStartRef.current = Date.now();
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      recTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (e: any) {
      toast.error('Microphone permission denied');
    }
  };

  const stopRecording = (cancel = false) => {
    if (!recRef.current) return;
    if (cancel) { recChunksRef.current = []; }
    recRef.current.stop();
    recRef.current = null;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !user || !profile) return;
    if (file.size > 25 * 1024 * 1024) { toast.error('Max 25MB'); return; }
    try {
      setUploading(true);
      const url = await uploadToBucket(file, file.name);
      await supabase.from('chat_messages').insert([{
        ...buildBaseMsg(), text: '',
        attachment_url: url, attachment_type: 'file', attachment_name: file.name,
      }]);
      await pushNotif(`📎 ${file.name}`);
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally { setUploading(false); }
  };

  const deleteMessage = async (msg: any) => {
    if (msg.sender_id !== user?.id) { toast.error('You can only delete your own messages'); return; }
    if (!confirm('Delete this message? This cannot be undone.')) return;
    const { error } = await supabase.from('chat_messages').delete().eq('id', msg.id);
    if (error) { toast.error(error.message); return; }
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    toast.success('Message deleted');
  };

  const deleteGroup = async (group: any) => {
    if (group.created_by !== user?.id) { toast.error('Only the group creator can delete it'); return; }
    if (group.name === 'General') { toast.error('The General group cannot be deleted'); return; }
    if (!confirm(`Delete group "${group.name}"? All messages will be lost.`)) return;
    await supabase.from('chat_messages').delete().eq('group_id', group.id);
    const { error } = await supabase.from('chat_groups').delete().eq('id', group.id);
    if (error) { toast.error(error.message); return; }
    setGroups(prev => prev.filter(g => g.id !== group.id));
    if (activeChat === group.id) {
      const remaining = groups.filter(g => g.id !== group.id);
      if (remaining.length > 0) { setActiveChat(remaining[0].id); setActiveChatType('group'); }
      else setActiveChat('');
    }
    toast.success('Group deleted');
  };

  const createGroup = async () => {
    if (!groupForm.name.trim() || !user) return;
    const { data } = await supabase.from('chat_groups').insert([{
      name: groupForm.name, members: [...groupForm.members, user.id], created_by: user.id,
    }]).select().single();
    if (data) {
      setGroups(prev => [...prev, data]); setActiveChat(data.id); setActiveChatType('group');
    }
    setShowNewGroup(false); setGroupForm({ name: '', members: [] });
  };

  const startDM = (userId: string) => {
    setActiveChat(userId); setActiveChatType('direct'); setShowNewDM(false);
    if (!dmConversations.includes(userId)) setDmConversations(prev => [...prev, userId]);
  };

  const getActiveName = () => activeChatType === 'group'
    ? (groups.find(g => g.id === activeChat)?.name || 'General')
    : (allUsers.find(u => u.user_id === activeChat)?.name || 'Chat');

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const formatDay = (ts: string) => {
    const d = new Date(ts); const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const y = new Date(today); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-background rounded-xl border border-border overflow-hidden animate-fade-in relative">
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-background border-r border-border flex flex-col transition-transform duration-200 lg:static lg:translate-x-0
        ${mobileSidebar ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-3 border-b border-border flex items-center justify-between lg:hidden">
          <h3 className="font-semibold font-display text-sm">Messages</h3>
          <button onClick={() => setMobileSidebar(false)} className="p-1.5 hover:bg-muted rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 border-b border-border hidden lg:flex items-center justify-between">
          <h3 className="font-semibold font-display text-sm">Messages</h3>
          <div className="flex gap-1">
            <button onClick={() => setShowNewGroup(true)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="New Group"><Users className="w-4 h-4" /></button>
            <button onClick={() => setShowNewDM(true)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="New DM"><User className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Groups</p>
            {groups.map((g: any) => {
              const unread = unreadCounts[g.id] || 0;
              const isActive = activeChat === g.id && activeChatType === 'group';
              const canDelete = g.created_by === user?.id && g.name !== 'General';
              return (
                <div key={g.id} className={`group/grp w-full flex items-center gap-1 rounded-lg pr-1 transition-colors ${isActive ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                  <button onClick={() => { setActiveChat(g.id); setActiveChatType('group'); setMobileSidebar(false); }}
                    className={`flex-1 text-left px-3 py-2 text-sm flex items-center gap-2 ${isActive ? 'text-primary font-medium' : 'text-foreground'}`}>
                    <Hash className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate flex-1">{g.name}</span>
                    {unread > 0 && !isActive && <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>}
                  </button>
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteGroup(g); }}
                      title="Delete group"
                      className="opacity-0 group-hover/grp:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Direct Messages</p>
            {dmConversations.map((userId) => {
              const u = allUsers.find(au => au.user_id === userId);
              if (!u) return null;
              const unread = unreadCounts[userId] || 0;
              const isActive = activeChat === userId && activeChatType === 'direct';
              return (
                <button key={userId} onClick={() => { startDM(userId); setMobileSidebar(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}>
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[8px] font-bold text-secondary-foreground">
                      {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <span className="truncate flex-1">{u.name}</span>
                  {unread > 0 && !isActive && <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <button onClick={() => setMobileSidebar(true)} className="lg:hidden p-1.5 -ml-1 hover:bg-muted rounded-lg text-muted-foreground"><Users className="w-5 h-5" /></button>
          {activeChatType === 'group' ? <Hash className="w-5 h-5 text-muted-foreground" /> : <User className="w-5 h-5 text-muted-foreground" />}
          <h3 className="font-semibold text-sm">{getActiveName()}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-16">No messages yet. Start the conversation!</p>
          )}
          {messages.map((msg: any, i: number) => {
            const isMe = msg.sender_id === user?.id;
            const showDate = i === 0 || formatDay(messages[i - 1].created_at) !== formatDay(msg.created_at);
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="text-center my-4"><span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{formatDay(msg.created_at)}</span></div>
                )}
                <div className={`group/msg flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    msg.sender_photo ? (
                      <img src={msg.sender_photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-secondary-foreground flex-shrink-0">
                        {msg.sender_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )
                  )}
                  {isMe && (
                    <button
                      onClick={() => deleteMessage(msg)}
                      title="Unsend / delete"
                      className="opacity-0 group-hover/msg:opacity-100 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity self-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className={`max-w-[70%] ${isMe ? 'order-first' : ''}`}>
                    {!isMe && <p className="text-xs text-muted-foreground mb-1 ml-1">{msg.sender_name}</p>}
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
                      {msg.attachment_type === 'audio' && msg.attachment_url ? (
                        <AudioPlayer url={msg.attachment_url} duration={msg.attachment_duration} />
                      ) : msg.attachment_type === 'file' && msg.attachment_url ? (
                        <a href={msg.attachment_url} target="_blank" rel="noopener" download className="flex items-center gap-2 min-w-[180px] hover:opacity-80">
                          <FileText className="w-5 h-5 flex-shrink-0" />
                          <span className="truncate text-sm flex-1">{msg.attachment_name || 'File'}</span>
                          <Download className="w-4 h-4 opacity-70" />
                        </a>
                      ) : (
                        msg.text
                      )}
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-border">
          {recording ? (
            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2">
              <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
              <span className="text-sm font-mono text-destructive">Recording {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
              <span className="flex-1" />
              <button onClick={() => stopRecording(true)} className="p-1.5 hover:bg-destructive/20 rounded-lg text-destructive" title="Cancel"><Trash2 className="w-4 h-4" /></button>
              <button onClick={() => stopRecording(false)} className="btn-primary text-sm px-3 py-1.5"><Square className="w-3.5 h-3.5" /> Send</button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="Attach file">
                <Paperclip className="w-4 h-4" />
              </button>
              <button onClick={startRecording} disabled={uploading} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="Voice message">
                <Mic className="w-4 h-4" />
              </button>
              <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                className="input-nawi flex-1" placeholder={uploading ? 'Uploading…' : `Message ${getActiveName()}...`} disabled={uploading} />
              <button onClick={sendMessage} disabled={uploading || !message.trim()} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      </div>

      {showNewGroup && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewGroup(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Create Group</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Group Name *</label><input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} className="input-nawi" /></div>
              <div>
                <label className="block text-sm font-medium mb-2">Members</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allUsers.filter(u => u.user_id !== user?.id).map((u) => (
                    <label key={u.user_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg cursor-pointer">
                      <input type="checkbox" checked={groupForm.members.includes(u.user_id)} onChange={(e) => {
                        setGroupForm({ ...groupForm, members: e.target.checked ? [...groupForm.members, u.user_id] : groupForm.members.filter(m => m !== u.user_id) });
                      }} className="w-4 h-4 rounded" />
                      <span className="text-sm">{u.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowNewGroup(false)} className="btn-outline">Cancel</button>
                <button onClick={createGroup} className="btn-primary">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewDM && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewDM(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">New Message</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allUsers.filter(u => u.user_id !== user?.id).map((u) => (
                <button key={u.user_id} onClick={() => startDM(u.user_id)} className="w-full text-left p-3 hover:bg-muted rounded-lg flex items-center gap-3 transition-colors">
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <span className="text-sm font-medium">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
