import { redirect } from "react-router";
import { logout } from "../auth.server";

export const loader = async () => {
  return redirect("/");
};

export const action = async ({ request }) => {
  return logout(request);
};
