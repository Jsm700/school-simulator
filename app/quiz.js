// app/quiz.js
import { useLocalSearchParams, useRouter } from "expo-router";
import QuizScreen from "../src/screens/QuizScreen";

export default function Quiz() {
  const { lesson } = useLocalSearchParams();
  const router = useRouter();

  const navigation = {
    goBack: () => router.back(),
  };

  const parsedLesson = JSON.parse(lesson);

  return <QuizScreen route={{ params: { lesson: parsedLesson } }} navigation={navigation} />;
}
