import { describe, expect, it } from 'vitest';
import { edgeGeometry } from './geometry';

const a = { id: 'A', x: 0, y: 0 };
const b = { id: 'B', x: 10, y: 0 };

describe('edgeGeometry', () => {
  it('곡률이 없으면 직선을 그린다', () => {
    const geometry = edgeGeometry(a, b);
    expect(geometry.path).toBe('M 0 0 L 10 0');
    expect(geometry.midX).toBe(5);
    expect(geometry.midY).toBe(0);
  });

  it('곡률이 있으면 2차 베지어를 그린다', () => {
    const geometry = edgeGeometry(a, b, 4);
    expect(geometry.path).toBe('M 0 0 Q 5 8 10 0');
  });

  it('보고하는 중점이 실제 곡선의 정점과 같다', () => {
    // 2차 베지어의 t=0.5 지점 = (P0 + 2C + P2) / 4
    const curve = 6;
    const geometry = edgeGeometry(a, b, curve);
    const [, , , , controlX, controlY] = geometry.path.split(' ');
    const apexX = (a.x + 2 * Number(controlX) + b.x) / 4;
    const apexY = (a.y + 2 * Number(controlY) + b.y) / 4;
    expect(geometry.midX).toBeCloseTo(apexX, 6);
    expect(geometry.midY).toBeCloseTo(apexY, 6);
  });

  it('부호가 반대인 곡률은 반대쪽으로 휜다 — 다중 간선 구분용', () => {
    const up = edgeGeometry(a, b, 14);
    const down = edgeGeometry(a, b, -14);
    expect(up.midY).toBeCloseTo(-down.midY, 6);
    expect(up.path).not.toBe(down.path);
  });

  it('길이가 0인 간선에서도 NaN을 내지 않는다', () => {
    const geometry = edgeGeometry(a, { id: 'A2', x: 0, y: 0 }, 5);
    expect(geometry.path).not.toContain('NaN');
  });
});
