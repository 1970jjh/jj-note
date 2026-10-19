# 노션 리버스 엔지니어링 요약 (2026-10-19)

## 수집 경로
- **Aside 브라우저**: 로그인된 노션 탭의 접근성 트리·스크린샷(페이지 화면, Applicant Tracker DB 보드)과 `@aside/notion` 내부 API 클라이언트(레코드 모델)
- **REA** (`analyze_web_bundle`, `inspect_web_page`): 디버그 포트(9333)를 연 크롬에서 app.notion.com 번들 정적 분석

## REA 관찰 결과
- 프레임워크: React SPA (vendor fingerprint), 청크 노드 244개
- 서버 통신: `/api/v3/*` RPC (contentPreview, recordClientLoadAttempt 등), `/engine.io` 실시간 동기화 채널
- 클라이언트 캐시: `opfs_cache`, `sqliteRecordCacheEviction` → 브라우저 OPFS 위 SQLite 레코드 캐시
- 데이터 키: `space_id`, `created_by`, `last_edited_by`, `last_visited_time`, `formula`, `relation`, `person`, `date`, `table`, `cell`
- 페이지 로딩은 워커+OPFS 캐시 경유라 페이지 타깃 네트워크 캡처에는 API 호출이 잡히지 않음(한계)

## 데이터 모델 (Aside 내부 클라이언트로 확인)
- 모든 것은 **블록 레코드**: `id`, `type`(page, text, header, bulleted_list, to_do, toggle, quote, callout, code, divider, image, collection_view_page …), `properties`, `content[]`(자식 id), `parent_id`, `format`
- DB 페이지 = `collection_view_page` + `collection_id` + `view_ids[]`(보기 여러 개: By Stage=보드, Table View=표, Engineering=필터된 표)
- 컬렉션 `schema` = 속성 정의(title/select/multi_select/date/person/email/url/checkbox…), 행은 그 컬렉션을 부모로 하는 page 블록

## UI 인벤토리
- 사이드바: 검색(Ctrl+K), 홈, 새 페이지, 즐겨찾기, 팀스페이스/개인 페이지 트리(중첩·펼침), 휴지통, 설정, 사이드바 접기
- 페이지: 아이콘·커버·제목, 브레드크럼, 공유(링크 복사), 즐겨찾기 ★, … 메뉴(전체 너비, 복제, 내보내기, 삭제)
- 블록 에디터: `/` 명령어, 마크다운 단축키, 드래그 핸들(⋮⋮), 들여쓰기, 토글, 할 일, 콜아웃, 코드, 구분선, 이미지, 하위 페이지
- DB: 보기 탭(표/보드/목록/갤러리/캘린더), 필터·정렬·검색, 새로 만들기, 그룹(보드), 행 = 페이지(속성 패널 + 본문)

## JJ 노트 구현 매핑
| 노션 | JJ 노트 |
|---|---|
| 서버 + OPFS SQLite 캐시 | 브라우저 localStorage (JSON 내보내기/가져오기로 백업) |
| 블록 트리 `content[]` | 페이지별 평탄 블록 배열 + `indent`(중첩) |
| collection + views | `page.db = {schema, views, rows}` |
| engine.io 실시간 협업, AI, 댓글, 권한 | 미구현 |
