# PLAN — 한붓 챌린지 구현 계획

PRD v1.0 (2026-09-01) → 구현 계획. PRD 8.4의 태스크 분할을 그대로 따르되,
각 단계의 산출물과 "무엇으로 끝났다고 판단하는가"를 못 박았다.

## 0. 설계 원칙

1. **수학이 먼저다.** 스테이지가 실제로 풀리는지를 UI보다 먼저 증명한다.
   `lib/graph.ts`와 그 유닛테스트가 통과하기 전에는 화면을 만들지 않는다 (AC-04).
2. **게임은 네트워크에 의존하지 않는다.** Firebase가 없거나 끊겨도 12스테이지 전부
   플레이할 수 있어야 한다 (PRD 7.3 / AC-07). 따라서 그래프·점수·진행 상태는
   순수 함수와 로컬 상태로만 만들고, Firestore는 그 위에 얹는 저장 계층으로 둔다.
3. **교실 기기가 기준이다.** 스마트폰 세로 360~430px에서 손가락으로 정확히 되는지가
   합격선이다. Pointer Events 하나로 터치·마우스·펜을 처리한다.
4. **실패를 나무라지 않는다.** 인접하지 않은 점으로 끌면 오답이 아니라 무시다.
   막힘 안내 문구에 부정 표현을 쓰지 않는다 (PRD 7.4).

## 1. 단계별 계획

| # | 단계 | 산출물 | 완료 판정 |
|---|---|---|---|
| 1 | 프로젝트 셋업 | Vite + React + TS + Tailwind v4 + React Router, `src/data/stages.json` (12 + 보너스 2) | `npm run build` 통과, 스키마가 `types.ts`와 일치 |
| 2 | 그래프 코어 | `lib/graph.ts`, `lib/generator.ts` + 유닛테스트 | 모든 스테이지가 `validateStage()` 통과, 선언한 tier와 실제 오일러 판정 일치 (AC-04) |
| 3 | 캔버스 | `components/GameCanvas.tsx`, `lib/geometry.ts`, `hooks/usePointerDraw.ts` | 히트 영역 ≥ 44 CSS px, 다중 간선이 곡률로 구분됨 |
| 4 | 게임 엔진 | `hooks/useGameEngine.ts` | 진행·undo·막힘·클리어 판정. S06을 짝수점에서 시작하면 반드시 막힘 (AC-03) |
| 5 | 결과·점수 | `lib/scoring.ts`, `pages/Result.tsx` | PRD 3.4 산식과 별점 규칙이 테스트로 고정됨 |
| 6 | Firebase | `lib/firebase.ts`, `lib/repository.ts`, 오프라인 큐 | 익명 인증, students/plays 읽고 쓰기, 끊겨도 플레이 지속 (AC-07) |
| 7 | 스테이지 선택 | `pages/StageSelect.tsx`, `components/StageCard.tsx` | 잠금·별점·최고 기록 표시, 3탭 안에 첫 스테이지 시작 (AC-01) |
| 8 | 대시보드 | `components/Dashboard/DashboardTabs.tsx`, `pages/Dashboard.tsx` | 4개 탭, 화면 이탈 시 리스너 해제 |
| 9 | 판별 미션 | `pages/JudgeBoard.tsx`, `components/decor/*` | S11·B01에서 가능/불가능 + 최소 붓 + 해설 카드 |
| 10 | 교사 모드 | `pages/Teacher.tsx` | PIN 게이트, 설정 4종, 스테이지 활성화, CSV, 개별 삭제 |
| 11 | 반응형 QA | — | 세로/가로/태블릿/데스크톱 스크린샷 확인 |
| 12 | 배포 준비 | `vercel.json`, `firestore.rules`, `firestore.indexes.json`, README | 색인 차단, 규칙·인덱스 문서화 |

## 2. 아키텍처 결정과 근거

