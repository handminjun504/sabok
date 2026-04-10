# PocketBase 컬렉션 (sabok, `sabok_` 접두사)

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
| clientEntityType   | text | yes  | `INDIVIDUAL` \| `CORPORATE` — 고객사(위탁사) 사업자 유형. **기존 DB**: 마이그레이션 시 일괄 `INDIVIDUAL` 권장 |
| operationMode      | text | yes  | `GENERAL` \| `SALARY_WELFARE` \| `INCENTIVE_WELFARE` \| `COMBINED` — 일반 / 급여낮추기(고위험) / 인센 기금 / 복합. **기존 DB**: 없으면 `GENERAL`, 저장 시 필드 추가 후 기본값 |

**도메인**: 테넌트 1건 ≈ 사업장·기금 1단위(기금 1개/사업장). 코드: `fund-site-model.ts`.

앱은 PB에 필드가 없어도 **조회 시** 기본값(개인·일반운영)으로 동작하지만, **신규 업체 등록(create)** 은 위 두 필드가 컬렉션에 있어야 합니다.

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

데모: `outsourcer@sabok.local` — `accessAllTenants`만 true, `sabok_user_tenants` 없이 로그인 후 업체 선택 가능.

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
| paymentEventDefs           | json | no  | 연도 문자열 키 → `{ eventKey, label, accrualMonth }[]` 배열. 추가 정기 지급 행사(레벨 금액·스케줄). 없으면 `{}` 또는 생략 |

## `sabok_employees`

Prisma 스키마와 동일한 의미의 필드 (숫자 금액은 **number**).

| 필드                  | 타입   | 필수 | 비고 |
|-----------------------|--------|------|------|
| tenantId              | text   | yes  |      |
| employeeCode          | text   | yes  | unique with tenantId |
| name, position        | text   | yes  |      |
| baseSalary, adjustedSalary, welfareAllocation | number | yes | |
| incentiveAmount, discretionaryAmount, optionalWelfareAmount, monthlyPayAmount, quarterlyPayAmount | number | no | `optionalWelfareAmount`는 UI·저장에서 사용하지 않음(항상 null). 선택적 복지는 `sabok_monthly_employee_notes.optionalExtraAmount`로 월별 입력 |
| birthMonth, hireMonth, weddingMonth, payDay | number | no | |
| childrenInfant, childrenPreschool, childrenTeen, parentsCount, parentsInLawCount | number | yes | default 0 |
| insurancePremium, loanInterest | number | yes | |
| level                 | number | yes  | |
| flagAutoAmount, flagRepReturn, flagSpouseReceipt, flagWorkerNet | bool | yes | |

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
| percentInsurance, percentLoanInterest | number | no |
| flatAmount         | number | no   |

Unique: `(tenantId, year, itemKey)`

## `sabok_quarterly_employee_configs`

| 필드         | 타입   | 필수 |
|--------------|--------|------|
| employeeId   | text   | yes  |
| year         | number | yes  |
| itemKey      | text   | yes  |
| paymentMonth | number | yes  |
| amount       | number | yes  |

Unique: `(employeeId, year, itemKey)`

## `sabok_monthly_employee_notes`

| 필드                 | 타입   | 필수 |
|----------------------|--------|------|
| employeeId           | text   | yes  |
| year, month           | number | yes  |
| optionalWelfareText   | text   | no   |
| optionalExtraAmount   | number | no   |

Unique: `(employeeId, year, month)`

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

| 필드                 | 타입   | 필수 | 비고 |
|----------------------|--------|------|------|
| tenantId             | text   | yes  |      |
| vendorId             | text   | yes  |      |
| contributionAmount   | number | yes  | 출연금 C |
| additionalReserved   | number | yes  | 실제 반영된 추가 적립 |
| reserveAfter         | number | yes  | 반영 후 누적 |
| note                 | text   | no   |      |
| occurredAt           | text   | no   | ISO 날짜 문자열(선택) |

Rule: 공개 API는 모두 막고 **Superuser/Admin SDK(Next 서버)** 만 사용하는 것을 권장한다.
