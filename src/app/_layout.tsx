import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as SplashScreen from "expo-splash-screen";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppProvider } from "@/state/app-context";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AppProvider>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="praktikan" />
          <Stack.Screen name="asisten" />
        </Stack>
      </AppProvider>
    </ThemeProvider>
  );
}
