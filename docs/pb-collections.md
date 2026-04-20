# PocketBase 컬렉션 (sabok, `sabok_` 접두사)

참고 스프레드시트(사복 진행 조사표) **열·필드 대응**(연동 아님)은 **[sheet-mapping.md](./sheet-mapping.md)** 를 본다.

Admin UI → Collections에서 **Base** 타입으로 생성한다. 인증은 사용하지 않는다(`sabok_users`는 일반 컬렉션, 비밀번호는 `passwordHash`에 bcrypt).

모든 컬렉션은 PB가 부여하는 **`id`**, **`created`**, **`updated`** 필드를 가진다. 앱에서는 필요 시 `created`를 감사 표시용 시각으로 사용한다.

필드 타입: `text`, `number`, `bool`, `json` (Date는 **text**로 ISO 저장하거나 PB **date** 타입 사용 — 아래는 **date** 권장).

## 공통

- **Unique 인덱스**: 각 테이블 아래에 표기한 필드(조합)에 Admin에서 Unique 인덱스 추가.

**내부 단일 업체**: 배포 `.env`에 `SABOK_SINGLE_TENANT_ID=<sabok_tenants 레코드 id>` 를 넣으면 거래처 선택·관리 UI가 숨겨지고, 로그인 시 항상 그 테넌트로 고정된다. `sabok_vendors`는 그 사업장(테넌트) 기금에 대한 **출연 상대(출연처)** 로 계속 쓰면 된다.

## `sabok_tenants`

| 필드               | 타입 | 필수 | 비고        |
|--------------------|------|------|-------------|
| code               | text | yes  | unique      |
| name               | text | yes  |             |
| active             | bool | yes  | default true |
| memo               | text | no   |             |
| clientEntityType   | text | yes  | `INDIVIDUAL` \| `CORPORATE`(권장, 대소문자 무관) — **개인·법인 적립 구분**. PB에 `법인`/`개인` 한글만 있어도 앱 조회 시 정규화됨. 저장 시 앱은 대문자 영문으로 보냄 |
| operationMode      | text | yes  | `GENERAL` \| `SALARY_WELFARE` \| `INCENTIVE_WELFARE` \| `COMBINED` — 일반 / 급여낮추기(고위험) / 인센 기금 / 복합. **기존 DB**: 없으면 `GENERAL`, 저장 시 필드 추가 후 기본값 |
| approvalNumber     | text | no   | 인가번호 등 위탁·등록 식별 문자열 |
| businessRegNo      | text | no   | 사업자등록번호(표시·검색용, 형식 자유) |
| headOfficeCapital  | number | no | 본사 자본금(원). 미입력 시 null |
| announcementMode   | text | no   | 안내 멘트 기본 모드. `SINGLE`(매 달 하나씩) \| `BATCHED`(여러 달 한 번에). 없으면 `SINGLE` 로 동작 |
| announcementBatchFromMonth | number | no | 묶음 모드 기본 시작 월(1~12). 없으면 UI 기본 1 |
| announcementBatchToMonth   | number | no | 묶음 모드 기본 끝 월(1~12). 없으면 UI 기본 3 |

**도메인**: 테넌트 1건 ≈ 사업장·기금 1단위(기금 1개/사업장). 코드: `fund-site-model.ts`.

앱은 PB에 필드가 없어도 **조회 시** 기본값(개인·일반운영)으로 동작하지만, **신규 업체 등록(create)** 은 `clientEntityType`, `operationMode`가 컬렉션에 있어야 합니다. 선택 필드 `approvalNumber`, `businessRegNo`, `headOfficeCapital`를 폼에서내려면 Admin에서 동일 이름으로 필드를 추가하세요(없으면 create 시 400).

## `sabok_users`

