# Riding-star

자전거 라디오 방송 `Riding-star`의 시나리오 문서와 공유 편집용 웹앱입니다.

## 방송 시나리오 문서

- `dist/Riding-star_방송시나리오_마스터북.docx`
- `dist/Riding-star_방송시나리오_마스터북.md`

## 공유 편집 웹앱

이 웹앱은 중앙 서버가 `data/scenarios.json`을 저장하고, 팀원들이 같은 웹주소로 접속해서 회차별 방송 시나리오를 수정하는 방식입니다.

### 실행

Windows에서 `start-riding-star-web.cmd`를 실행하거나 아래 명령을 사용합니다.

```powershell
& "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.js
```

실행 후 접속 주소:

- 같은 컴퓨터: `http://localhost:5187`
- 같은 네트워크의 다른 컴퓨터: `http://이_컴퓨터의_IP:5187`

### 외부 장소에서 같이 쓰려면

다른 장소의 컴퓨터까지 접속하려면 서버가 필요합니다. 선택지는 크게 세 가지입니다.

- 사무실 PC 한 대를 켜두고 공유기 포트포워딩 또는 터널링을 설정
- Vercel, Render, Railway 같은 호스팅에 올리고 DB를 연결
- Supabase, Firebase 같은 클라우드 DB를 붙여 로그인과 권한까지 관리

현재 버전은 설치가 적고 구조가 단순한 파일 저장형입니다. 인터넷 공개 운영으로 옮길 때는 DB 저장형으로 바꾸는 것이 좋습니다.
