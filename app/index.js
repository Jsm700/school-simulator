// app/index.js
import React, { useState, useEffect, useCallback } from "react";
import { ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import WelcomeScreen from "../src/screens/WelcomeScreen";
import ConnectDeviceScreen from "../src/screens/ConnectDeviceScreen";
import ParentDashboardScreen from "../src/screens/ParentDashboardScreen";
import { getLinkedDevice } from "../src/services/deviceLink";
import { colors } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [linked, setLinked] = useState(null); // null докато проверяваме, обект след това

  const check = useCallback(async () => {
    const link = await getLinkedDevice();
    setLinked(link);
    setChecking(false);
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const navigation = {
    navigate: (screen, params) => {
      if (screen === "Quiz") {
        router.push({ pathname: "/quiz", params: { lesson: JSON.stringify(params.lesson), studentName: params.studentName, studentGender: params.studentGender, studentGrade: params.studentGrade } });
      } else if (screen === "Revive") {
        router.push({ pathname: "/revive", params: { lesson: JSON.stringify(params.lesson), studentName: params.studentName, studentGender: params.studentGender, studentGrade: params.studentGrade } });
      } else if (screen === "Dnes") {
        router.push({ pathname: "/dnes" });
      } else if (screen === "ScheduleSettings") {
        router.push({ pathname: "/schedule-settings" });
      }
    },
  };

  if (checking) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!linked) {
    return <ConnectDeviceScreen onLinked={(link) => setLinked(link)} />;
  }

  if (linked.role === "parent") {
    return <ParentDashboardScreen />;
  }

  return <WelcomeScreen navigation={navigation} />;
}
