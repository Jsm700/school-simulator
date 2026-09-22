// app/index.js
import { useRouter } from "expo-router";
import WelcomeScreen from "../src/screens/WelcomeScreen";

export default function Index() {
  const router = useRouter();

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

  return <WelcomeScreen navigation={navigation} />;
}
