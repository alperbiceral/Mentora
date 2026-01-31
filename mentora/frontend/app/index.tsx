import { Redirect } from "expo-router";

export default function Index() {
  // İlk açılışta login ekranına yönlendir
  return <Redirect href="/login" />;
}
