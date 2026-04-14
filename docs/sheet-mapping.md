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

### 탭별 `gid` 및 스냅샷 (익명 CSV 보내기)

원본이 **링크 공개(보기)** 이면 `export?format=csv&gid={gid}` 로 내려받을 수 있다.  
레포에 고정 복사본은 [sheet-snapshots/README.md](./sheet-snapshots/README.md) 참고.

| `gid` | 스냅샷 파일 | 비고 |
|-------|-------------|------|
| `0` | `gid-0.csv` | 직원정보 |
| `1123805955` | `gid-1123805955.csv` | 월별 지급 격자(간단) |
| `1301218006` | `gid-1301218006.csv` | 월별지급스케줄(+검증·문구) |
| `232333075` … `680592227` | `gid-*.csv` | LEVEL 1~5에 대응하는 규정/직원 격자(탭 순서는 시트 UI와 동일하게 두었음) |
| `659543130` | `gid-659543130.csv` | 취합형 직원별 합계. **1행 헤더 오타 `CDOE` → `CODE` 의미** |
| `798565535` | `gid-798565535.csv` | 자본금·적립 월별(앱 미연결) |
| `645153880` | `gid-645153880.csv` | 빈 보내기(0바이트) — 빈/숨김 탭 가능 |

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
| 미취학아동 | `childrenPreschool` — 시트 헤더 문구(직원 목록 UI·CSV 보내기와 동일). 표시만 `미취학`이면 시트와 어긋남 |
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

## 시트 대비 앱 차이 요약 (2026 스냅샷 기준)

| 구분 | 시트 | 앱 |
|------|------|-----|
| 직원 마스터 | `레벨` 열 없음(LEVEL 탭에서 금액) | `level`, `incentiveAmount` 필드 |
| 직원 CSV 헤더 행 | 3행이 `CODE` 헤더 | 가져오기 시 1행 헤더 |
| 취합 탭 | `CDOE` 오타 컬럼명 | 해당 탭 구조 미러 없음(운영보고는 PB 집계) |
| 적립·자본금 탭 | `gid-798565535` 월별 적립 등 | 미연결 |
| 월별 스케줄 | 일부 셀에 안내 문장(여러 줄) | 숫자 그리드만 |

## CSV 가져오기

헤더 별칭: [csv-import.ts](../src/lib/csv-import.ts) `ALIASES`. 보내기 헤더 순서: `sheetEmployeeExportHeaders(전사설정)` — 조사표 플래그 열(대표반환·배우자수령·근로자 실질 수령)은 전사 설정에서 켠 것만 포함.

**직원정보 탭 원본 CSV:** 1~2행은 표 제목·창립월 등 메타이고, **헤더는 3행**(첫 셀 `CODE`). 앱 CSV 가져오기는 **첫 줄이 헤더**인 파일을 기대하므로, 시트에서 가져올 때는 해당 행만 남기거나 범위를 `CODE` 행부터 보내기한다.
