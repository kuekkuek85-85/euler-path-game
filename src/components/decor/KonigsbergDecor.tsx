/**
 * S11 쾨니히스베르크 배경 — 강·강가·섬을 단순화해 얹는다 (PRD 4.2).
 * 그래프 자체는 GameCanvas가 그 위에 그린다.
 */
export function KonigsbergDecor() {
  return (
    <g aria-hidden="true">
      {/* 강 */}
      <rect x="0" y="0" width="100" height="100" fill="#dbeafe" />
      {/* 북쪽 강가 */}
      <path d="M 0 0 H 100 V 26 Q 70 32 50 26 Q 26 20 0 26 Z" fill="#dcfce7" />
      {/* 남쪽 강가 */}
      <path d="M 0 100 H 100 V 76 Q 70 70 50 78 Q 26 84 0 76 Z" fill="#dcfce7" />
      {/* 동쪽 지역 */}
      <path d="M 100 30 V 70 Q 80 62 76 50 Q 80 38 100 30 Z" fill="#dcfce7" />
      {/* 섬 */}
      <ellipse cx="50" cy="50" rx="16" ry="10" fill="#fef9c3" />
      <text x="6" y="12" fontSize="4.5" fill="#166534">
        북쪽 강가
      </text>
      <text x="6" y="95" fontSize="4.5" fill="#166534">
        남쪽 강가
      </text>
      {/* 섬 이름은 노드와 겹치지 않도록 타원 아래로 내린다 */}
      <text x="50" y="68" textAnchor="middle" fontSize="4.5" fill="#854d0e">
        섬(크나이프호프)
      </text>
      <text x="88" y="72" textAnchor="middle" fontSize="4.5" fill="#166534">
        동쪽 지역
      </text>
    </g>
  );
}
