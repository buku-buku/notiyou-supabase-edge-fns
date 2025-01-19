# Notiyou Supabase Edge Functions

노티유 앱의 Supabase Project에서 사용되는 Edge Functions들을 관리하는 레파지토리입니다.

## 프로젝트 구조

- `supabase`: Supabase Project 폴더
  - `functions`: Supabase Edge Functions 코드
    - `create-missions`: 미션 생성 함수

## 개발 환경 설정

- Supabase CLI 설치

```bash
brew install supabase
```

- Supabase CLI 로 로그인

```bash
supabase login
```

- Deno 설정

https://docs.deno.com/runtime/getting_started/setup_your_environment/

## Edge Functions 추가하기

```bash
supabase functions new {function-name}
```

## Edge Functions 배포하기

```bash
supabase functions deploy {function-name} --project-ref pmiivbdkefsnzznxghwb
```
