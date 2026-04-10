import { redirect } from "next/navigation";

/** 예전 URL 호환: 거래처(업체) 등록은 업체 선택 화면의 + 로만 진행합니다. */
export default function VendorTenantOnboardRedirectPage() {
  redirect("/dashboard/select-tenant");
}
