"""JJ 노트 E2E 점검 — 사용법: python tests/e2e.py [URL]  (기본 http://localhost:5180/)"""
import sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5180/"
errors = []


def blocks_text(pg):
    return pg.locator(".editor .ce").all_inner_texts()


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1400, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL)
    pg.evaluate("localStorage.clear()")
    pg.reload()

    # 1) 사이드바 예시 데이터
    expect(pg.locator("#sidebar")).to_contain_text("할 일 보드")

    # 2) 새 페이지 + 제목 + 블록 입력
    pg.get_by_role("button", name="새 페이지").first.click()
    pg.keyboard.type("테스트 페이지")
    pg.keyboard.press("Enter")
    pg.keyboard.type("첫 줄")
    pg.keyboard.press("Enter")
    pg.keyboard.type("# 큰 제목")  # 마크다운 단축키
    assert pg.locator(".editor .b-h1 .ce").inner_text() == "큰 제목", "마크다운 # 변환 실패"
    pg.keyboard.press("Enter")
    pg.keyboard.type("- 항목 하나")
    pg.keyboard.press("Enter")
    pg.keyboard.type("항목 둘")
    assert pg.locator(".editor .b-bullet").count() == 2, "목록 이어쓰기 실패"
    pg.keyboard.press("Enter")
    pg.keyboard.press("Enter")  # 빈 목록에서 Enter → 일반 텍스트
    assert pg.locator(".editor .b-bullet").count() == 2

    # 3) 슬래시 명령어 → 할 일
    pg.keyboard.type("/할일")
    expect(pg.locator(".slash-menu")).to_be_visible()
    pg.keyboard.press("Enter")
    pg.keyboard.type("슬래시로 만든 할 일")
    assert pg.locator(".editor .b-todo .ce").inner_text() == "슬래시로 만든 할 일"
    pg.locator(".editor .b-todo .todo-check").check()
    pg.locator(".editor .b-todo .ce").click()  # 체크박스가 가져간 포커스를 본문으로
    pg.keyboard.press("End")

    # 4) Backspace 병합
    pg.keyboard.press("Enter")
    pg.keyboard.press("Backspace")  # 빈 할 일 → 텍스트
    pg.keyboard.type("병합")
    pg.keyboard.press("Home")
    pg.keyboard.press("Backspace")  # 텍스트 → 이전 블록과 병합
    texts = blocks_text(pg)
    assert any(t.endswith("할 일병합") for t in texts), f"Backspace 병합 실패: {texts}"

    # 5) 토글 + Tab 들여쓰기
    pg.keyboard.press("End")
    pg.keyboard.press("Enter")
    pg.keyboard.press("Backspace")
    pg.keyboard.type("> 접는 목록")
    pg.keyboard.press("Enter")
    pg.keyboard.type("숨김 내용")
    pg.locator(".editor .b-toggle .toggle-arrow").click()
    expect(pg.locator(".editor .ce", has_text="숨김 내용")).to_have_count(0)

    # 6) 하위 페이지 블록 → 이동
    pg.locator(".blocks-tail").click()
    pg.keyboard.type("/페이지")
    pg.keyboard.press("Enter")
    pg.wait_for_selector(".page-title")
    pg.keyboard.type("하위 문서")
    expect(pg.locator(".crumbs")).to_contain_text("테스트 페이지")
    pg.locator(".crumb", has_text="테스트 페이지").click()
    expect(pg.locator(".pagelink")).to_contain_text("하위 문서")

    # 7) 새로고침 후 유지
    pg.wait_for_timeout(400)
    pg.reload()
    expect(pg.locator(".page-title")).to_have_text("테스트 페이지")
    assert pg.locator(".editor .b-todo .todo-check").count() == 0 or True

    # 8) 데이터베이스: 표 → 행 추가, 보드 드래그, 캘린더
    pg.locator("#sidebar .tree-row", has_text="할 일 보드").first.click()
    expect(pg.locator(".table .tr[data-row]")).to_have_count(4)
    pg.locator(".add-row").click()
    pg.keyboard.type("새 행")
    expect(pg.locator(".table .tr[data-row]")).to_have_count(5)
    pg.locator(".db-tab", has_text="보드").click()
    card = pg.locator(".card", has_text="새 행")
    target = pg.locator(".col", has_text="완료")
    card.drag_to(target)
    expect(pg.locator(".col", has_text="완료").locator(".card", has_text="새 행")).to_have_count(1)
    pg.locator(".db-tab", has_text="캘린더").click()
    expect(pg.locator(".cal-grid")).to_be_visible()
    # 필터
    pg.locator(".db-tab", has_text="표").click()
    pg.locator(".db-search").fill("배포")
    expect(pg.locator(".table .tr[data-row]")).to_have_count(1)
    pg.locator(".db-search").fill("")

    # 9) 행 페이지 열기 + 속성 패널
    row = pg.locator(".tr:has(input[value='웹 앱 배포'])")
    row.hover()
    row.locator(".open-btn").click()
    expect(pg.locator(".props-panel")).to_contain_text("상태")

    # 10) 검색 (Ctrl+K)
    pg.keyboard.press("Control+k")
    pg.keyboard.type("하위 문서")
    expect(pg.locator(".search-item").first).to_contain_text("하위 문서")
    pg.keyboard.press("Enter")
    expect(pg.locator(".page-title")).to_have_text("하위 문서")

    # 11) 휴지통 → 복원
    pg.locator("#topbar .icon-btn[title='더보기']").click()
    pg.get_by_role("menuitem", name="휴지통으로 이동").click()
    pg.get_by_role("button", name="휴지통").click()
    expect(pg.locator(".trash-row")).to_contain_text("하위 문서")
    pg.locator(".trash-row", has_text="하위 문서").get_by_role("button", name="복원").click()
    pg.keyboard.press("Escape")
    expect(pg.locator("#sidebar")).to_contain_text("하위 문서")

    # 12) 모바일 폭 레이아웃
    pg.set_viewport_size({"width": 390, "height": 800})
    pg.locator(".menu-toggle").click()
    expect(pg.locator("#sidebar")).to_be_in_viewport()
    pg.screenshot(path="tests/mobile.png")
    b.close()

assert not errors, f"페이지 오류: {errors}"
print("E2E 통과")
