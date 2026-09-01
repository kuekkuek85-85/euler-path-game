import { describe, expect, it } from 'vitest';
import {
  classIdOf,
  formatClock,
  formatDuration,
  maskName,
  parseStudentNo,
  shortNo,
  toCsv,
  validateName,
  validateStudentNo,
} from './format';

describe('parseStudentNo', () => {
  it('학년·반·번호로 쪼갠다', () => {
    expect(parseStudentNo('10307')).toEqual({
      grade: 1,
      classNo: 3,
      number: 7,
      classId: '1-3',
    });
  });

  it('형식이 맞지 않으면 null', () => {
    expect(parseStudentNo('20307')).toBeNull(); // 2학년
    expect(parseStudentNo('11307')).toBeNull(); // 13반
    expect(parseStudentNo('10340')).toBeNull(); // 40번
    expect(parseStudentNo('10300')).toBeNull(); // 0번
    expect(parseStudentNo('1030')).toBeNull(); // 4자리
  });

  it('12반 39번은 유효하다', () => {
    expect(classIdOf('11239')).toBe('1-12');
  });
});

describe('validateStudentNo', () => {
  it('올바른 학번은 오류가 없다', () => {
    expect(validateStudentNo('10307')).toBeNull();
  });

  it.each([
    ['', '학번을 입력해 주세요.'],
    ['abc', '학번은 숫자 5자리입니다.'],
    ['1030', '학번은 5자리예요. (학년1 + 반2 + 번호2, 예: 10307)'],
  ])('%s → %s', (input, message) => {
    expect(validateStudentNo(input)).toBe(message);
  });

  it('존재하지 않는 반·번호를 콕 집어 알려준다', () => {
    expect(validateStudentNo('11507')).toContain('15반은 없어요');
    expect(validateStudentNo('10345')).toContain('45번은 없어요');
    expect(validateStudentNo('20307')).toContain('1학년');
  });
});

describe('validateName', () => {
  it('한글 2~5자만 허용한다', () => {
    expect(validateName('홍길동')).toBeNull();
    expect(validateName('김수')).toBeNull();
    expect(validateName('김')).not.toBeNull();
    expect(validateName('Hong')).not.toBeNull();
    expect(validateName('가나다라마바')).not.toBeNull();
  });

  it('앞뒤 공백은 무시한다', () => {
    expect(validateName('  홍길동  ')).toBeNull();
  });
});

describe('maskName (PRD 5.4 / AC-09)', () => {
  it.each([
    ['김민수', '김O수'],
    ['김수', '김O'],
    ['남궁민수', '남OO수'],
    ['선우재덕희', '선OOO희'],
  ])('%s → %s', (input, expected) => {
    expect(maskName(input)).toBe(expected);
  });

  it('마스킹 결과에 원래 가운데 글자가 남지 않는다', () => {
    expect(maskName('김민수')).not.toContain('민');
  });
});

describe('표시 형식', () => {
  it('학번 뒷자리를 뽑는다', () => {
    expect(shortNo('10307')).toBe('07');
  });

  it('소요 시간을 사람이 읽을 수 있게 만든다', () => {
    expect(formatDuration(9120)).toBe('9.1초');
    expect(formatDuration(83400)).toBe('1분 23.4초');
    expect(formatDuration(-1)).toBe('-');
  });

  it('경과 타이머는 mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65_000)).toBe('01:05');
  });
});

describe('toCsv', () => {
  it('쉼표·따옴표·줄바꿈을 이스케이프한다', () => {
    expect(toCsv([['a', 'b,c'], ['따옴표"안', 'x']])).toBe('a,"b,c"\r\n"따옴표""안",x');
  });
});
