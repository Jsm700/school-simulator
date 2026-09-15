// app/revive.js
import { useLocalSearchParams, useRouter } from "expo-router";
import LessonReviveScreen from "../src/screens/LessonReviveScreen";

export default function Revive() {
  const { lesson, studentName, studentGender, studentGrade } = useLocalSearchParams();
  const router = useRouter();

  const navigation = {
    goBack: () => router.back(),
    replace: (screen, params) => {
      if (screen === "Quiz") {
        router.replace({
          pathname: "/quiz",
          params: {
            lesson: JSON.stringify(params.lesson),
            studentName: params.studentName,
            studentGender: params.studentGender,
            studentGrade: params.studentGrade,
          },
        });
      }
    },
  };

  const parsedLesson = JSON.parse(lesson);

  return (
    <LessonReviveScreen
      route={{ params: { lesson: parsedLesson, studentName, studentGender, studentGrade } }}
      navigation={navigation}
    />
  );
}
