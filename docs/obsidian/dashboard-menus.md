# 사복(sabok) 대시보드 — 메뉴·기능 맵

> Obsidian 볼트에 그대로 복사해 쓰기 좋도록 마크다운으로 정리했습니다.  
> 내부 링크 예: `[[dashboard-menus#시작]]` 처럼 앵커를 붙여 쓸 수 있습니다.

---

## 권한·역할 (요약)

역할은 **ADMIN / SENIOR / JUNIOR** 이며, `src/lib/permissions.ts` 와 `RBAC_MATRIX` 로 제한됩니다.

| 기능 영역 | 대략적인 권한 |
|-----------|----------------|
| 직원·월별 노트·분기 직원 설정 등 | `canEditEmployees` — 주니어도 대부분 가능 |
| 레벨 규칙·중도 재분배 **적용** | `canEditLevelRules` — 선임·관리자 중심 |
| 전사 설정·적립금 메모 등 | `canEditCompanySettings` — 관리자 중심 |
| GL 동기화 | `canTriggerGlSync` |
| 감사 로그 | 플랫폼 관리자 |

아래 각 항목에서 “편집 가능”은 페이지마다 다를 수 있어, 화면 안내·버튼 비활성을 기준으로 하면 됩니다.

---

## 거래처 미선택(또는 활성 테넌트 없음)

- **플랫폼 관리자 + 단일 테넌트 모드 아님**  
  - [[#시작]] 그룹만: **거래처 선택** (`/dashboard/select-tenant`), **감사 로그** (`/dashboard/audit`)
- **그 외**  
  - 사이드바 메뉴 없음 (선택 화면에서만 이동)

---

## 사이드바 구조 (업체 입장 후)

소스: `src/lib/dashboard-nav.ts` — 그룹 **3개**: **시작 · 업무 · 관리**

### 시작

| 메뉴 | 경로 | 주요 내용 |
|------|------|-----------|
| 대시보드 | `/dashboard` | 요약·지표, 적립 진행 패널, **전사 설정으로 가는 안내**(거래처 프로필은 설정 탭으로 이동됨) |
| 운영상황 보고 | `/dashboard/operating-report` | 운영보고서 탭들(미리보기, 기본정보, 기본재산, 기금운용, 기금재원, 사용현황, 사업실적, 부동산) |

### 업무

| 메뉴 | 경로 | 주요 내용 |
|------|------|-----------|
| 직원 | `/dashboard/employees` | 사복 진행 조사표 맥락의 직원 목록·편집·CSV, 중도변동 시 조정급여 뱃지 등 |
| 지급 규칙 | `/dashboard/rules` | 아래 **탭 4개** 참고. 예전 **분기 지원** 단독 메뉴는 여기로 통합 |
| 월별 스케줄 | `/dashboard/schedule` | 아래 **탭 6개** 참고 |
| 급여포함신고 | `/dashboard/salary-inclusion-report` | 급여 포함 신고 관련 화면 |

### 관리 (역할·플랫폼에 따라 일부만 표시)

| 메뉴 | 경로 | 표시 조건(요약) |
|------|------|-----------------|
| 전사 설정 | `/dashboard/settings` | `canEditCompanySettings` |
| 감사 로그 | `/dashboard/audit` | 플랫폼 관리자 |
| GL 동기화 | `/dashboard/gl` | `canTriggerGlSync` |

---

## 페이지별 탭·세부 기능

### 지급 규칙 (`/dashboard/rules`)

| 탭 | 설명 |
|----|------|
| 레벨별 정기 지급 | 연도·레벨별 정기 지급 금액 규칙 |
| 분기 지원 요율 | 분기 항목별 요율(영유아 등) 매트릭스 |
| 분기 대상자 체크 | 분기 지원 대상 일괄 체크 그리드 |
| 직원별 분기 항목 | 직원·항목별 분기 설정 폼 |

**리다이렉트:** `/dashboard/quarterly` → `/dashboard/rules` (예전 URL 유지)

---

### 월별 스케줄 (`/dashboard/schedule`)

| 탭 | 설명 |
|----|------|
| 월별 스케줄 | 직원별 12개월 지급 합계·내역, 지급완료 표시, **월별 개별 금액 수정 모달**(자연 발생 없는 월에도 항목 추가 가능) |
| 안내 멘트 | 카카오·문자 등 안내 문구 생성 |
| 월별 메모 | 월별 발생 인센 그리드 + 선택적 복지·메모 폼 |
| 적립금 | 자본금 50%·추가 적립 진행 노트 등 |
| 레벨·예정액 | 레벨·연간 예정 사복 등 배정 UI |
| 조정연봉 점검 | 조사표 `adjustedSalary` vs 월별 누적 진단, **재동기화**(개별·일괄) |

---

### 전사 설정 (`/dashboard/settings`)

| 탭 | 설명 |
|----|------|
| 전사 설정 | 회사 단위 설정(창립월, 기준 연도, 정기 귀속월, 급여포함 표시 모드 등) |
| 거래처 프로필 | 거래처(테넌트) 프로필 — 예전 대시보드 홈에 있던 폼이 이쪽으로 이동 |

---

### 운영상황 보고 (`/dashboard/operating-report`)

탭: **미리보기**, **기본정보**, **기본재산**, **기금운용**, **기금재원**, **사용현황**, **사업실적**, **부동산**

---

## 예전 경로(호환)

| 예전 경로 | 현재 |
|-----------|------|
| `/dashboard/quarterly` | `/dashboard/rules` 로 redirect |
| `/dashboard/levels` | `/dashboard/rules` 로 redirect (캐시 무효화도 rules 기준) |

---

## Windows 서버·자동 기동

- [windows-autostart.md](../windows-autostart.md) — CMD 창 없이 시작 프로그램에서 기동하는 방법  
  Obsidian 에서 같은 볼트에 넣었다면 `[[windows-autostart]]` 로 연결 가능(파일명 기준).
- 숨김 PM2 런처: `scripts/windows/start-sabok-pm2-hidden.vbs`

---

## 소스 기준 빠른 참조

| 무엇을 | 파일 |
|--------|------|
| 사이드바 메뉴 정의 | `src/lib/dashboard-nav.ts` |
| 역할별 권한 | `src/lib/permissions.ts`, `src/lib/business-rules.ts` (RBAC) |
| 중도 재분배·월별 개별 수정 | `src/lib/domain/mid-year-rebalance.ts`, `src/app/actions/midYearRebalance.ts` |
| 조정연봉 감사·동기화 | `src/lib/domain/adjusted-salary-audit.ts`, `src/app/actions/adjustedSalaryResync.ts` |
