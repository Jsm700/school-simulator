// src/screens/QuizScreen.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  PermissionsAndroid,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { getTeacherResponse } from "../services/ai";
import { colors, spacing, radius } from "../theme";

function TopicPill({ label, done }) {
  return (
    <View style={[styles.pill, done ? styles.pillDone : styles.pillTodo]}>
      <Text style={[styles.pillText, done ? styles.pillTextDone : styles.pillTextTodo]}>
        {done ? "✓ " : ""}{label}
      </Text>
    </View>
  );
}

function ChatBubble({ role, text }) {
  if (role === "ai") {
    return (
      <View style={styles.bubbleRowAI}>
        <View style={styles.avatarCircle}>
          <Text style={{ fontSize: 16 }}>👩‍🏫</Text>
        </View>
        <View style={styles.bubbleAI}>
          <Text style={styles.bubbleAIText}>{text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.bubbleRowUser}>
      <View style={styles.bubbleUser}>
        <Text style={styles.bubbleUserText}>{text}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.bubbleRowAI}>
      <View style={styles.avatarCircle}>
        <Text style={{ fontSize: 16 }}>👩‍🏫</Text>
      </View>
      <View style={styles.bubbleAI}>
        <ActivityIndicator size="small" color={colors.success} />
      </View>
    </View>
  );
}

