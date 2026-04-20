import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "사내근로복지기금 관리",
  description: "사내근로복지기금 운영·관리",
  icons: { icon: "/favicon.ico" },
};

/**
 * 한국어 SaaS 가독성 표준인 Pretendard Variable 을 jsDelivr CDN 으로 로드.
 * - 가변 폰트라 단일 woff2 로 모든 굵기 커버
 * - `font-display: swap` 으로 첫 페인트 차단 회피
 *
 * (참고) `next/font` 는 Pretendard 가 Google Fonts 에 없어 직접 self-host 가 필요한데,
 *  CDN 캐시 효율과 운영 단순성을 우선해 `<link>` 방식으로 둔다.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