| 필드             | 타입 | 필수 | 비고        |
|------------------|------|------|-------------|
| email            | text | yes  | unique      |
| passwordHash     | text | yes  | bcrypt      |
| name             | text | yes  |             |
| role             | text | yes  | ADMIN/SENIOR/JUNIOR |
| isPlatformAdmin  | bool | yes  | default false |
| accessAllTenants | bool | yes  | default false — true면 활성 업체 전환·업무 데이터 접근(고객사별 직원 등). 플랫폼 메뉴(업체/감사)는 `isPlatformAdmin`만 |

**권한 요약**

- `isPlatformAdmin`: 전 업체 목록·업무 접근 + **업체 관리·감사 로그** 등 플랫폼 메뉴. `sabok_users` 계정 생성은 앱이 아니라 **PocketBase Admin·시드(`pb:seed`)·`pb-create-user` 스크립트**로 한다.
- `accessAllTenants` (아웃소싱 대리): `user_tenants` 없이도 **활성 업체 전환 + 업무 메뉴만** (역할은 `role` 필드 기준).
- 일반 사용자가 **특정 업체만** 접근해야 할 때는 `sabok_user_tenants`에 행을 두면 된다(앱 UI에서는 배정 폼을 제공하지 않음 · 시드/스크립트/PB Admin 등).
- 둘 다 false면 기존처럼 `sabok_user_tenants`로 허용 업체만.

시드(`pb:seed`) 실패 시 400 + `isPlatformAdmin` / `accessAllTenants` 오류면, Admin에서 해당 필드가 **bool·필수**로 존재하는지 확인한다(없으면 추가).

시드(`pb:seed`) 기본 계정: `admin@reversep.local` · `senior@reversep.local` · `junior@reversep.local` — 비밀번호는 `SABOK_SEED_PASSWORD` 환경변수 또는 스크립트 기본값(콘솔 안내). 예전 `*@sabok.local` 시드 계정은 시드 실행 시 삭제됩니다.

## `sabok_user_tenants`

| 필드     | 타입 | 필수 | 비고 |
|----------|------|------|------|
| userId   | text | yes  |      |
| tenantId | text | yes  |      |
| role     | text | yes  |      |

Unique: `(userId, tenantId)`

## `sabok_company_settings`

| 필드                       | 타입 | 필수 | 비고 |
|----------------------------|------|------|------|
| tenantId                   | text | yes  | unique |
| foundingMonth              | number | yes | default 1 |
| defaultPayDay              | number | yes | default 25 |
| activeYear                 | number | yes | |
| accrualCurrentMonthPayNext | bool | yes | default false |
| salaryInclusionVarianceMode | text | no | `BOTH` \| `OVER_ONLY` \| `UNDER_ONLY` — 급여포함신고·월별 스케줄에서 상한 대비 **초과·미달 열** 표시 방식. 없으면 앱에서 `BOTH`로 취급 |
| surveyShowRepReturn | bool | no | 조사표·직원 목록·CSV·직원 폼에 **대표반환** 표시. 없으면 `false` |
| surveyShowSpouseReceipt | bool | no | **배우자수령** 표시. 없으면 `false` |
| surveyShowWorkerNet | bool | no | **근로자 실질 수령** 표시. 없으면 `false` |
| paymentEventDefs           | json | no  | 연도 문자열 키 → `{ eventKey, label, accrualMonth }[]` 배열. 추가 정기 지급 행사(레벨 금액·스케줄). 없으면 `{}` 또는 생략 |
| reserveProgressNote        | text | no  | 월별 스케줄 **적립금** 탭에서 저장하는 자유 메모(남은 적립 한도 등). 없으면 앱에서 `null` |

> **Nonempty:** `accrualCurrentMonthPayNext`·`surveyShow*` 등 bool 에 Nonempty를 켜면 `false` 가 거절됩니다. **Nonempty 끄기** 권장.  
> 일괄 보정: `npm run pb:fix-company-settings-schema` (`sabok_company_settings` 의 number/bool required 해제). 신규 생성만 `false` 거절 시 앱이 `true` 로 재시도하는 경로가 있습니다.

