// app/_layout.js
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// Внасяме само нужните дебелини (не целия пакет), за да не набъбва APK-то
import { Nunito_400Regular } from "@expo-google-fonts/nunito/400Regular";
import { Nunito_600SemiBold } from "@expo-google-fonts/nunito/600SemiBold";
import { Nunito_700Bold } from "@expo-google-fonts/nunito/700Bold";
import { Nunito_800ExtraBold } from "@expo-google-fonts/nunito/800ExtraBold";
import { Nunito_900Black } from "@expo-google-fonts/nunito/900Black";
import { Unbounded_600SemiBold } from "@expo-google-fonts/unbounded/600SemiBold";
import { Unbounded_700Bold } from "@expo-google-fonts/unbounded/700Bold";
import { Unbounded_800ExtraBold } from "@expo-google-fonts/unbounded/800ExtraBold";

export default function Layout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
    Unbounded_600SemiBold, Unbounded_700Bold, Unbounded_800ExtraBold,
  });
  // Шрифтовете са в самия APK — зареждат се за части от секундата. При грешка продължаваме със системния.
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="revive"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="quiz"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="interactive"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="dnes"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="rewards"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="schedule-settings"
          options={{
            animation: "slide_from_right",
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
