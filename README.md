# Woowabros coding study

백준과 프로그래머스의 제출 코드를 함께 모읍니다. 정답과 오답 모두 보관합니다.

<!-- STUDY:START -->

| 문제 | 난이도 | 제출 기록 | 대기 중인 PR |
| --- | --- | --- | --- |

<!-- STUDY:END -->

## 제출 기록 보기

문제마다 `baekjoon/1234`, `programmers/42576` 브랜치를 사용합니다. 프로그래머스 번호는 문제 URL의 `/lessons/42576`에서 확인할 수 있습니다.

각 문제 브랜치에는 참여자별로 다음과 같이 저장됩니다.

```text
hyoyoon/
├── 0001-fail/
│   ├── Main.java
│   └── submission.json
└── 0002-pass/
    ├── Main.java
    └── submission.json
```

순번은 이 스터디에서 GitHub 저장이 확정된 문제별, 참여자별 순서입니다. 같은 코드도 다시 제출하면 새 기록이 됩니다. 컴파일 오류, 실행 오류, 시간 초과도 fail로 남습니다. 자세한 판정과 수집 시각은 `submission.json`에서 확인할 수 있습니다.

같은 문제의 새 제출은 참여자별로 열린 PR에 추가됩니다. 병합한 뒤 다시 제출하면 새 PR이 만들어집니다. PR은 제목에 표시된 문제 브랜치로 병합하세요. 문제 브랜치를 main에 병합할 필요는 없습니다.

## 참여 설정

1. 관리자에게 GitHub 계정과 백준 아이디, 프로그래머스 계정 표시를 알려 [study.config.json](./study.config.json)에 등록합니다. 프로그래머스 계정 표시는 로그인 계정을 구분할 수 있는 본인의 닉네임 등을 사용합니다.
2. [저장소 ZIP](https://github.com/dh-live-coding-study/woowabros-coding-study/archive/refs/heads/main.zip)을 내려받고 압축을 풉니다.
3. Chrome의 `chrome://extensions`에서 **개발자 모드**를 켜고, **압축해제된 확장 프로그램을 로드합니다**로 압축을 푼 폴더 안의 `extension`을 선택합니다.
4. [GitHub fine-grained token](https://github.com/settings/personal-access-tokens/new)을 만듭니다. Resource owner는 `dh-live-coding-study`, Repository access는 이 저장소만 선택합니다. 권한은 **Actions: Read and write**, **Contents: Read-only**, **Pull requests: Read-only**로 설정합니다. 조직 승인이 필요하면 관리자에게 요청합니다.
5. 확장 프로그램의 설정 화면에 아래 값을 입력하고 **제출 수집 켜기**를 선택해 저장합니다.

| 항목 | 입력값 |
| --- | --- |
| GitHub 저장소 | `dh-live-coding-study/woowabros-coding-study` |
| 참여자 ID | 설정 파일의 본인 `id` |
| 백준 아이디 | 로그인한 백준 아이디 |
| 프로그래머스 계정 표시 | 설정 파일의 본인 `programmers` 값 |
| GitHub 토큰 | 4번에서 만든 토큰 |

설정 후 문제 탭을 새로 고칩니다. 프로그래머스 계정 표시는 사이트에서 자동 확인하지 않고 직접 입력한 값을 사용합니다.

## 문제 풀기

- 백준은 로그인한 상태에서 **내 제출**의 채점 현황을 열어 둡니다. 화면에 보이는 본인의 완료된 제출을 오래된 것부터 수집합니다. 처음 열면 화면에 보이는 과거 제출도 포함될 수 있습니다.
- 프로그래머스는 코딩테스트 연습 문제의 **제출 후 채점하기**를 사용합니다. **코드 실행**은 수집하지 않습니다. 채점이 끝날 때까지 페이지를 열어 두세요. 일반 에디터의 단일 소스 문제를 지원합니다.
- 확장 프로그램 설정의 **등록한 제출**에서 PR 링크를 열 수 있습니다. 아직 등록되지 않았다면 **대기 중인 제출**에서 다시 확인하고 전송할 수 있습니다. 채점 결과를 확인하지 못한 코드는 **대기 원문 저장**으로 내려받을 수 있습니다.

새 제출을 수집하면 main README의 목록을 갱신하는 PR이 만들어집니다. 병합된 제출은 30분 간격의 목록 갱신 때 반영합니다. 목록 PR도 병합하면 위 표에 반영됩니다.

확장 프로그램을 업데이트할 때는 새 ZIP의 `extension` 폴더로 교체하고 `chrome://extensions`에서 새로고침을 누른 뒤, 열어 둔 문제 탭도 새로 고칩니다.