## `sabok_employees`

Prisma 스키마와 동일한 의미의 필드 (숫자 금액은 **number**).

> **PocketBase Nonempty(필수) 주의**  
> 앱은 아래 숫자·불리언 필드에 **0·false** 를 정상 값으로 보냅니다(예: 조정급여 미입력=0, 자녀 0명, 플래그 해제=false).  
> PocketBase에서 해당 필드에 **Nonempty** 를 켜 두면 `0`·`false` 가 “비어 있음”으로 거절되어 `Cannot be blank` / `Missing required value` 가 납니다.  
> **해결:** 이 컬렉션의 `number`·`bool` 필드(급여·자녀·부모 수·보험/이자·플래그 등)에서는 **Nonempty를 끄고**, 숫자 범위만 필요하면 Min/Max를 쓰세요.  
> **일괄 보정(권장):** 배포 서버에서 Admin 자격으로 실행(`scripts/pb-fix-employees-schema.mjs`, 대상 컬렉션은 `PB_FIX_COLLECTION`으로 지정 가능).  
> `sabok_employees`: `npm run pb:fix-employees-schema` · `sabok_company_settings`: `npm run pb:fix-company-settings-schema` · `sabok_quarterly_employee_configs`(amount 0 등): `npm run pb:fix-quarterly-schema` · `sabok_level_payment_rules`: `npm run pb:fix-level-rules-schema` · `sabok_level5_overrides`: `npm run pb:fix-level5-schema`.  
> **verbose / dry-run (macOS·Linux·Windows 공통):** `npm run pb:fix-employees-schema:verbose`, `npm run pb:fix-employees-schema:dry`  
> **verbose 환경변수:** `PB_VERBOSE` 또는 **동일 의미의 `PB_FIX_VERBOSE`**.  
> **Windows만 (환경변수 문법):** CMD — `set PB_VERBOSE=1 && npm run pb:fix-employees-schema` · PowerShell — `$env:PB_VERBOSE='1'; npm run pb:fix-employees-schema`  
> 스크립트는 **`process.exit()`를 쓰지 않고** 종료해 Windows에서 libuv `UV_HANDLE_CLOSING` 단언 오류를 줄입니다.  
> (공식 설명: [Required Number and Boolean Fields](https://github.com/pocketbase/pocketbase/issues/526) — “Required/Nonempty”는 Go 제로값 기준으로 `0`·`false` 를 허용하지 않음.)

| 필드                  | 타입   | 앱에서 항상 전송 | 비고 |
|-----------------------|--------|------------------|------|
| tenantId              | text   | yes  |      |
| employeeCode          | text   | yes  | unique with tenantId |
| name, position        | text   | yes  |      |
| baseSalary, adjustedSalary, welfareAllocation | number | yes | PB에서는 **Nonempty 끄기** (조정급여 0 = 기존연봉만 사용) |
| incentiveAmount, discretionaryAmount, optionalWelfareAmount, monthlyPayAmount, quarterlyPayAmount | number | 선택 | `optionalWelfareAmount`는 UI·저장에서 사용하지 않음(항상 null). 선택적 복지는 `sabok_monthly_employee_notes.optionalExtraAmount`로 월별 입력 |
| priorOverpaidWelfareWon | number | 선택 | **전기에 사복으로 더 받은 금액(원)**. 입력하면 이번 기 사복지급분 상한이 자동으로 그만큼 차감되어 급여포함신고·상한 초과/미달 계산에 즉시 반영. **기존 DB**: Admin에서 number 필드로 추가(Nonempty 끔). 없으면 null·차감 없음 |
| birthMonth, hireMonth, hireYear, resignMonth, resignYear, weddingMonth, payDay | number | 선택 | **퇴사·연도 처리**: `resignYear` 가 활성 연도보다 이전이면 그 해는 모든 정기·분기·월별 노트가 0(스케줄·운영 보고·안내 멘트에서 자동 제외). 같은 해면 `resignMonth` 다음 달부터 비활성. `hireYear` 이전 연도는 “입사 전”으로 똑같이 0. **기존 DB**: Admin에서 `hireYear`, `resignYear` 두 number 필드를 새로 추가(Nonempty 끔). `resignMonth` 만 있고 `resignYear` 가 없으면 사고 방지를 위해 무시되니 둘 다 채워야 적용된다 |
| childrenInfant, childrenPreschool, childrenTeen, parentsCount, parentsInLawCount | number | yes | 0 허용 → PB **Nonempty 끄기** |
| insurancePremium, loanInterest | number | yes | 0 허용 → PB **Nonempty 끄기**. 분기 템플릿 건강보험·주택이자는 **발생액**과 비교 |
| monthlyRentAmount | number | no | 월세 등 월 단위 발생액. `HOUSING_RENT` 분기 항목과 한도 `min` |
| expectedYearlyWelfare | number | no | 연간 지급 예정액(원). 월별 스케줄「레벨·예정액」탭·직원 폼에서 입력, 레벨 규칙 합과 비교해 추천 레벨 산출. **Nonempty 끄기** |
| level                 | number | yes  | |
| flagAutoAmount, flagRepReturn, flagSpouseReceipt, flagWorkerNet | bool | yes | false 허용 → PB **Nonempty 끄기** |
| salaryInclusionVarianceMode | text | no | `BOTH` · `OVER_ONLY` · `UNDER_ONLY`. 급여포함신고·스케줄에서 초과·미달 열 표시. **비우면** 전사 `sabok_company_settings.salaryInclusionVarianceMode`와 동일. Admin에서 선택(text) 필드 추가 |

Unique: `(tenantId, employeeCode)`

## `sabok_level_payment_rules`

| 필드     | 타입   | 필수 |
|----------|--------|------|
| tenantId | text   | yes  |
| year     | number | yes  |
| level    | number | yes  |
| eventKey | text   | yes  |
| amount   | number | yes  |

Unique: `(tenantId, year, level, eventKey)`

## `sabok_level5_overrides`

| 필드       | 타입   | 필수 |
|------------|--------|------|
| employeeId | text   | yes  |
| year       | number | yes  |
| eventKey   | text   | yes  |
| amount     | number | yes  |

Unique: `(employeeId, year, eventKey)`

## `sabok_level_targets`

| 필드          | 타입   | 필수 |
|---------------|--------|------|
| tenantId      | text   | yes  |
| year          | number | yes  |
| level         | number | yes  |
| targetAmount  | number | yes  |

Unique: `(tenantId, year, level)`

## `sabok_quarterly_rates`

| 필드               | 타입   | 필수 |
|--------------------|--------|------|
| tenantId           | text   | yes  |
| year               | number | yes  |
| itemKey            | text   | yes  |
| amountPerInfant …  | number | no   |
| percentInsurance, percentLoanInterest | number | no | PB 필드명은 레거시. **의미: 건강보험·주택이자 각각 기금 지급 한도(원)** = min(직원 발생액, 한도) |
| flatAmount         | number | no   | 기타 정액 행·**월세(HOUSING_RENT) 지급 한도(원)** |

Unique: `(tenantId, year, itemKey)`

## `sabok_quarterly_employee_configs`

| 필드         | 타입   | 필수 |
|--------------|--------|------|
| employeeId   | text   | yes  |
| year         | number | yes  |
| itemKey      | text   | yes  |
| paymentMonth | number | yes  | 호환·정렬용: `paymentMonths`의 첫 달과 동일 권장 |
| paymentMonths | **json** | **반드시 추가** | 지급 반영 월 배열 `[3,6,9,12]` 등. **없으면 첫 달만 저장되어 “지급월 선택이 반영 안 됨” 증상이 생김.** Admin → Edit collection → Add field → type=`json`, name=`paymentMonths`, Required 끔 |
| amount       | number | yes  |

Unique: `(employeeId, year, itemKey)`

## `sabok_monthly_employee_notes`

| 필드                 | 타입   | 필수 |
|----------------------|--------|------|
| employeeId           | text   | yes  |
| year, month           | number | yes  |
| optionalWelfareText   | text   | no   |
| optionalExtraAmount   | number | no   |
| incentiveAccrualAmount | number | no | 월별 **발생 인센**. 인센→사복 시 급여포함 차액(발생 누적 − 사복지급 누적) 계산에 사용 |
| incentiveWelfarePaymentAmount | number | no | 그 달 **사복으로 지급하기로 한 인센** 금액 |

Unique: `(employeeId, year, month)`

> **기존 DB:** Admin에서 `incentiveAccrualAmount`, `incentiveWelfarePaymentAmount` number 필드를 추가하세요(Nonempty 끔). 없으면 앱 조회 시 null로 취급되나, **저장(create/update)** 시 PB가 필드를 모르면 400이 납니다.

## `sabok_audit_logs`

| 필드     | 타입 | 필수 |
|----------|------|------|
| tenantId | text | no   |
| userId   | text | no   |
| action   | text | yes  |
| entity   | text | yes  |
| entityId | text | no   |
| payload  | json | no   |

## `sabok_gl_sync_jobs`

| 필드     | 타입 | 필수 |
|----------|------|------|
| tenantId | text | yes  |
| status   | text | yes  |
| payload  | json | no   |
| error    | text | no   |

## `sabok_vendors` (출연 상대 / 출연처)

**출연처**: 본사 등 출연 주체를 개인/법인으로 구분해 둔 상대.

| 필드                | 타입   | 필수 | 비고 |
|---------------------|--------|------|------|
| tenantId            | text   | yes  |      |
| code                | text   | yes  | 테넌트 내 unique |
| name                | text   | yes  |      |
| businessType        | text   | yes  | `INDIVIDUAL` \| `CORPORATE` |
| workplaceCapital    | number | yes  | 법인: 자본금(원). 개인: 0 |
| accumulatedReserve  | number | yes  | 추가 적립 누적, default 0 |
| active              | bool   | yes  | default true |
| memo                | text   | no   |      |

Unique: `(tenantId, code)`

## `sabok_vendor_contributions` (출연금 이력 — 기금 유입 기록)

통상 출연 실무는 본사에서 하며, 이 테이블은 그 사업장 기금으로 반영되는 출연액·추가 적립 결과를 남긴다.

**출연금 C**는 해당 월에 레벨 1, 2, 3, 4, 5 직원에게 입금할 총 금액을 뜻한다(도메인 정의는 `src/lib/domain/vendor-reserve.ts` 주석 참고).

| 필드                 | 타입   | 필수 | 비고 |
|----------------------|--------|------|------|
| tenantId             | text   | yes  |      |
| vendorId             | text   | yes  |      |
| contributionAmount   | number | yes  | 출연금 C(해당 월 레벨 1~5 직원 입금 합계) |
| additionalReserved   | number | yes  | 실제 반영된 추가 적립 |
| reserveAfter         | number | yes  | 반영 후 누적 |
| note                 | text   | no   |      |
| occurredAt           | text   | no   | ISO 날짜 문자열(선택) |

추가 적립 산식: 앱은 `src/lib/domain/vendor-reserve.ts`의 `computeAdditionalReserve`를 따른다. **법인**은 출연금 C의 20%를 본사 자본금의 50% 누적까지 추가 적립하고 상한 도달 후에는 추가 적립 없음. **개인**은 매 출연금(월)마다 항상 C의 20% 추가 적립. 서버 기록 시 거래처(`sabok_tenants`)의 `clientEntityType`·`headOfficeCapital`을 우선한다.

Rule: 공개 API는 모두 막고 **Superuser/Admin SDK(Next 서버)** 만 사용하는 것을 권장한다.
