# Notiyou Supabase Edge Functions

노티유 앱의 Supabase Project에서 사용되는 Edge Functions들을 관리하는 레파지토리입니다.

## 프로젝트 구조

- `supabase`: Supabase Project 폴더
  - `functions`: Supabase Edge Functions 코드
    - `create-missions`: 미션 생성 함수

## 개발 환경 설정

- supabase 패키지 설치

```bash
pnpm i
```

- Supabase CLI 로그인

```bash
npx supabase login
```

- Deno 설정

https://docs.deno.com/runtime/getting_started/setup_your_environment/

## Edge Functions 추가하기

```bash
pnpm new-fn {function-name}
```

## Edge Functions 배포하기

```bash
pnpm deploy-fn {function-name}
```

## Firebase Admin SDK 설정

1. Firebase 콘솔에서 서비스 계정 키(JSON)를 다운로드합니다.
2. 비공개 키 파일의 내용을 복사합니다.
3. Supabase 대시보드에서 환경변수를 설정합니다:
   - `FIREBASE_PRIVATE_KEY`: 비공개 키 파일의 내용
   - `FIREBASE_PRIVATE_KEY_ID`: 비공개 키 ID
   - `FIREBASE_CLIENT_ID`: 비공개 키 파일의 클라이언트 ID

## 로컬 서버 실행하기

1. supabase link
   notiyou 프로젝트에 링크를 설정합니다.

```bash
npx supabase link --project-ref pmiivbdkefsnzznxghwb
```

2. 데이터베이스 마이그레이션
   Supabase에서 설정한 Schema들을 로컬 서버에 적용합니다.
   이때 db 비밀번호는 [노션 문서](https://www.notion.so/Supabase-Database-password-45a78f773f0f4db1af28cd6df7706fdb?pvs=4)에서 확인할 수 있습니다.

```bash
npx supabase db pull
```

3. 로컬 서버 실행

```bash
npx supabase start
```

4. 로컬 서버 종료

```bash
npx supabase stop
```
