import { Redirect } from "expo-router";

export default function Index() {
  // Check if user is authenticated
  const token =
    typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;

  // If authenticated, go to home; otherwise go to login
  return <Redirect href={token ? "/home" : "/login"} />;
}
