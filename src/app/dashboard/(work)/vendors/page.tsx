import { redirect } from "next/navigation";

/** 출연처 기능 미사용 — 예전 URL은 대시보드로 보냅니다. */
export default function VendorsPageRedirect() {
  redirect("/dashboard");
}
