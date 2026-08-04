"use server";

import { redirect } from "next/navigation";
import { clearSession, findEmployeeByPin, setSessionEmployee } from "@/lib/session";

export async function loginWithPin(formData: FormData) {
  const pin = String(formData.get("pin") ?? "").trim();
  const employee = pin ? await findEmployeeByPin(pin) : null;

  if (!employee) {
    redirect("/?error=pin");
  }

  await setSessionEmployee(employee.id);
  redirect("/pos");
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}
