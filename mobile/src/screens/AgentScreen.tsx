import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AgentService, type ChatMessage } from '../services/AgentService';

export function AgentScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const agent = AgentService.getInstance();

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await agent.chat(text);
      const botMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: Date.now() };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I could not process that request.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View
            style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.botBubble]}
          >
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Ask me anything about your preferences, recommendations, or watchlist.
          </Text>
        }
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask RecoMe..."
          placeholderTextColor="#555"
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={loading}>
          <Text style={styles.sendText}>{loading ? '...' : 'Send'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  messageList: { padding: 16, flexGrow: 1 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 8 },
  userBubble: { backgroundColor: '#7c6df0', alignSelf: 'flex-end' },
  botBubble: { backgroundColor: '#1a1a2e', alignSelf: 'flex-start' },
  bubbleText: { color: '#e0e0ff', fontSize: 14 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 40, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#2a2a4e' },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e0e0ff',
    fontSize: 14,
  },
  sendBtn: {
    marginLeft: 8,
    backgroundColor: '#7c6df0',
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '600' },
});
