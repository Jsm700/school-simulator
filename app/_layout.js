// app/_layout.js
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="quiz"
          options={{
            animation: "slide_from_right",
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
