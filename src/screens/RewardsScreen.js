// src/screens/RewardsScreen.js
// Детски екран „Награди“: ниво и прогрес, портфейл, обмен на точки за жетони,
// магазин с награди (заявката я потвърждава родителят), домашни в риск и глоби.
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  getWallet, exchangeTokens, getRewards, requestReward, chooseGoal, depositGoal, claimGoal,
} from "../services/rewards";
import { colors, spacing, radius } from "../theme";

const STATUS_LABEL = { pending: "⏳ чака татко/мама", delivered: "✅ получено", cancelled: "↩︎ отказано, жетоните са върнати" };
const GOAL_STATUS_LABEL = { ...STATUS_LABEL, cancelled: "↩︎ отложено, жетоните са в касичката" };

export default function RewardsScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [shop, setShop] = useState({ rewards: [], requests: [], goals: [], goal: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = await getWallet();
    setWallet(w);
    try {
      setShop(await getRewards());
    } catch (e) {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onExchange = useCallback(() => {
    if (!wallet) return;
    Alert.alert(
      "Обмен",
      `Да обменя ли ${wallet.token_price} точки за 1 жетон?`,
      [
        { text: "Не", style: "cancel" },
        {
          text: "Да",
          onPress: async () => {
            setBusy(true);
            try {
              setWallet(await exchangeTokens(1));
              setShop(await getRewards());
            } catch (e) {
              Alert.alert("Не стана", e.message);
            }
            setBusy(false);
          },
        },
      ]
    );
  }, [wallet]);

  const onRequest = useCallback((r) => {
    Alert.alert(
      r.title,
      `Струва ${r.cost} ${r.cost === 1 ? "жетон" : "жетона"}. Заявката отива при родителя.`,
      [
        { text: "Отказ", style: "cancel" },
        {
          text: "Заявявам",
          onPress: async () => {
            setBusy(true);
            try {
              await requestReward(r.id);
              await load();
              Alert.alert("Готово 🎉", "Заявката е изпратена. Когато получиш наградата, татко/мама ще я отбележат.");
            } catch (e) {
              Alert.alert("Не стана", e.message);
            }
            setBusy(false);
          },
        },
      ]
    );
  }, [load]);

  const runGoal = useCallback(async (fn, okTitle, okMsg) => {
    setBusy(true);
    try {
      await fn();
      await load();
      if (okTitle) Alert.alert(okTitle, okMsg);
    } catch (e) {
      Alert.alert("Не стана", e.message);
    }
    setBusy(false);
  }, [load]);

  const onChooseGoal = useCallback((g) => {
    Alert.alert(
      `🎯 ${g.title}`,
      `Цел: ${g.cost} 🪙. Жетоните в касичката са заключени — не можеш да ги харчиш в магазина. Целта може да смени само родител.`,
      [
        { text: "Отказ", style: "cancel" },
        { text: "Избирам", onPress: () => runGoal(() => chooseGoal(g.id), "Целта е избрана 🎯", "Пускай жетони в касичката, когато имаш.") },
      ]
    );
  }, [runGoal]);

  const onDeposit = useCallback((goal) => {
    const left = goal.cost - goal.saved;
    Alert.alert(
      "Касичка",
      `Пускаш 1 🪙 в касичката за „${goal.title}“? Няма връщане назад.`,
      [
        { text: "Не", style: "cancel" },
        {
          text: "Пускам",
          onPress: () => runGoal(
            () => depositGoal(1),
            left <= 1 ? "🎉 Касичката е пълна!" : null,
            left <= 1 ? `„${goal.title}“ отиде като заявка при татко/мама.` : null,
          ),
        },
      ]
    );
  }, [runGoal]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const lvl = wallet?.level;
  const tokens = shop.tokens ?? wallet?.tokens ?? 0;
  const toNextToken = wallet ? wallet.token_price - (wallet.wallet % wallet.token_price) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.backLink}>‹ Назад</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏆 Награди</Text>
      </View>

      {!wallet ? (
        <Text style={[styles.muted, { padding: spacing.lg }]}>Няма връзка със сървъра. Опитай пак след малко.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {/* Ниво */}
          <View style={styles.card}>
            <Text style={styles.levelLine}>Ниво {lvl.level} · {lvl.name}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(lvl.progress * 100)}%` }]} />
            </View>
            <Text style={styles.muted}>
              {lvl.to == null
                ? `Най-високото ниво! Опит: ${wallet.xp}`
                : `Опит ${wallet.xp} · до „${lvl.next_name}“ остават ${lvl.remaining}`}
            </Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>Нивото никога не пада — обменът и глобите вземат само от портфейла.</Text>
          </View>

          {/* Домашни в риск */}
          {wallet.at_risk.length > 0 && (
            <View style={[styles.card, styles.riskCard]}>
              <Text style={styles.riskTitle}>⚠ Точки в риск: −{wallet.at_risk.reduce((s, r) => s + r.amount, 0)}</Text>
              {wallet.at_risk.map((r) => (
                <Text key={r.homework_id} style={styles.riskLine}>
                  • {r.subject || "Домашно"} — срок {r.when} ({r.due_date}). Прати снимка, иначе −{r.amount}.
                </Text>
              ))}
              <TouchableOpacity style={styles.smallBtn} onPress={() => navigation.navigate("Homework")}>
                <Text style={styles.smallBtnText}>Към домашните</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Портфейл и жетони */}
          <View style={styles.row}>
            <View style={[styles.card, styles.half]}>
              <Text style={styles.bigNum}>⭐ {wallet.wallet}</Text>
              <Text style={styles.muted}>точки в портфейла</Text>
            </View>
            <View style={[styles.card, styles.half]}>
              <Text style={styles.bigNum}>🪙 {tokens}</Text>
              <Text style={styles.muted}>жетона</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.bigBtn, wallet.can_exchange < 1 && styles.btnDisabled]}
            onPress={onExchange}
            disabled={busy || wallet.can_exchange < 1}
          >
            <Text style={styles.bigBtnText}>
              {wallet.can_exchange >= 1
                ? `Обмени ${wallet.token_price} ⭐ → 1 🪙`
                : `Още ${toNextToken} ⭐ до следващия жетон`}
            </Text>
          </TouchableOpacity>

          {/* Голяма цел */}
          {shop.goal ? (
            <View style={[styles.card, styles.goalCard]}>
              <Text style={styles.goalLabel}>🎯 ГОЛЯМА ЦЕЛ</Text>
              <Text style={styles.goalTitle}>{shop.goal.title}</Text>
              <View style={styles.goalTrack}>
                <View style={[styles.goalFill, { width: `${Math.min(100, Math.round((shop.goal.saved / shop.goal.cost) * 100))}%` }]} />
                {[0.25, 0.5, 0.75].map((q) => (
                  <View key={q} style={[styles.goalTick, { left: `${q * 100}%` }]} />
                ))}
              </View>
              <Text style={styles.goalNums}>{shop.goal.saved} / {shop.goal.cost} 🪙 в касичката</Text>
              {shop.goal.status === "claimed" ? (
                <Text style={styles.muted}>🎉 Касичката е пълна — чака татко/мама.</Text>
              ) : shop.goal.saved >= shop.goal.cost ? (
                <TouchableOpacity style={styles.bigBtn} onPress={() => runGoal(claimGoal, "Готово", "Заявката е изпратена отново.")} disabled={busy}>
                  <Text style={styles.bigBtnText}>Заяви наградата</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.muted}>
                    Остават {shop.goal.cost - shop.goal.saved} 🪙 ≈ {(shop.goal.cost - shop.goal.saved) * (wallet.token_price || 500)} ⭐
                  </Text>
                  <TouchableOpacity
                    style={[styles.bigBtn, { marginTop: spacing.sm, marginBottom: 0 }, tokens < 1 && styles.btnDisabled]}
                    onPress={() => onDeposit(shop.goal)}
                    disabled={busy || tokens < 1}
                  >
                    <Text style={styles.bigBtnText}>{tokens >= 1 ? "Пусни 1 🪙 в касичката" : "Нямаш свободен жетон"}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (shop.goals || []).length > 0 ? (
            <View style={[styles.card, styles.goalCard]}>
              <Text style={styles.goalLabel}>🎯 ИЗБЕРИ ГОЛЯМА ЦЕЛ</Text>
              <Text style={[styles.muted, { marginBottom: spacing.sm }]}>
                Нещо голямо, за което спестяваш жетони. Изгодно е — излиза по-евтино от магазина.
              </Text>
              {shop.goals.map((g) => (
                <View key={g.id} style={styles.shopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shopTitle}>{g.title}</Text>
                    <Text style={styles.muted}>{g.cost} 🪙</Text>
                  </View>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => onChooseGoal(g)} disabled={busy}>
                    <Text style={styles.smallBtnText}>Избирам</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {/* Магазин */}
          <Text style={styles.sectionTitle}>🎁 Магазин</Text>
          {shop.rewards.map((r) => {
            const can = tokens >= r.cost;
            return (
              <View key={r.id} style={styles.shopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shopTitle}>{r.title}</Text>
                  <Text style={styles.muted}>{r.cost} 🪙</Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallBtn, !can && styles.btnDisabled]}
                  onPress={() => onRequest(r)}
                  disabled={busy || !can}
                >
                  <Text style={styles.smallBtnText}>{can ? "Заяви" : `още ${r.cost - tokens} 🪙`}</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Заявки */}
          {shop.requests.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Моите заявки</Text>
              {shop.requests.slice(0, 10).map((q) => (
                <View key={q.id} style={styles.reqRow}>
                  <Text style={styles.shopTitle}>{q.title}</Text>
                  <Text style={styles.muted}>{(q.kind === "goal" ? GOAL_STATUS_LABEL : STATUS_LABEL)[q.status] || q.status}</Text>
                </View>
              ))}
            </>
          )}

          {/* Глоби */}
          {wallet.penalties.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Глоби</Text>
              {wallet.penalties.slice(0, 10).map((p) => (
                <View key={p.id} style={styles.reqRow}>
                  <Text style={styles.shopTitle}>
                    {p.forgiven ? "↩︎ опростена" : `−${p.amount}`} · {p.subject || "домашно"}
                  </Text>
                  <Text style={styles.muted}>Срок {p.due_date}, не е изпратено навреме</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  backLink: { fontSize: 15, color: colors.primary, fontWeight: "600", paddingVertical: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  levelLine: { fontSize: 20, fontWeight: "800", color: colors.primaryDark, marginBottom: spacing.sm },
  barTrack: { height: 14, borderRadius: 7, backgroundColor: colors.primaryLight, overflow: "hidden", marginBottom: spacing.sm },
  barFill: { height: 14, borderRadius: 7, backgroundColor: colors.primary },
  muted: { fontSize: 13, color: "#6b6a64" },
  riskCard: { backgroundColor: "#FDECEA", borderColor: "#E5A39B" },
  riskTitle: { fontSize: 16, fontWeight: "800", color: "#A3271B", marginBottom: spacing.sm },
  riskLine: { fontSize: 14, color: "#5c1a12", marginBottom: 4 },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1, alignItems: "center" },
  bigNum: { fontSize: 26, fontWeight: "800", color: colors.text },
  bigBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14,
    alignItems: "center", marginBottom: spacing.lg, minHeight: 48, justifyContent: "center",
  },
  bigBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { backgroundColor: "#9aa3ad" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm },
  shopRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  shopTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  smallBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14,
    minHeight: 44, justifyContent: "center", alignSelf: "flex-start", marginTop: 4,
  },
  smallBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  goalCard: { backgroundColor: "#FFF8E1", borderColor: "#F2C94C" },
  goalLabel: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: "#8A6D00", marginBottom: 2 },
  goalTitle: { fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
  goalTrack: { height: 18, borderRadius: 9, backgroundColor: "#F3E3A6", overflow: "hidden", marginBottom: 6 },
  goalFill: { height: 18, borderRadius: 9, backgroundColor: "#F2B705" },
  goalTick: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "rgba(255,255,255,0.8)" },
  goalNums: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: 4 },
  reqRow: {
    backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
});
