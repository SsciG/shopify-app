import { redirect } from "react-router";

export async function loader() {
  // Redirect to the app dashboard
  return redirect("/app");
}
