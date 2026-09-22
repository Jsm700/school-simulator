// app/dnes.js
import { useRouter } from "expo-router";
import DnesScreen from "../src/screens/DnesScreen";

export default function Dnes() {
  const router = useRouter();

  const navigation = {
    goBack: () => router.back(),
    navigate: (screen, params) => {
      if (screen === "Quiz") {
        router.push({
          pathname: "/quiz",
          params: {
            lesson: JSON.stringify(params.lesson),
            studentName: params.studentName,
            studentGender: params.studentGender,
            studentGrade: params.studentGrade,
          },
        });
      } else if (screen === "Revive") {
        router.push({
          pathname: "/revive",
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

  return <DnesScreen navigation={navigation} />;
}
