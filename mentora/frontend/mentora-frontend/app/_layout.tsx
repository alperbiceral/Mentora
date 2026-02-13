import { Stack } from "expo-router";
import React from "react";
import { AppContainer } from "../components/AppContainer";
import { NotificationsProvider } from "../context/NotificationsContext";
import { ThemeProvider } from "../context/ThemeContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppContainer>
        <NotificationsProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </NotificationsProvider>
      </AppContainer>
    </ThemeProvider>
  );
}
