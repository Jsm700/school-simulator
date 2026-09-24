// app/homework.js
import { useRouter } from "expo-router";
import HomeworkScreen from "../src/screens/HomeworkScreen";

export default function Homework() {
  const router = useRouter();

  const navigation = {
    goBack: () => router.back(),
  };

  return <HomeworkScreen navigation={navigation} />;
}
