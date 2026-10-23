// src/screens/QuizScreen.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Alert,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  PermissionsAndroid,
  Modal,
} from "react-native";
import { Text, TextInput } from "../ui/Typography";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { getTeacherResponse, getAudio, lessonTopicsFor } from "../services/ai";
import { consumeGreetingPrefetch } from "../services/prefetch";
import { useLocalSearchParams } from "expo-router";
import { colors, spacing, radius, subjectStyle } from "../theme";
import { markLessonCompleted, isLessonCompleted } from "../services/progress";
import { awardLessonPoints } from "../services/points";
import { logActivityMinutes } from "../services/deviceLink";

// state: "done" (овладяна) | "partial" (частично) | undefined (още не)
function TopicPill({ label, state }) {
  const done = state === "done", partial = state === "partial";
  return (
    <View style={[styles.pill, done ? styles.pillDone : partial ? styles.pillPartial : styles.pillTodo]}>
      <Text style={[styles.pillText, done ? styles.pillTextDone : partial ? styles.pillTextPartial : styles.pillTextTodo]}>
        {done ? "✓ " : partial ? "½ " : ""}{label}
      </Text>
    </View>
  );
}

function ChatBubble({ role, text }) {
  if (role === "ai") {
    return (
      <View style={styles.bubbleRowAI}>
        <View style={styles.avatarCircle}>
          <Text style={{ fontSize: 18 }}>👩‍🏫</Text>
        </View>
        <View style={styles.bubbleAI}>
          <Text style={styles.bubbleAIName}>Елена</Text>
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

export default function QuizScreen({ navigation }) {
  const params = useLocalSearchParams();
  const lesson = JSON.parse(params.lesson);
  const studentName = params.studentName;
  const studentGender = params.studentGender;
  const studentGrade = params.studentGrade;
  const [messages, setMessages] = useState([]);
  const [displayMessages, setDisplayMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Овладени теми — решава ги Елена (оценка на всеки отговор), не броят на репликите
  const [topicsDone, setTopicsDone] = useState({});
  const topicsDoneRef = useRef({});
  const lessonTopics = React.useMemo(() => lessonTopicsFor(lesson), [lesson]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentAnswerLang, setCurrentAnswerLang] = useState(lesson.lessonLanguage === "en" ? "en" : "bg");
  const scrollRef = useRef(null);
  const isFirstLoad = useRef(true);
  const isMountedRef = useRef(true); // false след unmount — спира по-нататъшно аудио/навигация
  const currentSoundRef = useRef(null); // текущо звучащ Audio.Sound, за да го спрем при излизане от екрана
  const messagesRef = useRef([]); // Синхронно следене на съобщенията
  const speechAccumRef = useRef(""); // Натрупан текст между отделни result събития в continuous режим
  const exchangeCountRef = useRef(0); // брой AI отговори през сесията — база за пропорционалните точки при "Приключих"
  const enteredAtRef = useRef(Date.now()); // Focus-line: за логване на реално прекараното време

  // Речник на урока + режим "непозната дума"
  const [vocabWords, setVocabWords] = useState(null); // null = още не е зареден
  const [vocabModalVisible, setVocabModalVisible] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [askingUnknownWord, setAskingUnknownWord] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  useEffect(() => {
    if (lesson.kvKey) {
      isLessonCompleted(lesson.kvKey).then(setAlreadyCompleted);
    }
  }, [lesson.kvKey]);

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

  // Изговаря един base64 WAV клип и чака да свърши (с 10 сек safety timeout).
  // isSpeaking се управлява отвън от sendToAI, за да покрива цялата поредица клипове.
  const speakBase64 = useCallback(async (base64Audio) => {
    if (!base64Audio || !isMountedRef.current) return;
    await new Promise((resolve) => {
      let resolved = false;
      Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${base64Audio}` },
        { shouldPlay: true }
      ).then(({ sound }) => {
        if (!isMountedRef.current) {
          // Екранът е затворен точно докато звукът се е зареждал — не го пускаме изобщо.
          sound.unloadAsync();
          resolved = true;
          resolve();
          return;
        }
        currentSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if ((status.didJustFinish || status.error) && !resolved) {
            resolved = true;
            sound.unloadAsync();
            if (currentSoundRef.current === sound) currentSoundRef.current = null;
            resolve();
          }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve(); }
        }, 10000);
      }).catch(() => resolve());
    });
  }, []);

  // Прилага оценката на Елена: correct → темата е овладяна; partial → частично (не се брои)
  const applyEvaluation = useCallback((evaluation) => {
    if (!evaluation || !evaluation.topic) return;
    const cur = topicsDoneRef.current[evaluation.topic];
    let next = cur;
    if (evaluation.verdict === "correct") next = "done";
    else if (evaluation.verdict === "partial" && cur !== "done") next = "partial";
    if (next === cur) return;
    const updated = { ...topicsDoneRef.current, [evaluation.topic]: next };
    topicsDoneRef.current = updated;
    setTopicsDone(updated);
  }, []);

  const sendToAI = useCallback(async (userMsg, isFirst = false, prefetchedPromise = null) => {
    setIsLoading(true);
    scrollToBottom();

    let messagesToSend = [];
    let greetingText = "";

    if (isFirst) {
      greetingText = `Здравей, скъп${studentGender === "female" ? "а" : ""} ${studentName}!`;
      messagesToSend = [{ role: "user", content: "Не ме поздравявай — поздравът вече е изговорен отделно. Задай директно първия си въпрос по днешния урок, без встъпителни думи." }];
    } else {
      messagesToSend = [...messagesRef.current, { role: "user", content: userMsg }];
      setDisplayMessages(d => [...d, { role: "user", text: userMsg }]);
    }

    messagesRef.current = messagesToSend;
    setMessages(messagesToSend);

    try {
      const response = prefetchedPromise
        ? await prefetchedPromise
        : await getTeacherResponse(
            messagesToSend,
            lesson.content || "",
            studentName,
            studentGender,
            studentGrade,
            lesson.kvKey || "",
            lessonTopics,
            Object.keys(topicsDoneRef.current).filter((k) => topicsDoneRef.current[k] === "done")
          );

      if (response.expectedAnswerLang === "en" || response.expectedAnswerLang === "bg") {
        setCurrentAnswerLang(response.expectedAnswerLang);
      }

      const finalText = isFirst ? `${greetingText} ${response.text}` : response.text;
      const withReply = [...messagesToSend, { role: "assistant", content: response.text }];

      messagesRef.current = withReply;
      setMessages(withReply);
      setDisplayMessages(d => [...d, { role: "ai", text: finalText }]);
      applyEvaluation(response.evaluation);
      exchangeCountRef.current += 1;
      setIsLoading(false);

      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);

      setIsSpeaking(true);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

      if (isFirst && isMountedRef.current) {
        // Поздравът тръгва СЕГА, едва след като чат TTS-то вече е приключило - никакво застъпване на Gemini заявки.
        try {
          const greetingAudio = await getAudio(greetingText);
          if (isMountedRef.current) await speakBase64(greetingAudio);
        } catch (greetErr) {
          // Ако поздравът се провали, продължаваме директно с въпроса, без да чупим потока.
        }
      }

      if (response.audioChunks && response.audioChunks.length > 0) {
        for (const chunk of response.audioChunks) {
          if (!isMountedRef.current) break; // детето вече е напуснало този урок - не продължаваме да пускаме звук
          await speakBase64(chunk);
        }
      } else if (response.text) {
        const sentences = response.text.match(/[^.!?]+[.!?]+/g) || [response.text];
        for (const s of sentences) {
          if (!isMountedRef.current) break;
          const audio = await getAudio(s.trim());
          if (!isMountedRef.current) break;
          await speakBase64(audio);
        }
      }
      if (isMountedRef.current) setIsSpeaking(false);
    } catch (error) {
      setDisplayMessages(d => [...d, { role: "ai", text: `Грешка: ${error.message}` }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [lesson, lessonTopics, applyEvaluation, speakBase64, scrollToBottom, studentGender, studentName]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      const signature = `${lesson.id}_${studentName}_${studentGender}_${studentGrade}`;
      const prefetched = consumeGreetingPrefetch(signature);
      sendToAI("", true, prefetched);
    }
  }, [sendToAI]);

  // Спира незабавно всякакво звучащо аудио, ако детето напусне този урок (назад/друг урок),
  // докато Елена все още говори — предотвратява застъпване на гласове от два едновременни урока.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      ExpoSpeechRecognitionModule.stop();
      if (currentSoundRef.current) {
        currentSoundRef.current.stopAsync().catch(() => {});
        currentSoundRef.current.unloadAsync().catch(() => {});
        currentSoundRef.current = null;
      }
      const minutes = (Date.now() - enteredAtRef.current) / 60000;
      if (minutes >= 0.15) logActivityMinutes(minutes);
    };
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
    }
    setInputText("");
    if (askingUnknownWord) {
      setAskingUnknownWord(false);
      sendToAI(`Не разбирам думата "${text}". Обясни ми я просто, с пример от ежедневието, но НЕ я брой като грешка или пропуск в изпита.`);
    } else {
      sendToAI(text);
    }
  }, [inputText, isLoading, sendToAI, isRecording, askingUnknownWord]);

  const handleChip = useCallback((msg) => {
    if (isLoading) return;
    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
    }
    sendToAI(msg);
  }, [isLoading, sendToAI, isRecording]);

  const openVocab = useCallback(async () => {
    if (vocabWords === null) {
      setVocabLoading(true);
      try {
        const res = await fetch("https://frosty-dawn-e989.yassen-mladenov.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_vocabulary", lessonKey: lesson.kvKey || "" }),
        });
        const data = await res.json();
        setVocabWords(data.vocabulary || {});
      } catch (e) {
        setVocabWords({});
      } finally {
        setVocabLoading(false);
      }
    }
    setVocabModalVisible(true);
  }, [vocabWords, lesson.kvKey]);

  const handleVocabWordPress = useCallback((word) => {
    setVocabModalVisible(false);
    handleChip(`Обясни ми думата "${word}" и после продължи изпитването.`);
  }, [handleChip]);

  const toggleUnknownWordMode = useCallback(() => {
    setAskingUnknownWord(prev => !prev);
  }, []);

  const masteredCount = lessonTopics.filter((t) => topicsDone[t.key] === "done").length;
  const allMastered = lessonTopics.length > 0 && masteredCount === lessonTopics.length;

  const handleFinishLesson = useCallback(() => {
    const total = lessonTopics.length;
    const covered = lessonTopics.filter((t) => topicsDoneRef.current[t.key] === "done").length;
    const complete = total > 0 && covered === total;
    if (covered === 0) {
      Alert.alert(
        "Още няма овладени теми",
        "Точки има само за теми, по които си отговорил вярно. Продължи с Елена, докато поне една тема светне в зелено.",
        [
          { text: "Продължавам", style: "cancel" },
          { text: "Излез без точки", style: "destructive", onPress: () => navigation.goBack() },
        ]
      );
      return;
    }
    Alert.alert(
      complete ? "Всички теми са овладени! 🎉" : "Приключи урока?",
      complete
        ? "Урокът ще се отбележи като минат."
        : `Овладени теми: ${covered} от ${total}. Точки получаваш само за тях, а урокът ще се брои за минат, когато овладееш всички.`,
      [
        { text: "Продължавам", style: "cancel" },
        {
          text: complete ? "Готово" : "Приключвам сега",
          onPress: async () => {
            if (complete) {
              await markLessonCompleted(lesson.kvKey);
              setAlreadyCompleted(true);
            }
            const result = await awardLessonPoints({
              lessonKey: lesson.kvKey,
              subject: lesson.subject || "",
              lessonTitle: lesson.title || "",
              topicsTotal: total,
              topicsCovered: covered,
            });
            const extras = [];
            if (result.isJackpot) extras.push("🎰 ДЖАКПОТ — двойни точки!");
            if (result.sameDayBonus > 0) extras.push(`🔁 +${result.sameDayBonus} за връщане пак днес`);
            if (result.currentStreak > 1) extras.push(`серия: ${result.currentStreak} дни`);
            Alert.alert(
              complete ? "Браво! 🎉" : "Добре!",
              `Спечели ${result.points} точки за ${covered} ${covered === 1 ? "овладяна тема" : "овладени теми"}${extras.length ? `\n${extras.join(" · ")}` : ""}.`,
              [{ text: "Супер", onPress: () => navigation.goBack() }]
            );
          },
        },
      ]
    );
  }, [lessonTopics, lesson.kvKey, lesson.subject, lesson.title, navigation]);

  useSpeechRecognitionEvent("result", (event) => {
    const segment = event.results?.[0]?.transcript;
    if (segment) {
      const combined = (speechAccumRef.current + " " + segment).trim();
      speechAccumRef.current = combined;
      setInputText(combined);
    }
  });
  useSpeechRecognitionEvent("end", () => { setIsRecording(false); });
  useSpeechRecognitionEvent("error", () => { setIsRecording(false); });
  const toggleMic = useCallback(async () => {
    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) return;
      speechAccumRef.current = "";
      setIsRecording(true);
      ExpoSpeechRecognitionModule.start({
        lang: currentAnswerLang === "en" ? "en-US" : "bg-BG",
        continuous: true,
        interimResults: false,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 3500,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 15000,
        },
      });
    } catch (err) {
      setIsRecording(false);
    }
  }, [isRecording, currentAnswerLang]);

  const subj = subjectStyle(lesson.subject);
  const topicEntries = lessonTopics.map((t) => ({ key: t.key, label: t.label, state: topicsDone[t.key] }));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.primaryDark }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { navigation.goBack(); }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>{subj.emoji} {subj.short.toUpperCase()} · ИЗПИТВАНЕ</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>{lesson.title}</Text>
        </View>
        <TouchableOpacity onPress={() => setIsSpeaking(false)}>
          <Ionicons
            name={isSpeaking ? "volume-high" : "volume-medium-outline"}
            size={22}
            color={isSpeaking ? "#FFD" : "rgba(255,255,255,0.7)"}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.scorebar}>
        <Text style={styles.scoreText}>Теми {masteredCount}/{lessonTopics.length}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginLeft: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {topicEntries.map(t => (
              <TopicPill key={t.key} label={t.label} state={t.state} />
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
          {lesson.kvKey ? (
            <TouchableOpacity
              style={[styles.finishBtn, alreadyCompleted && styles.finishBtnDone, allMastered && !alreadyCompleted && styles.finishBtnReady]}
              onPress={alreadyCompleted ? () => navigation.goBack() : handleFinishLesson}
            >
              <Text style={[styles.finishBtnText, allMastered && !alreadyCompleted && { color: "#fff" }]}>
                {alreadyCompleted
                  ? "✓ Урокът вече е минат"
                  : allMastered
                  ? "🎉 Всички теми са овладени — приключи урока"
                  : "Приключи урока"}
              </Text>
            </TouchableOpacity>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
            contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.lg }}
          >
            <TouchableOpacity
              style={styles.chip}
              onPress={openVocab}
              disabled={isLoading}
            >
              <Text style={styles.chipText}>📖 Речник на урока</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, askingUnknownWord && styles.chipActive]}
              onPress={toggleUnknownWordMode}
              disabled={isLoading}
            >
              <Text style={styles.chipText}>❓ Непозната дума</Text>
            </TouchableOpacity>
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
              style={[styles.textInput, askingUnknownWord && styles.textInputActive]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={askingUnknownWord ? "Коя дума не разбираш?" : "Напиши отговора си..."}
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
              <Text style={{ fontSize: 20 }}>{isRecording ? "⏹️" : "🎤"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() || isLoading) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || isLoading}
            >
              <Text style={{ fontSize: 20 }}>🚀</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.micHintRow}>
            <Text style={styles.micHint}>
              {isRecording ? "Слушам... Натисни за спиране" : "🎙️ Натисни за гласов отговор"}
            </Text>
            {lesson.lessonLanguage === "en" && (
              <TouchableOpacity
                style={styles.langToggle}
                onPress={() => setCurrentAnswerLang(prev => (prev === "en" ? "bg" : "en"))}
                disabled={isRecording}
              >
                <Text style={styles.langToggleText}>
                  {currentAnswerLang === "en" ? "🇬🇧 Говоря английски" : "🇧🇬 Говоря български"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={vocabModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVocabModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📖 Речник на урока</Text>
            {vocabLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.lg }} />
            ) : vocabWords && Object.keys(vocabWords).length > 0 ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {Object.keys(vocabWords).map(word => (
                  <TouchableOpacity
                    key={word}
                    style={styles.vocabWordRow}
                    onPress={() => handleVocabWordPress(word)}
                  >
                    <Text style={styles.vocabWordText}>{word}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.modalEmptyText}>Няма речник за този урок.</Text>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setVocabModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>Затвори</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primaryDark },
  header: {
    backgroundColor: colors.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center",
  },
  headerEyebrow: { color: "#9DB8EA", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "display", fontWeight: "700", marginTop: 2 },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 1 },
  scorebar: {
    backgroundColor: colors.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoreText: { fontSize: 12, fontWeight: "800", color: colors.muted, letterSpacing: 0.5 },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.full },
  pillDone: { backgroundColor: colors.pillDone },
  pillTodo: { backgroundColor: colors.pillTodo },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextDone: { color: colors.pillDoneText },
  pillTextTodo: { color: colors.pillTodoText },
  pillPartial: { backgroundColor: colors.energyLight },
  pillTextPartial: { color: "#8A6D00" },
  chatArea: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: spacing.lg, gap: 14 },
  bubbleRowAI: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bubbleRowUser: { flexDirection: "row", justifyContent: "flex-end" },
  avatarCircle: {
    width: 38, height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.energyLight,
    borderWidth: 2, borderColor: colors.energy,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bubbleAI: {
    backgroundColor: colors.bubbleAI,
    borderRadius: 20,
    borderTopLeftRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "84%",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#17233B", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleAIName: { fontSize: 12, fontWeight: "900", color: colors.accentDark, marginBottom: 2, letterSpacing: 0.3 },
  bubbleAIText: { fontSize: 17, color: colors.bubbleAIText, lineHeight: 25 },
  bubbleUser: {
    backgroundColor: colors.bubbleUser,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "84%",
  },
  bubbleUserText: { fontSize: 17, color: colors.bubbleUserText, lineHeight: 25 },
  inputContainer: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === "ios" ? spacing.xl : spacing.md,
  },
  chipsRow: { marginBottom: spacing.sm },
  finishBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  finishBtnDone: { backgroundColor: colors.background },
  finishBtnReady: { backgroundColor: colors.success },
  finishBtnText: { color: colors.success, fontSize: 14, fontWeight: "800" },
  chip: {
    paddingHorizontal: 14, minHeight: 40, justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  chipText: { fontSize: 14, fontWeight: "700", color: colors.text },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    backgroundColor: colors.background,
    fontSize: 16, color: colors.text,
    minHeight: 48,
    maxHeight: 110,
  },
  micBtn: {
    width: 48, height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  micBtnRecording: { backgroundColor: colors.danger },
  sendBtn: {
    width: 48, height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#F2C3A8" },
  micHint: { textAlign: "center", fontSize: 12, color: colors.muted },
  micHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 6,
  },
  langToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  langToggleText: { fontSize: 12, color: colors.primaryDark, fontWeight: "700" },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  textInputActive: { borderColor: colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(23,35,59,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    maxHeight: "70%",
  },
  modalTitle: { fontSize: 18, fontFamily: "display", fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  vocabWordRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  vocabWordText: { fontSize: 16, color: colors.text, fontWeight: "700" },
  modalEmptyText: { fontSize: 15, color: colors.muted, paddingVertical: spacing.lg },
  modalCloseBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
