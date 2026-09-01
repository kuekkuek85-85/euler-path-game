import { ensureAnonymousAuth, firebaseEnabled, firestoreApi, getDb } from './firebase';

export type CheckStatus = 'ok' | 'fail' | 'skip';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** 실패했을 때 선생님이 실제로 눌러야 하는 것. */
  action?: string;
}

/** Firebase 오류 코드를 "무엇을 누르면 되는지"로 옮긴다. */
function explain(error: unknown): { detail: string; action?: string } {
  const text = String(error);
  const code = /\(([a-z-]+\/[a-z-]+)\)/.exec(text)?.[1] ?? /code=([a-z-]+)/.exec(text)?.[1] ?? '';

  switch (code) {
    case 'auth/configuration-not-found':
      return {
        detail: '이 프로젝트에 Authentication이 아직 설정되지 않았습니다.',
        action:
          'Firebase 콘솔 → Authentication → 시작하기 → Sign-in method → 익명(Anonymous) 사용 설정',
      };
    case 'auth/operation-not-allowed':
      return {
        detail: '익명 로그인이 꺼져 있습니다.',
        action: 'Firebase 콘솔 → Authentication → Sign-in method → 익명(Anonymous) 사용 설정',
      };
    case 'auth/network-request-failed':
      return { detail: '네트워크에 연결하지 못했습니다.', action: '인터넷 연결을 확인해 주세요.' };
    case 'auth/unauthorized-domain':
      return {
        detail: '이 도메인에서의 로그인이 허용되지 않았습니다.',
        action: 'Firebase 콘솔 → Authentication → Settings → 승인된 도메인에 배포 주소 추가',
      };
    case 'permission-denied':
      return {
        detail: '보안 규칙이 접근을 막았습니다.',
        action: '저장소의 firestore.rules를 배포하세요: firebase deploy --only firestore:rules',
      };
    case 'unavailable':
      return {
        detail: 'Firestore 서버에 연결하지 못했습니다(오프라인).',
        action: '인터넷 연결을 확인해 주세요. 연결될 때까지 기록은 기기에 보관됩니다.',
      };
    case 'failed-precondition':
      return {
        detail: '쿼리에 필요한 색인이 없습니다.',
        action: '색인을 배포하세요: firebase deploy --only firestore:indexes',
      };
    default:
      return { detail: text.slice(0, 180) };
  }
}

/** 오래 매달리지 않게 각 검사에 제한 시간을 둔다. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    promise,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

/**
 * 교사 모드의 연결 상태 점검.
 * "기록이 저장되지 않는다"는 상황에서 원인이 설정인지 네트워크인지 바로 가른다.
 */
export async function runConnectionCheck(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  if (!firebaseEnabled) {
    return [
      {
        name: '환경변수',
        status: 'fail',
        detail: 'VITE_FIREBASE_* 값이 비어 있어 로컬 전용 모드로 돌고 있습니다.',
        action: 'Vercel → Settings → Environment Variables에 Firebase 설정값을 넣고 다시 배포하세요.',
      },
    ];
  }
  results.push({ name: '환경변수', status: 'ok', detail: 'Firebase 설정값이 들어와 있습니다.' });

  // 1) 익명 인증
  let authOk = false;
  try {
    const uid = await withTimeout(ensureAnonymousAuth(), 15_000);
    if (uid === 'timeout') {
      results.push({
        name: '익명 인증',
        status: 'fail',
        detail: '15초 안에 응답이 없었습니다.',
        action: '인터넷 연결을 확인해 주세요.',
      });
    } else if (uid) {
      authOk = true;
      results.push({ name: '익명 인증', status: 'ok', detail: `로그인됨 (uid ${uid.slice(0, 8)}…)` });
    } else {
      // ensureAnonymousAuth는 실패를 삼키고 null을 준다. 원인을 다시 확인한다.
      results.push({
        name: '익명 인증',
        status: 'fail',
        detail: '익명 로그인에 실패했습니다.',
        action:
          'Firebase 콘솔 → Authentication → 시작하기 → Sign-in method → 익명(Anonymous) 사용 설정',
      });
    }
  } catch (error) {
    const { detail, action } = explain(error);
    results.push({ name: '익명 인증', status: 'fail', detail, action });
  }

  const db = await getDb();
  if (!db) {
    results.push({ name: 'Firestore', status: 'fail', detail: 'Firestore를 초기화하지 못했습니다.' });
    return results;
  }
  const { doc, getDoc } = await firestoreApi();

  // 2) 설정 문서 읽기 — 규칙상 로그인 없이도 읽혀야 한다.
  try {
    const snap = await withTimeout(getDoc(doc(db, 'config', 'global')), 15_000);
    if (snap === 'timeout') {
      results.push({
        name: '교사 설정 읽기',
        status: 'fail',
        detail: '15초 안에 응답이 없었습니다.',
        action: '인터넷 연결을 확인해 주세요.',
      });
    } else if (snap.exists()) {
      results.push({ name: '교사 설정 읽기', status: 'ok', detail: 'config/global 문서를 읽었습니다.' });
    } else {
      results.push({
        name: '교사 설정 읽기',
        status: 'fail',
        detail: 'config/global 문서가 아직 없습니다.',
        action: 'Firebase 콘솔에서 만들거나, 아래 설정을 한 번 바꾸면 자동으로 생성됩니다.',
      });
    }
  } catch (error) {
    const { detail, action } = explain(error);
    results.push({ name: '교사 설정 읽기', status: 'fail', detail, action });
  }

  // 3) 학생 기록 읽기 — 규칙상 로그인이 필요하다.
  if (!authOk) {
    results.push({
      name: '학생 기록 읽기',
      status: 'skip',
      detail: '익명 인증이 먼저 되어야 확인할 수 있습니다.',
    });
    return results;
  }
  try {
    const snap = await withTimeout(getDoc(doc(db, 'students', '__connection_check__')), 15_000);
    if (snap === 'timeout') {
      results.push({
        name: '학생 기록 읽기',
        status: 'fail',
        detail: '15초 안에 응답이 없었습니다.',
        action: '인터넷 연결을 확인해 주세요.',
      });
    } else {
      // 문서가 없어도 읽기 자체가 통과했다면 규칙은 정상이다.
      results.push({ name: '학생 기록 읽기', status: 'ok', detail: '보안 규칙이 정상 동작합니다.' });
    }
  } catch (error) {
    const { detail, action } = explain(error);
    results.push({ name: '학생 기록 읽기', status: 'fail', detail, action });
  }

  return results;
}
