// app/schedule-settings.js
import { useRouter } from "expo-router";
import ScheduleSettingsScreen from "../src/screens/ScheduleSettingsScreen";

export default function ScheduleSettings() {
  const router = useRouter();
  const navigation = { goBack: () => router.back() };
  return <ScheduleSettingsScreen navigation={navigation} />;
}