### 2.1 스테이지 데이터는 정적 JSON
PRD 4.3 그대로. `src/data/stages.json`을 번들에 포함해 읽기 비용을 0으로 만든다.
`data/stages.ts`가 타입을 입히고, 개발 모드 기동 시 `validateStage()`로 자가 검사한다.
배포 빌드는 유닛테스트가 막는다 — 데이터 오류로 못 푸는 스테이지가 나가는 사고 방지.

### 2.2 힌트는 "갈 수 있는 곳"이 아니라 "가도 되는 곳"
단순히 인접한 미사용 간선을 다 보여주면, 학생이 힌트를 따라갔는데 막히는 일이 생긴다.
`hintEdges()`는 각 선택지를 가정해 본 뒤 남은 그래프에 아직 오일러 경로가 남는지를
확인해서(사실상 Fleury의 다리 규칙) 살아 있는 선택지만 반짝인다.

### 2.3 Firebase는 동적 import
Firestore + Auth SDK는 gzip 약 150KB다. 정적으로 import하면 첫 화면이 그만큼 늦어진다.
`lib/firebase.ts`가 SDK를 동적으로 불러오고, `repository.ts`의 구독 함수는 해제 함수를
즉시 돌려준 뒤 모듈이 도착하면 리스너를 연결한다(`lazySubscribe`).
결과: 초기 청크 227KB(gzip 73KB), 게임 화면은 Firebase를 기다리지 않는다.

### 2.4 오프라인 큐를 Firestore 지속성 위에 따로 둔다
Firestore도 오프라인 쓰기를 큐에 담지만, 그 상태를 UI에 보여줄 방법이 마땅치 않다.
PRD 7.3이 요구하는 "기록 저장 대기 중" 배지를 위해 `localStorage`에 자체 큐를 두고
전송 성공 시에만 항목을 지운다. 온라인 복귀 이벤트와 30초 타이머로 재시도한다.

### 2.5 프로필은 첫 렌더부터 로컬 값으로 시작한다
`/play/S12`를 직접 열거나 새로고침하면, 프로필이 비동기로 채워지는 동안 한 프레임
"아무것도 못 깬 학생"으로 보여 잠금 판정에 걸린다. `useState` 초기화 함수에서
`localStorage`를 바로 읽어 이 깜빡임을 없앴다.

## 3. PRD에서 벗어난 부분 (의도적)

| 항목 | PRD | 구현 | 이유 |
|---|---|---|---|
| `config/global` 쓰기 규칙 | `allow write: if false` | 필드 형태를 검증하는 조건부 쓰기 | 그대로 두면 AC-08(교사가 대시보드를 끄면 학생 화면에서 사라진다)을 앱 안에서 만족할 수 없다. 자세한 내용과 더 단단한 대안은 `firestore.rules` 주석과 REVIEW.md 참고 |
| `students` 삭제 규칙 | `allow delete: if false` | 인증된 사용자 허용 | 교사 모드의 "개별 기록 삭제"(PRD 5.5)를 수업 중에 쓰려면 필요하다 |
| `GlobalConfig` 필드 | 3개 | `oddViewUnlocked` 추가 | PRD 3.3의 "2단계까진 교사 설정으로 개방"과 수업 운영표의 "정리 1 — 홀수점 보기 토글 해금"을 실제로 켤 수단이 없었다 |
| JUDGE 점수 | 명시 없음 | 무오답 300점(★3), 오답 있으면 150점(★1) | PRD 3.5는 재시도 규칙만 정하고 점수를 정하지 않았다. `plays.score ≤ 2000` 규칙 안에 들어간다 |

## 4. 검증 방법

- **유닛테스트** (`npm test`): 그래프 이론, 점수 산식, 스테이지 데이터 무결성, 좌표 변환, 포맷터.
- **브라우저 스모크**: Playwright로 실제 드래그를 흉내 내 S01 클리어, S06 짝수점 막힘,
  S11 판별 미션, 대시보드, 가로/태블릿 레이아웃을 확인.
- **수용 기준**: REVIEW.md의 AC-01 ~ AC-10 대조표.
