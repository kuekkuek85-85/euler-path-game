/**
 * B01 "5개의 방" 배경 — 직사각형을 다섯 방으로 나눈 평면도.
 * 각 방(그리고 바깥)이 점, 벽 하나하나가 선이 된다.
 * 좌표는 stages.json의 B01 노드 위치와 짝을 이룬다.
 */
export function FiveRoomsDecor() {
  return (
    <g aria-hidden="true">
      <text x="50" y="16" textAnchor="middle" fontSize="4" fill="#64748b">
        벽(문) 16개를 모두 한 번씩 지날 수 있을까?
      </text>
      <rect x="18" y="26" width="64" height="46" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.2" />
      {/* 위·아래를 가르는 벽 */}
      <line x1="18" y1="49" x2="82" y2="49" stroke="#94a3b8" strokeWidth="1.2" />
      {/* 위층 칸막이 */}
      <line x1="50" y1="26" x2="50" y2="49" stroke="#94a3b8" strokeWidth="1.2" />
      {/* 아래층 칸막이 두 개 */}
      <line x1="39.3" y1="49" x2="39.3" y2="72" stroke="#94a3b8" strokeWidth="1.2" />
      <line x1="60.7" y1="49" x2="60.7" y2="72" stroke="#94a3b8" strokeWidth="1.2" />
      {/* '바깥' 노드는 도형 아래에 두고, 이름표는 그 밑에 겹치지 않게 붙인다 */}
      <text x="50" y="96" textAnchor="middle" fontSize="4" fill="#64748b">
        바깥
      </text>
    </g>
  );
}
