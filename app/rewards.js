// app/rewards.js
import { useRouter } from "expo-router";
import RewardsScreen from "../src/screens/RewardsScreen";

export default function Rewards() {
  const router = useRouter();
  const navigation = {
    goBack: () => router.back(),
    navigate: (screen) => {
      if (screen === "Homework") router.push({ pathname: "/homework" });
    },
  };
  return <RewardsScreen navigation={navigation} />;
}
