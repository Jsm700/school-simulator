// app/interactive.js
import { useLocalSearchParams, useRouter } from "expo-router";
import InteractiveScreen from "../src/screens/InteractiveScreen";

export default function Interactive() {
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

  return (
    <InteractiveScreen
      route={{ params: { lesson: JSON.parse(lesson), studentName, studentGender, studentGrade } }}
      navigation={navigation}
    />
  );
}
