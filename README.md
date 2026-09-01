# 한붓 챌린지

중학교 1학년 정보 수업용 한붓그리기(오일러 경로) 학습 게임.
학생은 몇 판 실패한 뒤 "왜 어떤 도형은 되고 어떤 도형은 안 되지?"에 도달하고,
교사는 그 순간 홀수점 개념을 꺼낸다. 게임이 곧 도입 활동이 되는 구조다.

- 기술 스택: React 18 + Vite 6 + Tailwind CSS 4 / Firebase(Firestore + 익명 인증) / Vercel
- 대상 기기: 스마트폰 세로 우선, 태블릿·노트북 병행
- 설계 문서: [PRD](#), [PLAN.md](./PLAN.md), [REVIEW.md](./REVIEW.md)

---

## 빠르게 실행하기

```bash
npm install
npm run dev          # http://localhost:5173
```

Firebase 설정 없이도 **12스테이지 전부 플레이된다**(기록은 이 기기에만 저장).
랭킹·대시보드를 쓰려면 아래 설정을 마친다.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm test` | 유닛테스트 (그래프 이론 · 점수 · 스테이지 데이터 검증) |
| `npm run lint` | ESLint |
| `npm run typecheck` | 타입 검사만 |

---

## 1. Firebase 설정

프로젝트 ID는 `euler-path-game`이다. 2026-09-01 기준 남은 작업은 **5번 하나**다.

1. ~~[Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 만든다.~~ (완료)
2. ~~**Authentication → Sign-in method → 익명(Anonymous) 사용 설정.**~~
   (완료 — `accounts:signUp`이 정상적으로 idToken을 반환한다)
3. ~~**Firestore Database**를 만든다.~~ (완료 — 응답이 404가 아니라 403이므로 DB는 존재한다)
4. ~~**프로젝트 설정 → 내 앱 → 웹 앱 추가.**~~ (완료)
5. **보안 규칙을 배포한다** (아래 참고). 지금은 기본 규칙이 모든 접근을 막고 있다.
6. 저장소 루트에 `.env`를 만들고 `.env.example`을 채운다.

> 설정이 끝났는지 확인하려면 `/teacher` → **연결 상태 점검**을 누른다.
> 익명 인증·설정 읽기·기록 읽기를 차례로 확인하고, 실패하면 콘솔에서 눌러야 할 항목을 알려 준다.

```bash
cp .env.example .env
# VITE_FIREBASE_* 값과 VITE_TEACHER_PIN(6자리)을 채운다
```

### 보안 규칙 배포

가장 간단한 방법은 콘솔에 붙여넣는 것이다 — CLI 설치가 필요 없다.

**Firebase 콘솔 → Firestore Database → 규칙 탭 → 전체를 `firestore.rules` 내용으로 교체 → 게시**

CLI를 쓴다면:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

규칙 파일 상단 주석에 **알려진 한계**와 더 단단히 잠그는 방법이 적혀 있으니 배포 전에 읽을 것.

### 색인

미리 만들 필요 없다. 대시보드 탭을 처음 열면 콘솔이 "이 색인을 만드세요" 링크를 띄우므로
클릭하면 된다. 미리 만들고 싶다면 `firestore.indexes.json`에 필요한 4개가 들어 있다.

### 컬렉션은 손으로 만들지 않아도 된다

- `students`, `plays` — 학생이 처음 플레이할 때 자동으로 생긴다.
- `config/global` — 규칙을 배포한 뒤 `/teacher`를 한 번 열면 앱이 기본값으로 만든다.

만들어지는 기본값은 다음과 같고, `activeStages`가 빈 배열이면 "전부 활성"으로 해석한다.

```json
{
  "dashboardVisible": true,
  "nameMasking": true,
  "activeStages": [],
  "oddViewUnlocked": false
}
```

---

## 2. Vercel 배포

1. Vercel에 저장소를 연결한다 (프레임워크 프리셋: Vite).
2. **Settings → Environment Variables**에 `.env`와 같은 키를 넣는다.
   `VITE_TEACHER_PIN`을 빼먹으면 `/teacher`가 안내 문구만 띄운다.
3. 배포한다. `vercel.json`이 SPA 리라이트와 `X-Robots-Tag: noindex`를 잡아 준다.
4. 배포 URL로 QR코드를 만들어 수업 시간에만 공유한다.

> 검색 노출은 `robots.txt`, `<meta name="robots">`, `X-Robots-Tag` 세 겹으로 막아 두었다.

---

## 3. 수업 중 사용법

### 학생
1. QR/짧은 URL 접속 → 학번 5자리(예: `10307`)와 이름 입력 → 시작.
2. 시작할 점을 누르고, 이어진 점으로 손가락을 끈다. 탭으로 한 선씩 가도 된다.
3. 막히면 **되돌리기**, 처음부터면 **다시하기**, 정 모르겠으면 **힌트**(스테이지당 3회).
4. 노트북은 `Z`=되돌리기, `R`=다시하기.

### 교사 — `/teacher`

| 기능 | 설명 |
|---|---|
| 프레젠테이션 뷰 | 대형 화면용. 상위 10명 + 학급 진행률만 크게 |
| 연결 상태 점검 | 기록이 저장되지 않을 때 원인(설정 누락 / 규칙 / 네트워크)을 짚어 준다 |
| 대시보드 공개 | 끄면 학생 화면에서 대시보드 메뉴가 사라진다 |
| 이름 마스킹 | `김민수` → `김O수` (기본 켜짐) |
| 홀수점 보기 조기 해금 | 1·2단계에서도 홀수점 토글을 열어 준다. **수업 흐름상 "정리 1"에서 켠다** |
| 스테이지 활성화 | 진도에 맞춰 3단계를 잠가 둘 수 있다 |
| CSV 내보내기 | 학번·이름·학급·총점·스테이지별 기록 (Excel용 BOM 포함) |
| 개별 기록 삭제 | 오입력 학번 정리용 |

PIN은 코드에 없다. 환경변수 `VITE_TEACHER_PIN`으로만 주입된다.

### 수업 운영 흐름 (PRD 10)

| 단계 | 시간 | 활동 |
|---|---|---|
| 도입 | 5분 | 종이에 봉투 도형 그려보기, 접속 안내 |
| 전개 1 | 12분 | S01~S05. "왜 다 성공했지?" |
| 정리 1 | 5분 | 홀수점 개념 설명 → 교사 모드에서 **홀수점 보기 조기 해금** 켜기 |
| 전개 2 | 12분 | S06~S09. 시작점을 골라야 함을 체험 |
| 전개 3 | 8분 | S10~S12, 판별 미션. 쾨니히스베르크 이야기 |
| 정리 2 | 3분 | 프레젠테이션 뷰로 학급 통계 확인 |

---

## 4. 스테이지 데이터 고치기

스테이지는 DB가 아니라 `src/data/stages.json`에 있다. 고치고 배포하면 끝이다.

```jsonc
{
  "id": "S08",
  "order": 8,
  "tier": 2,                 // 1 = 홀수점 0개, 2 = 홀수점 2개, 3 = 복합·판별
  "name": "니콜라우스의 집",
  "type": "DRAW",            // DRAW | JUDGE
  "parTimeSec": 50,
  "nodes": [{ "id": "A", "x": 20, "y": 85 }],   // viewBox "0 0 100 100" 기준
  "edges": [{ "id": "e1", "from": "A", "to": "B", "curve": 0 }],  // curve: 다중 간선 곡률
  "hintText": "…",
  "clearMessage": "…",
  "unlockedBy": "S07"
}
```

고친 뒤 반드시 `npm test`를 돌린다. 다음을 자동으로 검사한다.

- 노드·간선 id 중복, 좌표 범위, 존재하지 않는 노드를 가리키는 간선
- 그래프 연결성, 간선이 붙지 않은 외톨이 노드
- 선언한 `tier`와 실제 오일러 판정의 일치
- **모든 DRAW 스테이지가 허용된 모든 시작점에서 실제로 풀리는지** (`solve()`, AC-04)
- JUDGE 스테이지의 `answer`가 실제 계산 결과와 일치하는지

## 5. 디렉터리 구조

```
src/
  data/stages.json      스테이지 데이터 (12 + 보너스 2)
  data/stages.ts        로더 + 개발 모드 자가 검사
  lib/
    graph.ts            차수·홀수점·연결성·오일러 판정·Hierholzer·힌트
    geometry.ts         간선 SVG 경로 (직선 / 2차 베지어)
    generator.ts        B02 무작위 회로 생성기
    scoring.ts          점수·별점 산식
    format.ts           학번 검증, 이름 마스킹, 시간 표기, CSV
    firebase.ts         동적 import 기반 초기화 + 익명 인증
    repository.ts       students/plays/config 읽고 쓰기 + 오프라인 큐
    storage.ts          안전한 localStorage 래퍼
  hooks/
    useGameEngine.ts    진행 상태, undo 스택, 막힘 감지
    usePointerDraw.ts   포인터 → 노드 히트 테스트
  components/
    GameCanvas.tsx      SVG 렌더링
    StageCard.tsx  ConceptCard.tsx  Countdown.tsx  Toast.tsx
    Dashboard/DashboardTabs.tsx
    decor/              S11·B01 배경 일러스트
  pages/                Entry, StageSelect, Play, JudgeBoard, Result, Dashboard, Teacher
  state/                SessionContext(Provider) + sessionStore(context·훅)
```

---

## 6. 개인정보

- 수집 항목: **학번, 성명, 게임 기록**. 그 외 일체 수집하지 않는다.
- 익명 인증만 사용한다. 이메일·전화번호를 받지 않는다.
- 배포 URL은 수업 시간에만 공유하고 검색 노출을 막는다.

### 학기 종료 후 데이터 삭제

1. Firebase 콘솔 → Firestore Database
2. `students` 컬렉션 → 우측 점 세 개 → **컬렉션 삭제**
3. `plays` 컬렉션도 같은 방법으로 삭제
4. 필요하면 Authentication → 사용자 목록에서 익명 사용자도 일괄 삭제

> 기록은 참여 동기 부여용이며 수행평가 점수와 직접 연동하지 않는다.
> 클라이언트에서 점수를 계산하는 구조라 기록 조작이 원리적으로 가능하다는 점을
> 학생에게도 미리 알린다 (PRD 6.4).
