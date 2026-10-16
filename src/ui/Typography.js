// src/ui/Typography.js
// Text и TextInput със собствените шрифтове на Учко.
// На Android fontWeight НЕ избира файла на шрифта — всяка дебелина е отделен файл.
// Затова тук fontWeight се превежда в конкретния файл (Nunito_700Bold и т.н.),
// а fontFamily: "display" дава заглавния шрифт Unbounded.
import React, { forwardRef } from "react";
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from "react-native";

const BODY = {
  100: "Nunito_400Regular", 200: "Nunito_400Regular", 300: "Nunito_400Regular",
  400: "Nunito_400Regular", 500: "Nunito_600SemiBold", 600: "Nunito_600SemiBold",
  700: "Nunito_700Bold", 800: "Nunito_800ExtraBold", 900: "Nunito_900Black",
};
const DISPLAY = {
  100: "Unbounded_600SemiBold", 200: "Unbounded_600SemiBold", 300: "Unbounded_600SemiBold",
  400: "Unbounded_600SemiBold", 500: "Unbounded_600SemiBold", 600: "Unbounded_600SemiBold",
  700: "Unbounded_700Bold", 800: "Unbounded_800ExtraBold", 900: "Unbounded_800ExtraBold",
};

function weightNum(w) {
  if (w === "bold") return 700;
  if (w === "normal" || w == null) return 400;
  const n = parseInt(w, 10);
  return Number.isFinite(n) ? n : 400;
}

function withFont(style) {
  const flat = StyleSheet.flatten(style) || {};
  const fam = flat.fontFamily;
  // Изричен друг шрифт (напр. monospace) — не пипаме
  if (fam && fam !== "display" && fam !== "System") return style;
  const table = fam === "display" ? DISPLAY : BODY;
  const { fontWeight, fontFamily, ...rest } = flat;
  return [rest, { fontFamily: table[weightNum(fontWeight)] }];
}

export const Text = forwardRef(function Text({ style, ...props }, ref) {
  return <RNText ref={ref} {...props} style={withFont(style)} />;
});

export const TextInput = forwardRef(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={withFont(style)} />;
});
