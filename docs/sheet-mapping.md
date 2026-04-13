# 참고 스프레드시트 구조 → SABOK 매핑

**중요:** SABOK는 **Google Sheets API로 시트와 실시간 연동하지 않습니다.** 아래는 운영에 쓰던 **표 구조·탭 역할·열 이름**을 앱 화면·CSV·도메인 계산에 맞추기 위한 **참고 문서**입니다. 데이터는 항상 PocketBase에만 저장됩니다.

**참고용 원본(편집 링크):** `1P2sHgx6z4MOjYZPSyE8qHrcsD_OUfaDeUfYUJMECQ4w` — [열기](https://docs.google.com/spreadsheets/d/1P2sHgx6z4MOjYZPSyE8qHrcsD_OUfaDeUfYUJMECQ4w/edit)

## 탭(시트) 목록 (htmlview 기준)

| 시트(탭) 이름     | 앱 대응 |
|-------------------|---------|
| 직원정보          | `/dashboard/employees`, `Employee`, CSV 가져오기 |
| LEVEL 1 ~ LEVEL 5 | `/dashboard/levels` (연도·레벨별 정기 지급액) |
| 취합              | `/dashboard/operating-report` (연도·레벨·기금 합계 요약) |
| 월별지급스케줄    | `/dashboard/schedule` |
| 반환분 / 적립액 / 인수 | 미연결 — 시트 수식·정의 확보 후 도메인 추가 검토 |

> 공개 HTML에는 **수식 텍스트가 포함되지 않음**. 엑셀보내기 또는 수식 복사로 역설계 시 이 문서의 「수식」절을 갱신한다.

## 직원정보 탭 — 열 ↔ 모델

| 시트 열(헤더) | PocketBase / 필드 |
|----------------|-------------------|
| CODE | `employeeCode` |
| 이름 | `name` |
| 직급 | `position` |
| 기존연봉 | `baseSalary` |
| 조정급여 | `adjustedSalary` |
| 사복지급분 | `welfareAllocation` |
| 알아서금액 | `discretionaryAmount` |
| 대표반환 | `flagRepReturn` |
| 배우자수령 | `flagSpouseReceipt` |
| 근로자 실질 수령(반환분 제외) | `flagWorkerNet` |
| 입사 월 | `hireMonth` |
| 생일 월만입력 | `birthMonth` |
| 결혼기념월(예정월) | `weddingMonth` |
| 영유아 ~ 시부모님 | `childrenInfant` … `parentsInLawCount` |
| 보험료 | `insurancePremium` |
| 대출이자 | `loanInterest` |
| 급여일 | `payDay` |

**앱 전용(시트 주 표에 없을 수 있음):** `level`(1~5) — 시트는 LEVEL 탭으로 금액을 두는 구조. `incentiveAmount`(예상 인센) — 급여포함신고 상한용.

상단 **회사창립월** → `CompanySettings.foundingMonth` (`/dashboard/settings`).

## 계산 로직 (앱 도메인)

| 시트에서 기대되는 집계 | 코드 위치 |
|------------------------|-----------|
| 월별 정기·분기·선택 복지 | `buildMonthlyBreakdown`, `computeActualYearlyWelfareForEmployee` — [schedule.ts](../src/lib/domain/schedule.ts) |
| 지급월 누적 실지급 | `computeActualWelfareThroughPaidMonth` |
| 상한·초과·미달 | `resolveSalaryInclusionCap`, `computeSalaryInclusionVsActual` |
| 인센→사복 차액 | `computeIncentiveWelfareSalaryInclusionYtd` + 월별 노트 필드 |
| 운영 요약(레벨별 연간 기금 합) | `computeLevelWelfareAggregates` — [sheet-aggregate.ts](../src/lib/domain/sheet-aggregate.ts) |

## CSV 가져오기

헤더 별칭: [csv-import.ts](../src/lib/csv-import.ts) `ALIASES`. 보내기 헤더 순서: `SHEET_EMPLOYEE_EXPORT_HEADERS`.
