import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import AnimatedButton from '../ui/AnimatedButton';

interface FAQ {
  id: string;
  section_name: string;
  question: string;
  answer: string;
  video_url: string;
  order_index: number;
}

interface SupportMessage {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
  replied_at: string | null;
  reply_text: string | null;
}

// One stored reply in a conversation thread (support_message_replies,
// migration 20261115000012). author is 'admin' for panel replies; 'user'
// is reserved for sender follow-ups if they are ever imported.
interface SupportReply {
  id: string;
  message_id: string;
  author: string;
  body: string;
  created_at: string;
}

// One entry in a conversation timeline: either a message from the
// sender (kind 'user') or an admin reply (kind 'admin').
interface TimelineEntry {
  key: string;
  kind: 'user' | 'admin';
  body: string;
  created_at: string;
  messageId: string;
  subject: string | null;
}

// All messages from one sender email, merged with the admin replies
// into a single chronological thread.
interface Conversation {
  key: string;
  name: string;
  email: string;
  firstSubject: string | null;
  messages: SupportMessage[];
  timeline: TimelineEntry[];
  lastActivity: string;
  unreadCount: number;
}

export default function HelpCenterManager() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [existingSections, setExistingSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Messages inbox state (support_messages table, migration
  // 20261115000010). inboxReady=false means the table is not there yet -
  // the section then shows a short note instead of failing.
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [inboxReady, setInboxReady] = useState(true);

  // Conversation state: admin replies live in support_message_replies
  // (migration 20261115000012). repliesReady=false means that table is
  // not there yet - timelines then fall back to the replied_at /
  // reply_text stamp on each message row.
  const [replies, setReplies] = useState<SupportReply[]>([]);
  const [repliesReady, setRepliesReady] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [messageSearch, setMessageSearch] = useState('');

  // Reply composer state: one composer open at a time, keyed by
  // conversation (sender email); sendingKey drives the busy state.
  const [replyingKey, setReplyingKey] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [orderIndex, setOrderIndex] = useState('0');

  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_faqs')
        .select('*')
        .order('section_name', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      
      const fetchedFaqs = data || [];
      setFaqs(fetchedFaqs);
      
      // Extract unique section names for quick-select chips
      const sections = Array.from(new Set(fetchedFaqs.map(f => f.section_name)));
      setExistingSections(sections as string[]);
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchFaqs();
    })();
  }, [fetchFaqs]);

  const fetchMessages = useCallback(async () => {
    try {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMessages(data || []);
      setInboxReady(true);
    } catch {
      // Table missing (migration not run yet) or unreadable: fail soft.
      setMessages([]);
      setInboxReady(false);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const fetchReplies = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('support_message_replies')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setReplies(data || []);
      setRepliesReady(true);
    } catch {
      // Replies table missing (migration 12 not run yet): fail soft -
      // timelines fall back to each message's reply stamp.
      setReplies([]);
      setRepliesReady(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await fetchMessages();
      await fetchReplies();
    })();
  }, [fetchMessages, fetchReplies]);

  const unreadCount = messages.filter((m) => !m.is_read).length;

  // Mark read/unread applies to the whole conversation at once, so the
  // thread's unread badge and the section badge stay in step.
  const handleToggleConversationRead = async (conversation: Conversation) => {
    const markRead = conversation.unreadCount > 0;
    const ids = conversation.messages.map((m) => m.id);
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({ is_read: markRead })
        .in('id', ids);
      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (ids.includes(m.id) ? { ...m, is_read: markRead } : m))
      );
    } catch (error: any) {
      Alert.alert('Update Failed', error.message);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const confirmDelete = () => executeDeleteMessage(id);

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this message?')) confirmDelete();
    } else {
      Alert.alert('Delete', 'Delete this message?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDeleteMessage = async (id: string) => {
    try {
      const { error } = await supabase.from('support_messages').delete().eq('id', id);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      // The database cascades the delete to the message's replies;
      // mirror that locally.
      setReplies((prev) => prev.filter((r) => r.message_id !== id));
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const handleOpenReply = (key: string) => {
    setReplyingKey(key);
    setReplyDraft('');
  };

  const handleCancelReply = () => {
    setReplyingKey(null);
    setReplyDraft('');
  };

  // Sends a conversation reply through the send-support-email Edge
  // Function, which mails it via the owner's own SMTP
  // (From: noreply@englishforcricket.com). The reply is recorded ONLY
  // after the email has actually gone out: a row in
  // support_message_replies (so the thread can hold many replies) plus
  // the replied_at / reply_text stamp on the latest message row, which
  // keeps the latest-reply markers working. If the replies table is not
  // there yet (migration 12 pending) the stamp alone is written - the
  // timeline renders stamped replies too, so nothing is lost. A failed
  // send leaves everything untouched (and the draft open) so the admin
  // can retry or fall back to their email app.
  const handleSendReply = async (conversation: Conversation) => {
    const text = replyDraft.trim();
    if (!text || sendingKey) return;

    const latest = conversation.messages[conversation.messages.length - 1];
    setSendingKey(conversation.key);
    let emailSent = false;
    try {
      const { error: invokeError } = await supabase.functions.invoke('send-support-email', {
        body: {
          mode: 'reply',
          to: latest.email,
          subject: 'Re: ' + (latest.subject || 'Your support message'),
          message: text,
        },
      });
      if (invokeError) throw invokeError;
      emailSent = true;

      const repliedAt = new Date().toISOString();

      // Record the reply in the thread table (best effort - the table
      // may not exist until migration 12 is run).
      let storedReply: SupportReply | null = null;
      const { data: inserted, error: insertError } = await supabase
        .from('support_message_replies')
        .insert([{ message_id: latest.id, author: 'admin', body: text }])
        .select()
        .single();
      if (!insertError && inserted) {
        storedReply = inserted as SupportReply;
        setRepliesReady(true);
      }

      // Stamp the latest message row (latest-reply marker + read).
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({ replied_at: repliedAt, reply_text: text, is_read: true })
        .eq('id', latest.id);
      const stamped = !updateError;

      const replyRow = storedReply;
      if (replyRow) {
        setReplies((prev) => [...prev, replyRow]);
      }
      if (stamped) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === latest.id ? { ...m, replied_at: repliedAt, reply_text: text, is_read: true } : m
          )
        );
      }
      setReplyingKey(null);
      setReplyDraft('');

      if (replyRow && stamped) {
        Alert.alert('Reply Sent', `Your reply was emailed to ${latest.email}.`);
      } else if (stamped) {
        // Email sent and stamped, but the thread table is missing: the
        // reply still shows in the timeline via the stamp.
        Alert.alert(
          'Reply Sent',
          `Your reply was emailed to ${latest.email} and saved. Full conversation history is kept once the latest database step (migration 12) is run.`
        );
      } else {
        // The email went out but the inbox record could not be updated.
        Alert.alert(
          'Reply Sent',
          'The reply email was sent, but saving the reply record failed. The inbox will refresh now.'
        );
        await fetchMessages();
        await fetchReplies();
      }
    } catch {
      if (emailSent) {
        // The email went out but recording it failed unexpectedly:
        // refresh rather than inviting a duplicate send.
        Alert.alert(
          'Reply Sent',
          'The reply email was sent, but saving the reply record failed. The inbox will refresh now.'
        );
        setReplyingKey(null);
        setReplyDraft('');
        await fetchMessages();
        await fetchReplies();
      } else {
        Alert.alert(
          'Reply Not Sent',
          'The reply email could not be sent - the email service may not be set up yet. ' +
            'The conversation is safe in this inbox; you can try again later or reply via your email app.'
        );
      }
    } finally {
      setSendingKey(null);
    }
  };

  const handleSave = async () => {
    if (!sectionName.trim() || !question.trim() || !answer.trim()) {
      Alert.alert('Missing Fields', 'Section, Question, and Answer are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        section_name: sectionName.trim(),
        question: question.trim(),
        answer: answer.trim(),
        video_url: videoUrl.trim(),
        order_index: parseInt(orderIndex) || 0,
      };

      if (editId) {
        const { error } = await supabase.from('support_faqs').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('support_faqs').insert([payload]);
        if (error) throw error;
      }

      cancelEdit();
      await fetchFaqs();
    } catch (error: any) {
      Alert.alert('Save Failed', error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (faq: FAQ) => {
    setEditId(faq.id);
    setSectionName(faq.section_name);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setVideoUrl(faq.video_url || '');
    setOrderIndex(faq.order_index?.toString() || '0');
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = () => executeDelete(id);

    if (Platform.OS === 'web') {
      if (window.confirm('Delete this support question?')) confirmDelete();
    } else {
      Alert.alert('Delete', 'Delete this support question?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('support_faqs').delete().eq('id', id);
      if (error) throw error;
      await fetchFaqs();
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setSectionName('');
    setQuestion('');
    setAnswer('');
    setVideoUrl('');
    setOrderIndex('0');
  };

  // ---- Conversations ---------------------------------------------------
  // Group messages by sender email and merge in the admin replies to
  // build one chronological thread per sender.
  const repliesByMessageId = new Map<string, SupportReply[]>();
  replies.forEach((r) => {
    const list = repliesByMessageId.get(r.message_id) || [];
    list.push(r);
    repliesByMessageId.set(r.message_id, list);
  });

  const conversationMap = new Map<string, SupportMessage[]>();
  messages.forEach((m) => {
    const key = m.email.trim().toLowerCase();
    const list = conversationMap.get(key) || [];
    list.push(m);
    conversationMap.set(key, list);
  });

  const conversations: Conversation[] = Array.from(conversationMap.entries())
    .map(([key, msgs]) => {
      const sorted = [...msgs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const entries: TimelineEntry[] = [];
      sorted.forEach((m) => {
        entries.push({
          key: `msg-${m.id}`,
          kind: 'user',
          body: m.message,
          created_at: m.created_at,
          messageId: m.id,
          subject: m.subject,
        });
        const threadReplies = repliesByMessageId.get(m.id) || [];
        threadReplies.forEach((r) => {
          entries.push({
            key: `reply-${r.id}`,
            kind: 'admin',
            body: r.body,
            created_at: r.created_at,
            messageId: m.id,
            subject: null,
          });
        });
        // Replies sent before the thread table existed only live in the
        // row stamp - surface them too (unless the same text is already
        // stored as a thread reply, which the current send flow writes).
        if (m.reply_text && m.replied_at && !threadReplies.some((r) => r.body === m.reply_text)) {
          entries.push({
            key: `stamp-${m.id}`,
            kind: 'admin',
            body: m.reply_text,
            created_at: m.replied_at,
            messageId: m.id,
            subject: null,
          });
        }
      });
      // True chronological order across the whole thread (a reply to an
      // earlier message can postdate a newer message); insertion order
      // breaks ties so a message always precedes its same-time replies.
      const timeline = entries
        .map((entry, seq) => ({ entry, seq }))
        .sort((a, b) => {
          const diff = new Date(a.entry.created_at).getTime() - new Date(b.entry.created_at).getTime();
          return diff !== 0 ? diff : a.seq - b.seq;
        })
        .map(({ entry }) => entry);
      const latest = sorted[sorted.length - 1];
      return {
        key,
        name: latest.name,
        email: latest.email,
        firstSubject: sorted[0].subject,
        messages: sorted,
        timeline,
        lastActivity: timeline.length > 0 ? timeline[timeline.length - 1].created_at : latest.created_at,
        unreadCount: sorted.filter((m) => !m.is_read).length,
      };
    })
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

  const searchTerm = messageSearch.trim().toLowerCase();
  const isSearching = searchTerm.length > 0;
  const visibleConversations = isSearching
    ? conversations.filter((c) => {
        if (c.name.toLowerCase().includes(searchTerm)) return true;
        if (c.email.toLowerCase().includes(searchTerm)) return true;
        if (c.key.includes(searchTerm)) return true;
        return c.timeline.some(
          (e) =>
            e.body.toLowerCase().includes(searchTerm) ||
            (e.subject ? e.subject.toLowerCase().includes(searchTerm) : false)
        );
      })
    : conversations;

  const toggleConversation = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="font-display text-3xl font-semibold text-navy">Help Center & FAQ Manager</Text>
      </View>

      {/* Messages Inbox - contact-form submissions from the Support page,
          stored in the database (support_messages) and grouped into one
          conversation thread per sender. Replies are written here,
          stored in support_message_replies, and emailed via the
          send-support-email Edge Function (owner's SMTP) once that
          function is deployed. */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        <View className="flex-row items-center gap-3 p-4 border-b border-inkline">
          <Text className="font-display text-xl font-semibold text-navy">📩 Messages</Text>
          {inboxReady && unreadCount > 0 && (
            <Text className="text-xs bg-gold text-navy px-2 py-0.5 rounded-full font-bold">
              {unreadCount} unread
            </Text>
          )}
        </View>
        {inboxReady && !messagesLoading && messages.length > 0 && (
          <View className="flex-row items-center gap-3 px-4 py-3 border-b border-inkline bg-canvas">
            <TextInput
              className="flex-1 bg-white px-4 py-2.5 rounded-xl border border-inkline"
              placeholder="Search by name, email, subject or message text..."
              value={messageSearch}
              onChangeText={setMessageSearch}
              autoCapitalize="none"
            />
            {isSearching && (
              <Pressable onPress={() => setMessageSearch('')} className="px-3 py-2 bg-slate-100 rounded-full border border-inkline">
                <Text className="text-sm font-semibold text-slate-600">Clear</Text>
              </Pressable>
            )}
          </View>
        )}
        {!inboxReady ? (
          <View className="p-6">
            <Text className="text-slate-500">
              Message inbox is not set up yet - the database step for the contact form is still pending.
              The FAQ manager below works as normal.
            </Text>
          </View>
        ) : messagesLoading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : messages.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No messages yet. New contact-form submissions will appear here.</Text>
          </View>
        ) : visibleConversations.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No conversations match your search.</Text>
          </View>
        ) : (
          visibleConversations.map((conversation, index) => {
            const expanded = isSearching || expandedKeys.includes(conversation.key);
            const sending = sendingKey === conversation.key;
            const composerOpen = replyingKey === conversation.key;
            return (
              <View
                key={conversation.key}
                className={`${index !== visibleConversations.length - 1 ? 'border-b border-inkline' : ''} ${conversation.unreadCount > 0 ? 'bg-gold-light/40' : ''}`}
              >
                <Pressable
                  onPress={() => toggleConversation(conversation.key)}
                  className="flex-row items-start justify-between gap-3 p-4"
                >
                  <View className="flex-1 pr-2">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className={`text-base text-text-primary ${conversation.unreadCount > 0 ? 'font-extrabold' : 'font-bold'}`}>
                        {conversation.name}
                      </Text>
                      <Text className="text-sm text-navy font-semibold">{conversation.email}</Text>
                      {conversation.unreadCount > 0 && (
                        <Text className="text-xs bg-gold text-navy px-2 py-0.5 rounded-full font-bold">
                          {conversation.unreadCount} unread
                        </Text>
                      )}
                    </View>
                    {conversation.firstSubject ? (
                      <Text className="text-sm font-semibold text-text-primary mt-0.5">{conversation.firstSubject}</Text>
                    ) : null}
                    <Text className="text-xs text-slate-400 mt-0.5">
                      {conversation.timeline.length} {conversation.timeline.length === 1 ? 'entry' : 'entries'} · Last activity {new Date(conversation.lastActivity).toLocaleString()}
                    </Text>
                  </View>
                  <Text className="text-slate-400 font-bold mt-1">{expanded ? '▲' : '▼'}</Text>
                </Pressable>

                {expanded && (
                  <View className="px-4 pb-4">
                    <View className="gap-3">
                      {conversation.timeline.map((entry) =>
                        entry.kind === 'user' ? (
                          <View key={entry.key} className="self-start max-w-[85%] bg-white border border-inkline rounded-2xl px-3 py-2.5">
                            <Text className="text-xs font-bold text-text-secondary mb-1">
                              {conversation.name} · {new Date(entry.created_at).toLocaleString()}
                            </Text>
                            {entry.subject ? (
                              <Text className="text-sm font-bold text-text-primary mb-1">{entry.subject}</Text>
                            ) : null}
                            <Text className="text-sm text-slate-600">{entry.body}</Text>
                            <View className="flex-row justify-end mt-2">
                              <Pressable onPress={() => handleDeleteMessage(entry.messageId)}>
                                <Text className="text-xs font-semibold text-red-500">Delete message</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : (
                          <View key={entry.key} className="self-end max-w-[85%] bg-navy rounded-2xl px-3 py-2.5">
                            <Text className="text-xs font-bold text-slate-300 mb-1">
                              You (noreply@englishforcricket.com) · {new Date(entry.created_at).toLocaleString()}
                            </Text>
                            <Text className="text-sm text-white">{entry.body}</Text>
                          </View>
                        )
                      )}
                    </View>

                    {!repliesReady && (
                      <Text className="text-xs text-slate-400 mt-3">
                        Full reply history is kept once the latest database step (migration 12) is run; until then only the latest reply per message is shown.
                      </Text>
                    )}

                    <View className="flex-row items-center gap-3 mt-4 flex-wrap">
                      <Pressable
                        onPress={() => (composerOpen ? handleCancelReply() : handleOpenReply(conversation.key))}
                        className="px-3 py-1.5 bg-navy rounded-full border border-navy"
                      >
                        <Text className="text-white text-sm font-semibold">Reply in panel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleToggleConversationRead(conversation)}
                        className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline"
                      >
                        <Text className="text-text-secondary text-sm font-semibold">
                          {conversation.unreadCount > 0 ? 'Mark all read' : 'Mark all unread'}
                        </Text>
                      </Pressable>
                      <Pressable onPress={() => Linking.openURL(`mailto:${conversation.email}`)}>
                        <Text className="text-xs text-slate-400 font-semibold">or reply via your email app</Text>
                      </Pressable>
                    </View>

                    {composerOpen && (
                      <View className="mt-4 bg-canvas border border-inkline rounded-xl p-4">
                        <Text className="text-sm font-semibold text-text-secondary mb-2">
                          Reply to {conversation.name} ({conversation.email}) - sent from noreply@englishforcricket.com
                        </Text>
                        <TextInput
                          className="w-full bg-white p-4 rounded-xl border border-inkline min-h-[100px]"
                          placeholder="Write your reply..."
                          value={replyDraft}
                          onChangeText={setReplyDraft}
                          multiline
                          textAlignVertical="top"
                        />
                        <View className="flex-row justify-end gap-3 mt-3">
                          <View className="w-24">
                            <AnimatedButton
                              title="Cancel"
                              onPress={handleCancelReply}
                              disabled={sending}
                              variant="outline"
                              size="sm"
                            />
                          </View>
                          <View className="w-32">
                            <AnimatedButton
                              title={sending ? 'Sending...' : 'Send Reply'}
                              onPress={() => handleSendReply(conversation)}
                              disabled={sending || !replyDraft.trim()}
                              variant="primary"
                              size="sm"
                            />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-[20px] border border-inkline shadow-sm space-y-6 gap-6">
        <Text className="font-display text-xl font-semibold text-navy">
          {editId ? 'Edit Support Item' : 'Add Support Item'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Section / Category</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline mb-2"
              placeholder="e.g., Getting Started, Gameplay"
              value={sectionName}
              onChangeText={setSectionName}
            />
            {existingSections.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                {existingSections.map(sec => (
                  <Pressable 
                    key={sec} 
                    onPress={() => setSectionName(sec)}
                    className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline mr-2"
                  >
                    <Text className="text-xs font-bold text-slate-600">{sec}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
          <View className="w-full md:w-32">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Order Index</Text>
            <TextInput
              className="w-full bg-canvas p-4 rounded-xl border border-inkline"
              placeholder="0"
              keyboardType="numeric"
              value={orderIndex}
              onChangeText={setOrderIndex}
            />
          </View>
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Question / Topic</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="e.g., How do I reset a student PIN?"
            value={question}
            onChangeText={setQuestion}
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Answer</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline min-h-[100px]"
            placeholder="Provide the step-by-step answer..."
            value={answer}
            onChangeText={setAnswer}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Embedded Video URL (Optional)</Text>
          <TextInput
            className="w-full bg-canvas p-4 rounded-xl border border-inkline"
            placeholder="https://youtube.com/watch?v=..."
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
          />
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-inkline pt-4">
          {editId && (
            <View className="w-24">
              <AnimatedButton title="Cancel" onPress={cancelEdit} variant="outline" size="sm" />
            </View>
          )}
          <View className="w-32">
            <AnimatedButton 
              title={saving ? "Saving..." : "Save Item"} 
              onPress={handleSave} 
              disabled={saving} 
              variant="primary" 
              size="sm" 
            />
          </View>
        </View>
      </View>

      {/* FAQs List */}
      <View className="bg-white rounded-2xl border border-inkline shadow-sm overflow-hidden">
        {loading ? (
          <View className="p-8 items-center"><ActivityIndicator size="large" color="#0A192F" /></View>
        ) : faqs.length === 0 ? (
          <View className="p-8 items-center">
            <Text className="text-slate-500">No support articles created yet.</Text>
          </View>
        ) : (
          faqs.map((faq, index) => (
            <View 
              key={faq.id} 
              className={`flex-col md:flex-row justify-between items-start p-4 gap-4 ${index !== faqs.length - 1 ? 'border-b border-inkline' : ''}`}
            >
              <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-xs font-bold text-pitch uppercase tracking-wider">{faq.section_name}</Text>
                  {faq.video_url && <Text className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full font-bold">Has Video</Text>}
                </View>
                <Text className="font-bold text-text-primary text-base mb-1">{faq.question}</Text>
                <Text className="text-sm text-slate-500" numberOfLines={2}>{faq.answer}</Text>
              </View>
              
              <View className="flex-row gap-3 mt-2 md:mt-0">
                <Pressable onPress={() => handleEdit(faq)} className="px-3 py-1.5 bg-slate-100 rounded-full border border-inkline">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(faq.id)} className="px-3 py-1.5 bg-red-50 rounded-full border border-red-100">
                  <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}