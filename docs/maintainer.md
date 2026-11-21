# 관리자 설정

- 참여자를 저장소의 Write 권한 멤버로 등록하고, `study.config.json`에 고유한 `id`, GitHub 계정, 사용할 사이트 계정을 등록한다. 사용하지 않는 사이트는 빈 문자열로 둔다.
- Settings → Actions → General에서 GitHub Actions의 PR 생성을 허용한다. 조직 정책에서 막혀 있으면 조직 관리자에게 요청한다. 리뷰 승인 권한을 사용하는 자동화는 없다.
- Settings → General의 Automatically delete head branches는 끈다. `submissions/사이트/번호/참여자` 브랜치는 제출 순번과 중복 방지 기록을 이어가는 용도다. 삭제하면 같은 제출의 중복 수집과 순번 충돌이 생길 수 있다.
- 수집은 main의 `Collect submission`, 목록 갱신은 `Update study index`에서 실행한다. 새 제출 수집 뒤와 30분 간격으로 목록 PR을 갱신하며, 병합 직후 바로 반영하려면 이 워크플로를 수동 실행한다. 제출 소스는 실행하지 않는다. 서버 판정은 브라우저가 관찰한 결과이며 별도 서버가 재채점하지 않는다.
- `programmers` 값은 확장 설정의 계정 표시와 일치해야 한다. 프로그래머스 연습 페이지에서 로그인 ID를 검증하지 못하므로 브라우저를 공유하는 경우 계정 설정을 직접 확인한다.
- 새 저장소에서 소스와 판정 연결을 확인하려면 각 사이트에서 정답과 오답을 하나씩 제출하고, PR 원문과 순번을 확인한다. 재전송은 같은 기록을 유지하고, 같은 코드를 새로 제출하면 순번이 증가해야 한다.

## 문제 분류

`study.config.json`의 `problems`에 문제 브랜치 이름을 키로 넣는다. 아래 `문제번호`는 실제 번호로 바꾼다. 이 설정은 README의 분류를 바꾸며 제출 브랜치와 폴더 경로에는 영향을 주지 않는다.

```json
"problems": {
  "programmers/문제번호": {
    "categories": ["GROUP BY", "OUTER JOIN", "RANK"]
  },
  "baekjoon/문제번호": {
    "categories": ["Graph", "DFS", "BFS"]
  }
}
```

카테고리는 문제에 해당하는 것만 지정한다. SQL 여부는 최초 제출 언어로 정하고, 기존 문제는 병합된 `.sql` 파일로도 구분한다. 분류를 직접 지정하거나 수정하려면 해당 문제 설정에 `"type": "sql"` 또는 `"type": "programming"`을 추가한다. 카테고리가 없는 문제는 `미분류`로 남는다.

설정 PR을 병합한 뒤 `Update study index`를 실행하거나 다음 정기 갱신을 기다린다. 생성된 목록 PR을 병합하면 README에 반영된다.
