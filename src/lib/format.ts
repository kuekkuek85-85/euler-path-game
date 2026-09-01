/** 학번 5자리: 학년1 + 반2 + 번호2. 1학년, 1~12반, 1~39번. */
export const STUDENT_NO_PATTERN = /^1(0[1-9]|1[0-2])(0[1-9]|[1-3][0-9])$/;

/** 성명: 한글 2~5자. */
export const NAME_PATTERN = /^[가-힣]{2,5}$/;

export interface StudentNoParts {
  grade: number;
  classNo: number;
  number: number;
  classId: string;
}

export function parseStudentNo(studentNo: string): StudentNoParts | null {
  if (!STUDENT_NO_PATTERN.test(studentNo)) return null;
  const grade = Number(studentNo.slice(0, 1));
  const classNo = Number(studentNo.slice(1, 3));
  const number = Number(studentNo.slice(3, 5));
  return { grade, classNo, number, classId: `${grade}-${classNo}` };
}

export function classIdOf(studentNo: string): string {
  return parseStudentNo(studentNo)?.classId ?? '알 수 없음';
}

/** 학번 뒷자리(번호) 두 자리. 대시보드 표시용. */
export function shortNo(studentNo: string): string {
  return studentNo.slice(3, 5);
}

export function validateStudentNo(studentNo: string): string | null {
  if (studentNo.length === 0) return '학번을 입력해 주세요.';
  if (!/^\d+$/.test(studentNo)) return '학번은 숫자 5자리입니다.';
  if (studentNo.length !== 5) return '학번은 5자리예요. (학년1 + 반2 + 번호2, 예: 10307)';
  if (!studentNo.startsWith('1')) return '1학년 학번만 사용할 수 있어요. (1로 시작)';
  const classNo = Number(studentNo.slice(1, 3));
  if (classNo < 1 || classNo > 12) return `${classNo}반은 없어요. 반은 01~12입니다.`;
  const number = Number(studentNo.slice(3, 5));
  if (number < 1 || number > 39) return `${number}번은 없어요. 번호는 01~39입니다.`;
  return null;
}

export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '이름을 입력해 주세요.';
  if (!NAME_PATTERN.test(trimmed)) return '이름은 한글 2~5자로 입력해 주세요.';
  return null;
}

/**
 * 이름 마스킹 (PRD 5.4). 가운데 글자를 O로 바꾼다.
 *   김민수 → 김O수 / 김수 → 김O / 남궁민수 → 남OO수
 */
export function maskName(name: string): string {
  const chars = [...name.trim()];
  if (chars.length <= 1) return name;
  if (chars.length === 2) return `${chars[0]}O`;
  return `${chars[0]}${'O'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

export function displayName(name: string, masking: boolean): string {
  return masking ? maskName(name) : name;
}

/** 밀리초 → "1:23.4" 또는 "23.4초" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}초`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}분 ${sec.toFixed(1)}초`;
}

/** 경과 타이머용 짧은 표기 "01:23" */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** CSV 셀 이스케이프. 쉼표·따옴표·줄바꿈이 있으면 큰따옴표로 감싼다. */
export function csvCell(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: (string | number | boolean)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
