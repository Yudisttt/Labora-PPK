/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#4C3D19",
    background: "#E5D7C4",
    backgroundElement: "#E5D7C4",
    backgroundSelected: "#E5D7C4",
    textSecondary: "#354024",
    moss: "#889063",
    border: "#889063",
    primary: "#354024",
    primaryText: "#E5D7C4",
    success: "#354024",
    successSoft: "#E5D7C4",
    warning: "#4C3D19",
    warningSoft: "#CFBB99",
    danger: "#B42318",
    dangerSoft: "#FDECEA",
  },
  dark: {
    text: "#4C3D19",
    background: "#E5D7C4",
    backgroundElement: "#E5D7C4",
    backgroundSelected: "#E5D7C4",
    textSecondary: "#354024",
    moss: "#889063",
    border: "#889063",
    primary: "#354024",
    primaryText: "#E5D7C4",
    success: "#354024",
    successSoft: "#E5D7C4",
    warning: "#4C3D19",
    warningSoft: "#CFBB99",
    danger: "#B42318",
    dangerSoft: "#FDECEA",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  mono: Platform.select({ ios: "ui-monospace", default: "monospace" }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