export default function QuizScreen({ route, navigation }) {
  const { lesson } = route.params;

  const [messages, setMessages] = useState([]);
  const [displayMessages, setDisplayMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [topicsDone, setTopicsDone] = useState({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef(null);
  const isFirstLoad = useRef(true);
  const messagesRef = useRef([]); // Синхронно следене на съобщенията

  // Hint chips динамично според урока
  const hintChips = [
    { label: "💡 Подсказка", msg: "Дай ми подсказка, моля." },
    { label: "🔄 Повтори въпроса", msg: "Можеш ли да повториш въпроса?" },
    ...lesson.topics.map(key => ({
      label: `📚 ${lesson.topicLabels[key]}`,
      msg: `Задай ми въпрос за: ${lesson.topicLabels[key]}`,
    })),
  ];

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const speakText = useCallback(async (text) => {
  Speech.stop();
  setIsSpeaking(true);

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const bgVoice = voices.find(v => 
      v.language?.toLowerCase().startsWith("bg") || 
      v.identifier?.toLowerCase().includes("bg")
    );

    // Базови опции, които винаги присъстват
    const options = {
      rate: 0.9,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    };

    // САМО ако реално съществува български глас на телефона, го добавяме в настройките
    if (bgVoice && bgVoice.identifier) {
      options.voice = bgVoice.identifier;
    } else {
      // Fallback за другите ливади: ако няма БГ глас, казваме на системата поне да се опита да прочете езика
      options.language = "bg-BG";
    }

    Speech.speak(text, options);
  } catch (error) {
    // Пълна застраховка в случай на софтуерен срив
    Speech.speak(text, {
      rate: 0.9,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }
}, []);

  const detectTopics = useCallback((text, role) => {
    const t = text.toLowerCase();
    const updates = {};
    let pts = 0;
    
    if (role === "user") {
      if (/румъния|сърбия|македония|гърция|турция/.test(t)) { updates.neighbors = true; pts += 5; }
      if (/кръстопъ/.test(t)) { updates.crossroads = true; pts += 5; }
      if (/балкан/.test(t)) { updates.balkan = true; pts += 5; }
      if (/мусала|рила|родопи|пирин|стара.планина/.test(t)) { updates.mountains = true; pts += 5; }
      if (/дунав|марица|искър/.test(t)) { updates.rivers = true; pts += 5; }
    }
    if (role === "ai" && /браво|отлично|точно|чудесно|страхотно|правилно/i.test(t)) { pts += 2; }
    if (Object.keys(updates).length > 0) setTopicsDone(prev => ({ ...prev, ...updates }));
    if (pts > 0) setScore(prev => prev + pts);
  }, []);

  const sendToAI = useCallback(async (userMsg, isFirst = false) => {
    setIsLoading(true);
    scrollToBottom();

    let messagesToSend = [];

    if (isFirst) {
      messagesToSend = [{ role: "user", content: "Поздрави ме топло и задай първия си въпрос по урока." }];
    } else {
      messagesToSend = [...messagesRef.current, { role: "user", content: userMsg }];
      setDisplayMessages(d => [...d, { role: "user", text: userMsg }]);
      detectTopics(userMsg, "user");
    }

    messagesRef.current = messagesToSend;
    setMessages(messagesToSend);
    
try {
  const reply = await getTeacherResponse(
    messagesToSend,
    lesson.content,
    route.params.studentName,
    route.params.studentGender,
    route.params.studentGrade
  );

  const withReply = [...messagesToSend, { role: "assistant", content: reply }];

  messagesRef.current = withReply;
  setMessages(withReply);
  setDisplayMessages(d => [...d, { role: "ai", text: reply }]);
  detectTopics(reply, "ai");
  speakText(reply);
} catch (error) {
      setDisplayMessages(d => [...d, { role: "ai", text: `Грешка: ${error.message}` }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [lesson, detectTopics, speakText, scrollToBottom]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      sendToAI("", true);
    }
  }, [sendToAI]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText("");
    sendToAI(text);
  }, [inputText, isLoading, sendToAI]);

  const handleChip = useCallback((msg) => {
    if (isLoading) return;
    sendToAI(msg);
  }, [isLoading, sendToAI]);

  const toggleMic = useCallback(async () => {
    if (isRecording) {
      setIsRecording(false);
      return;
    }
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setInputText("(Напиши отговора с клавиатурата)");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "bg-BG";
      recognition.continuous = false;
      recognition.interimResults = false;
      setIsRecording(true);
      recognition.onresult = (event) => {
        setInputText(event.results[0][0].transcript);
        setIsRecording(false);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } catch (err) {
      setIsRecording(false);
    }
  }, [isRecording]);

  const topicEntries = lesson.topics.map(key => ({
    key,
    label: lesson.topicLabels[key],
    done: !!topicsDone[key],
  }));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { Speech.stop(); navigation.goBack(); }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{lesson.title}</Text>
          <Text style={styles.headerSub}>{lesson.subtitle}</Text>
        </View>
        <TouchableOpacity onPress={() => isSpeaking ? Speech.stop() : null}>
          <Ionicons
            name={isSpeaking ? "volume-high" : "volume-medium-outline"}
            size={22}
            color={isSpeaking ? "#FFD" : "rgba(255,255,255,0.7)"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.scorebar}>
        <Text style={styles.scoreText}>⭐ {score} точки</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {topicEntries.map(t => (
              <TopicPill key={t.key} label={t.label} done={t.done} />
            ))}
          </View>
        </ScrollView>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={scrollToBottom}
        >
          {displayMessages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} text={msg.text} />
          ))}
          {isLoading && <TypingIndicator />}
          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={styles.inputContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
            contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.lg }}
          >
            {hintChips.map(c => (
              <TouchableOpacity
                key={c.label}
                style={styles.chip}
                onPress={() => handleChip(c.msg)}
                disabled={isLoading}
              >
                <Text style={styles.chipText}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Напиши отговора си..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={500}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.micBtn, isRecording && styles.micBtnRecording]}
              onPress={toggleMic}
              disabled={isLoading}
            >
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={22}
                color={isRecording ? "#fff" : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.micHint}>
            {isRecording ? "Слушам... Натисни за спиране" : "🎙️ Натисни за гласов отговор"}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  header: {
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 1 },
  scorebar: {
    backgroundColor: colors.successLight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#C0DD97",
  },
  scoreText: { fontSize: 13, fontWeight: "700", color: "#3B6D11" },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  pillDone: { backgroundColor: colors.pillDone },
  pillTodo: { backgroundColor: colors.pillTodo },
  pillText: { fontSize: 11, fontWeight: "600" },
  pillTextDone: { color: colors.pillDoneText },
  pillTextTodo: { color: colors.pillTodoText },
  chatArea: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: spacing.lg, gap: 10 },
  bubbleRowAI: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  bubbleRowUser: { flexDirection: "row", justifyContent: "flex-end" },
  avatarCircle: {
    width: 32, height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bubbleAI: {
    backgroundColor: colors.bubbleAI,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    padding: 12,
    maxWidth: "80%",
  },
  bubbleAIText: { fontSize: 15, color: colors.bubbleAIText, lineHeight: 22 },
  bubbleUser: {
    backgroundColor: colors.bubbleUser,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    padding: 12,
    maxWidth: "80%",
  },
  bubbleUserText: { fontSize: 15, color: colors.bubbleUserText, lineHeight: 22 },
  inputContainer: {
    backgroundColor: "rgba(255,249,240,0.97)",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.lg,
  },
  chipsRow: { marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  chipText: { fontSize: 12, color: colors.text },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    fontSize: 15, color: colors.text,
    maxHeight: 100,
  },
  micBtn: {
    width: 46, height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  micBtnRecording: { backgroundColor: "#E24B4A" },
  sendBtn: {
    width: 46, height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#B5D4F4" },
  micHint: { textAlign: "center", fontSize: 11, color: colors.muted, marginTop: 5 },
});
