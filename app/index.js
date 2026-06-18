// app/index.js
import { useRouter } from "expo-router";
import WelcomeScreen from "../src/screens/WelcomeScreen";

export default function Index() {
  const router = useRouter();

  const navigation = {
    navigate: (screen, params) => {
      if (screen === "Quiz") {
        router.push({ pathname: "/quiz", params: { lesson: JSON.stringify(params.lesson), studentName: params.studentName, studentGender: params.studentGender, studentGrade: params.studentGrade } });
      }
    },
  };

  return <WelcomeScreen navigation={navigation} />;
}
