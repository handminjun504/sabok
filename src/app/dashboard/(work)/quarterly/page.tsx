import { redirect } from "next/navigation";

/** 분기 지원 관련 탭이 '지급 규칙' 페이지로 통합됨 — 예전 URL은 그대로 살려두되 해당 페이지로 보냄. */
export default function QuarterlyPageRedirect() {
  redirect("/dashboard/rules");
}
