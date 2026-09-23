// src/screens/ConnectDeviceScreen.js
// Показва се веднъж, при първо отваряне (докато устройството не е свързано
// към семейство). Родителят създава семеен код + детски профили; детето
// въвежда кода и избира кой профил е то. Виж deviceLink.js за backend извикванията.

import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "../theme";
import {
  createFamily, joinFamily, addChild, saveLinkedDevice,
} from "../services/deviceLink";

const STEP_CHOOSE_ROLE = "choose_role";
const STEP_PARENT_ADD_CHILD = "parent_add_child";
const STEP_CHILD_ENTER_CODE = "child_enter_code";
const STEP_CHILD_PICK = "child_pick";

export default function ConnectDeviceScreen({ onLinked }) {
  const [step, setStep] = useState(STEP_CHOOSE_ROLE);
  const [loading, setLoading] = useState(false);

  // родителски поток
  const [familyId, setFamilyId] = useState(null);
  const [familyCode, setFamilyCode] = useState(null);
  const [children, setChildren] = useState([]);
  const [childName, setChildName] = useState("");
  const [childGender, setChildGender] = useState("male");
  const [childGrade, setChildGrade] = useState("4");

  // детски поток
  const [codeInput, setCodeInput] = useState("");
  const [joinedChildren, setJoinedChildren] = useState([]);

  const startParentFlow = useCallback(async () => {
    setLoading(true);
    try {
      const { family_id, code } = await createFamily();
      setFamilyId(family_id);
      setFamilyCode(code);
      setStep(STEP_PARENT_ADD_CHILD);
    } catch (e) {
      Alert.alert("Грешка", "Не успях да свържа със сървъра. Провери интернет връзката и опитай пак.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddChild = useCallback(async () => {
    if (!childName.trim()) {
      Alert.alert("Липсва име", "Въведи име на детето.");
      return;
    }
    setLoading(true);
    try {
      const child = await addChild(familyId, {
        name: childName.trim(), gender: childGender, grade: childGrade,
      });
      setChildren((prev) => [...prev, child]);
      setChildName("");
      setChildGrade("4");
    } catch (e) {
      Alert.alert("Грешка", "Не успях да добавя детето. Опитай пак.");
    } finally {
      setLoading(false);
    }
  }, [familyId, childName, childGender, childGrade]);

  const finishParentSetup = useCallback(async () => {
    if (children.length === 0) {
      Alert.alert("Добави поне едно дете", "Трябва поне един детски профил, преди да продължиш.");
      return;
    }
    await saveLinkedDevice({ role: "parent", familyId, familyCode });
    onLinked({ role: "parent", familyId, familyCode });
  }, [children, familyId, familyCode, onLinked]);

  const handleJoinFamily = useCallback(async () => {
    if (!codeInput.trim()) return;
    setLoading(true);
    try {
      const result = await joinFamily(codeInput);
      if (!result.children || result.children.length === 0) {
        Alert.alert(
          "Няма профили още",
          "Родителят трябва първо да добави детски профил в семейството."
        );
        return;
      }
      setFamilyId(result.family_id);
      setFamilyCode(result.code);
      setJoinedChildren(result.children);
      setStep(STEP_CHILD_PICK);
    } catch (e) {
      Alert.alert("Грешен код", "Провери кода и опитай пак.");
    } finally {
      setLoading(false);
    }
  }, [codeInput]);

  const pickChild = useCallback(async (child) => {
    await saveLinkedDevice({
      role: "child", familyId, familyCode, childId: child.id,
      childName: child.name, childGender: child.gender, childGrade: child.grade,
    });
    onLinked({ role: "child", familyId, familyCode, childId: child.id });
  }, [familyId, familyCode, onLinked]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {step === STEP_CHOOSE_ROLE && (
          <>
            <Text style={styles.title}>Добре дошъл в Училищен Симулатор</Text>
            <Text style={styles.subtitle}>Това устройство на родител ли е, или на дете?</Text>
            <TouchableOpacity style={styles.bigBtn} onPress={startParentFlow} disabled={loading}>
              <Text style={styles.bigBtnText}>👨‍👩‍👧 Аз съм родител</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bigBtn, styles.bigBtnSecondary]}
              onPress={() => setStep(STEP_CHILD_ENTER_CODE)}
              disabled={loading}
            >
              <Text style={styles.bigBtnText}>🧒 Аз съм дете</Text>
            </TouchableOpacity>
            {loading && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}
          </>
        )}

        {step === STEP_PARENT_ADD_CHILD && (
          <>
            <Text style={styles.title}>Семеен код: {familyCode}</Text>
            <Text style={styles.subtitle}>
              Запиши си този код — ще трябва на детското устройство. Сега добави децата в семейството.
            </Text>

            {children.length > 0 && (
              <View style={styles.childrenList}>
                {children.map((c) => (
                  <Text key={c.id} style={styles.childRow}>✅ {c.name} ({c.grade}. клас)</Text>
                ))}
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder="Име на детето"
              value={childName}
              onChangeText={setChildName}
            />
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.pill, childGender === "male" && styles.pillActive]}
                onPress={() => setChildGender("male")}
              >
                <Text style={[styles.pillText, childGender === "male" && styles.pillTextActive]}>Момче</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, childGender === "female" && styles.pillActive]}
                onPress={() => setChildGender("female")}
              >
                <Text style={[styles.pillText, childGender === "female" && styles.pillTextActive]}>Момиче</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Клас (напр. 4)"
              value={childGrade}
              onChangeText={setChildGrade}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.smallBtn} onPress={handleAddChild} disabled={loading}>
              <Text style={styles.smallBtnText}>+ Добави дете</Text>
            </TouchableOpacity>

            {loading && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}

            <TouchableOpacity style={styles.bigBtn} onPress={finishParentSetup} disabled={loading}>
              <Text style={styles.bigBtnText}>Готово — продължи</Text>
            </TouchableOpacity>
          </>
        )}

        {step === STEP_CHILD_ENTER_CODE && (
          <>
            <Text style={styles.title}>Въведи семейния код</Text>
            <Text style={styles.subtitle}>Родителят ти трябва да ти го е дал.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="напр. AB12CD"
              value={codeInput}
              onChangeText={setCodeInput}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.bigBtn} onPress={handleJoinFamily} disabled={loading}>
              <Text style={styles.bigBtnText}>Продължи</Text>
            </TouchableOpacity>
            {loading && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}
          </>
        )}

        {step === STEP_CHILD_PICK && (
          <>
            <Text style={styles.title}>Кой си ти?</Text>
            {joinedChildren.map((c) => (
              <TouchableOpacity key={c.id} style={styles.bigBtn} onPress={() => pickChild(c)}>
                <Text style={styles.bigBtnText}>{c.name} ({c.grade}. клас)</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, flexGrow: 1, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: spacing.sm, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing.xl, textAlign: "center" },
  bigBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    padding: spacing.lg, alignItems: "center", marginBottom: spacing.md,
  },
  bigBtnSecondary: { backgroundColor: colors.success },
  bigBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  smallBtn: {
    backgroundColor: colors.primaryLight, borderRadius: radius.md,
    padding: spacing.md, alignItems: "center", marginBottom: spacing.lg,
  },
  smallBtnText: { color: colors.primaryDark, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, fontSize: 15, marginBottom: spacing.md,
  },
  codeInput: { textAlign: "center", fontSize: 20, letterSpacing: 4, fontWeight: "700" },
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  pill: {
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full,
    padding: spacing.sm, alignItems: "center",
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  pillText: { color: colors.muted, fontSize: 14 },
  pillTextActive: { color: colors.primaryDark, fontWeight: "700" },
  childrenList: { marginBottom: spacing.lg },
  childRow: { fontSize: 14, color: colors.text, marginBottom: spacing.xs },
});
