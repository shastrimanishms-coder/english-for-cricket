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

  // Reply composer state: one composer open at a time (replyingId),
  // sendingReplyId drives the busy state, viewingReplyId expands the
  // stored text of an already-sent reply.
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const [viewingReplyId, setViewingReplyId] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      await fetchMessages();
    })();
  }, [fetchMessages]);

  const unreadCount = messages.filter((m) => !m.is_read).length;

  const handleToggleRead = async (msg: SupportMessage) => {
    try {
      const { error } = await supabase
        .from('support_messages')
        .update({ is_read: !msg.is_read })
        .eq('id', msg.id);
      if (error) throw error;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, is_read: !m.is_read } : m))
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
    } catch (error: any) {
      Alert.alert('Delete Failed', error.message);
    }
  };

  const handleOpenReply = (msg: SupportMessage) => {
    setReplyingId(msg.id);
    setReplyDraft('');
  };

  const handleCancelReply = () => {
    setReplyingId(null);
    setReplyDraft('');
  };

  // Sends the reply through the send-support-email Edge Function, which
  // mails it via the owner's own SMTP (From: noreply@englishforcricket.com).
  // replied_at / reply_text are stamped on the row ONLY after the email
  // has actually gone out - a failed send leaves the inbox record
  // untouched (and the draft open) so the admin can retry or fall back
  // to their email app.
  const handleSendReply = async (msg: SupportMessage) => {
    const text = replyDraft.trim();
    if (!text || sendingReplyId) return;

    setSendingReplyId(msg.id);
    let emailSent = false;
    try {
      const { error: invokeError } = await supabase.functions.invoke('send-support-email', {
        body: {
          mode: 'reply',
          to: msg.email,
          subject: 'Re: ' + (msg.subject || 'Your support message'),
          message: text,
        },
      });
      if (invokeError) throw invokeError;
      emailSent = true;

      const repliedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('support_messages')
        .update({ replied_at: repliedAt, reply_text: text, is_read: true })
        .eq('id', msg.id);
      if (updateError) throw updateError;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, replied_at: repliedAt, reply_text: text, is_read: true } : m
        )
      );
      setReplyingId(null);
      setReplyDraft('');
      Alert.alert('Reply Sent', `Your reply was emailed to ${msg.email}.`);
    } catch {
      if (emailSent) {
        // The email went out but the inbox record could not be stamped.
        Alert.alert(
          'Reply Sent',
          'The reply email was sent, but saving the reply record failed. The inbox will refresh now.'
        );
        setReplyingId(null);
        setReplyDraft('');
        await fetchMessages();
      } else {
        Alert.alert(
          'Reply Not Sent',
          'The reply email could not be sent - the email service may not be set up yet. ' +
            'The original message is safe in this inbox; you can try again later or reply via your email app.'
        );
      }
    } finally {
      setSendingReplyId(null);
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

  return (
    <View className="space-y-8 gap-8">
      <View className="flex-row justify-between items-center">
        <Text className="text-2xl font-bold text-text-primary">Help Center & FAQ Manager</Text>
      </View>

      {/* Messages Inbox - contact-form submissions from the Support page,
          stored in the database (support_messages). Replies are written
          here and emailed via the send-support-email Edge Function
          (owner's SMTP) once that function is deployed. */}
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <View className="flex-row items-center gap-3 p-4 border-b border-slate-100">
          <Text className="text-lg font-bold text-[#0A192F]">📩 Messages</Text>
          {inboxReady && unreadCount > 0 && (
            <Text className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
              {unreadCount} unread
            </Text>
          )}
        </View>
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
        ) : (
          messages.map((msg, index) => (
            <View
              key={msg.id}
              className={`p-4 ${index !== messages.length - 1 ? 'border-b border-slate-100' : ''} ${!msg.is_read ? 'bg-blue-50' : ''}`}
            >
              <View className="flex-col md:flex-row justify-between items-start gap-3">
                <View className="flex-1 pr-4">
                  <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                    <Text className={`text-base text-text-primary ${!msg.is_read ? 'font-extrabold' : 'font-bold'}`}>
                      {msg.name}
                    </Text>
                    {!msg.is_read && (
                      <Text className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded font-bold">NEW</Text>
                    )}
                    <Text className="text-xs text-slate-400">
                      {new Date(msg.created_at).toLocaleString()}
                    </Text>
                  </View>
                  <Pressable onPress={() => Linking.openURL(`mailto:${msg.email}`)}>
                    <Text className="text-sm text-action font-semibold mb-1">{msg.email}</Text>
                  </Pressable>
                  {msg.subject ? (
                    <Text className="font-bold text-text-primary text-sm mb-1">{msg.subject}</Text>
                  ) : null}
                  <Text className="text-sm text-slate-600">{msg.message}</Text>
                  {msg.replied_at ? (
                    <View className="mt-3 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <View className="flex-row items-center justify-between gap-3 flex-wrap">
                        <Text className="text-xs font-bold text-green-700">
                          ✓ Replied {new Date(msg.replied_at).toLocaleString()}
                        </Text>
                        {msg.reply_text ? (
                          <Pressable
                            onPress={() => setViewingReplyId(viewingReplyId === msg.id ? null : msg.id)}
                          >
                            <Text className="text-xs font-semibold text-green-700 underline">
                              {viewingReplyId === msg.id ? 'Hide reply' : 'View reply'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      {viewingReplyId === msg.id && msg.reply_text ? (
                        <Text className="text-sm text-slate-600 mt-2">{msg.reply_text}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View className="flex-row gap-3 mt-2 md:mt-0">
                  <Pressable
                    onPress={() => (replyingId === msg.id ? handleCancelReply() : handleOpenReply(msg))}
                    className="px-3 py-1.5 bg-[#0A192F] rounded border border-[#0A192F]"
                  >
                    <Text className="text-white text-sm font-semibold">Reply in panel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleToggleRead(msg)}
                    className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200"
                  >
                    <Text className="text-text-secondary text-sm font-semibold">
                      {msg.is_read ? 'Mark unread' : 'Mark read'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteMessage(msg.id)}
                    className="px-3 py-1.5 bg-red-50 rounded border border-red-100"
                  >
                    <Text className="text-red-600 text-sm font-semibold">Delete</Text>
                  </Pressable>
                </View>
              </View>

              {replyingId === msg.id && (
                <View className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <Text className="text-sm font-semibold text-text-secondary mb-2">
                    Reply to {msg.name} ({msg.email}) - sent from noreply@englishforcricket.com
                  </Text>
                  <TextInput
                    className="w-full bg-white p-4 rounded-xl border border-slate-200 min-h-[100px]"
                    placeholder="Write your reply..."
                    value={replyDraft}
                    onChangeText={setReplyDraft}
                    multiline
                    textAlignVertical="top"
                  />
                  <View className="flex-row items-center justify-between gap-4 mt-3 flex-wrap">
                    <Pressable onPress={() => Linking.openURL(`mailto:${msg.email}`)}>
                      <Text className="text-xs text-slate-400 font-semibold">or reply via your email app</Text>
                    </Pressable>
                    <View className="flex-row gap-3">
                      <View className="w-24">
                        <AnimatedButton
                          title="Cancel"
                          onPress={handleCancelReply}
                          disabled={sendingReplyId === msg.id}
                          variant="outline"
                          size="sm"
                        />
                      </View>
                      <View className="w-32">
                        <AnimatedButton
                          title={sendingReplyId === msg.id ? 'Sending...' : 'Send Reply'}
                          onPress={() => handleSendReply(msg)}
                          disabled={sendingReplyId === msg.id || !replyDraft.trim()}
                          variant="primary"
                          size="sm"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Editor Form */}
      <View className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 gap-6">
        <Text className="text-lg font-bold text-[#0A192F]">
          {editId ? 'Edit Support Item' : 'Add Support Item'}
        </Text>
        
        <View className="flex-col md:flex-row gap-4">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Section / Category</Text>
            <TextInput
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 mb-2"
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
                    className="px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200 mr-2"
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
              className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
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
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="e.g., How do I reset a student PIN?"
            value={question}
            onChangeText={setQuestion}
          />
        </View>

        <View>
          <Text className="text-sm font-semibold text-text-secondary mb-2">Answer</Text>
          <TextInput
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 min-h-[100px]"
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
            className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200"
            placeholder="https://youtube.com/watch?v=..."
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
          />
        </View>

        <View className="flex-row justify-end gap-4 mt-2 border-t border-slate-100 pt-4">
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
      <View className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
              className={`flex-col md:flex-row justify-between items-start p-4 gap-4 ${index !== faqs.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-xs font-bold text-brand uppercase tracking-wider">{faq.section_name}</Text>
                  {faq.video_url && <Text className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">Has Video</Text>}
                </View>
                <Text className="font-bold text-text-primary text-base mb-1">{faq.question}</Text>
                <Text className="text-sm text-slate-500" numberOfLines={2}>{faq.answer}</Text>
              </View>
              
              <View className="flex-row gap-3 mt-2 md:mt-0">
                <Pressable onPress={() => handleEdit(faq)} className="px-3 py-1.5 bg-slate-100 rounded border border-slate-200">
                  <Text className="text-text-secondary text-sm font-semibold">Edit</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(faq.id)} className="px-3 py-1.5 bg-red-50 rounded border border-red-100">
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