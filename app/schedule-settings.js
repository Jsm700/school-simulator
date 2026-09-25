// app/schedule-settings.js
import { useLocalSearchParams, useRouter } from "expo-router";
import ScheduleSettingsScreen from "../src/screens/ScheduleSettingsScreen";

export default function ScheduleSettings() {
  const router = useRouter();
  const { childId, childName } = useLocalSearchParams();
  const navigation = { goBack: () => router.back() };
  return (
    <ScheduleSettingsScreen
      navigation={navigation}
      route={{ params: { childId, childName } }}
    />
  );
}
