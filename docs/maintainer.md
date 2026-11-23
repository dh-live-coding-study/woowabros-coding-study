# 관리자 설정

- 참여자를 저장소의 Write 권한 멤버로 등록하고, `study.config.json`에 고유한 `id`, GitHub 계정, 사용할 사이트 계정을 등록한다. 사용하지 않는 사이트는 빈 문자열로 둔다.
- `baekjoon/번호`, `programmers/번호` 문제 브랜치는 제출 원문, 순번과 중복 방지 기록을 보관하므로 삭제하지 않는다. 수집기는 PR 없이 이 브랜치에 제출을 추가한다.
- 수집은 main의 `Collect submission`, 목록 갱신은 `Update study index`에서 실행한다. 새 제출 저장 뒤 main README의 목록 구간만 직접 커밋한다. 30분 간격의 예약 실행과 수동 실행으로도 목록을 갱신할 수 있다. 제출 소스는 실행하지 않는다. 서버 판정은 브라우저가 관찰한 결과이며 별도 서버가 재채점하지 않는다.
- 수집과 목록 갱신에는 기본 `GITHUB_TOKEN`의 Contents: Read and write 권한을 사용하며 PR 권한은 사용하지 않는다. 브랜치 보호 규칙을 추가할 때는 수집기의 문제 브랜치 저장과 목록 갱신의 main 자동 커밋이 허용되는지 확인한다.
- 백준 난이도는 [solved.ac 공식 v4 API](https://backstage.solved.ac/developer/docs)로 조회한다. [개발자 콘솔](https://backstage.solved.ac/developer/apps)에서 스터디용 앱을 만들고 Client ID와 시크릿을 이 저장소의 Actions Secrets에 각각 `SOLVEDAC_CLIENT_ID`, `SOLVEDAC_CLIENT_SECRET`으로 등록한다. 개인 OAuth 토큰은 사용하지 않으며, 확장 프로그램에는 인증정보를 넣지 않는다.
- 난이도는 제출 저장 후, 예약 실행, 수동 실행 때 갱신한다. 인증정보가 없거나 조회에 실패하면 README의 이전 난이도를 유지한다. 이전 값도 없는 문제는 저장된 난이도 또는 `—`로 표시하고 제출 기록은 계속 집계한다.
- `programmers` 값은 확장 설정의 계정 표시와 일치해야 한다. 프로그래머스 연습 페이지에서 로그인 ID를 검증하지 못하므로 브라우저를 공유하는 경우 계정 설정을 직접 확인한다.
- 새 저장소에서 소스와 판정 연결을 확인하려면 각 사이트에서 정답과 오답을 하나씩 제출하고, 문제 브랜치의 원문과 순번을 확인한다. 재전송은 같은 기록을 유지하고, 같은 코드를 새로 제출하면 순번이 증가해야 한다.

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

카테고리는 백준의 solved.ac 태그 영문명과 프로그래머스 문제 페이지의 공식 분류를 자동으로 가져온다. SQL도 제출 쿼리의 문법을 추정하지 않고 공식 문제 분류를 쓴다. 조회 실패 시 이전 분류를 유지한다.

`categories`를 직접 지정하면 자동 분류보다 우선한다. 빈 배열은 자동 분류를 쓰지 않고 `미분류`로 표시한다. 코딩 기초 트레이닝처럼 구체적인 공식 유형이 없는 문제도 이 설정으로 보완할 수 있다. `programmers/181943`의 `String`은 이 방식으로 지정한 값이다.

SQL 여부는 최초 제출 언어로 정하고, 기존 문제는 저장된 `.sql` 파일로도 구분한다. 분류를 직접 지정하거나 수정하려면 해당 문제 설정에 `"type": "sql"` 또는 `"type": "programming"`을 추가한다.

설정 PR을 병합한 뒤 `Update study index`를 실행하거나 다음 정기 갱신을 기다리면 main README에 반영된다.
