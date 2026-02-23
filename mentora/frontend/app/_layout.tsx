import { Stack } from "expo-router";
import React from "react";
import { AppContainer } from "../components/AppContainer";
import { ThemeProvider } from "../theme/ThemeProvider";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppContainer>
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </AppContainer>
    </ThemeProvider>
  );
}
