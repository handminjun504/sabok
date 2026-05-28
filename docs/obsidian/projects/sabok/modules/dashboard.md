# 대시보드·네비게이션

## 역할

대시보드 셸·사이드바 그룹(업무/관리), 역할·테넌트 유무에 따른 메뉴 구성.

## 주요 함수/클래스

- `getDashboardNav` — `src/lib/dashboard-nav.ts`
- `DashboardShell` — `src/components/DashboardShell.tsx`
- 대시보드 레이아웃 — `src/app/dashboard/layout.tsx`

## 의존성

- [[sabok/modules/tenant-context|테넌트·접근 제어]] — `hasActiveTenant`, 역할
- `src/lib/permissions.ts` — RBAC

## 관련 파일

- `src/lib/dashboard-nav.ts`
- `src/components/DashboardShell.tsx`
- `src/app/dashboard/layout.tsx`
- 저장소 `docs/obsidian/dashboard-menus.md`(메뉴 맵)

## 상위 문서

- [[sabok/architecture|sabok 개요]]
