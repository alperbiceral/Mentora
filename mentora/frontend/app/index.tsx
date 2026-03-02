import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const [target, setTarget] = useState<"/auth" | "/(tabs)" | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("mentora.username")
      .then((username) => {
        setTarget(username ? "/(tabs)" : "/auth");
      })
      .catch(() => setTarget("/auth"));
  }, []);

  if (!target) {
    // Still reading AsyncStorage — render nothing while we check
    return null;
  }

  return <Redirect href={target} />;
}
