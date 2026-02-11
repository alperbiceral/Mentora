import { Stack } from "expo-router";
import React from "react";
import { AppContainer } from "../components/AppContainer";

export default function RootLayout() {
  return (
    <AppContainer>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </AppContainer>
  );
}
