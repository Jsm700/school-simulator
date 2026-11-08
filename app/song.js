// app/song.js
import { useLocalSearchParams, useRouter } from "expo-router";
import SongScreen from "../src/screens/SongScreen";

export default function Song() {
  const { lesson } = useLocalSearchParams();
  const router = useRouter();

  const navigation = {
    goBack: () => router.back(),
  };

  return (
    <SongScreen
      route={{ params: { lesson: JSON.parse(lesson) } }}
      navigation={navigation}
    />
  );
}
