# 라이어픽 온라인(Supabase) 구성

`schema.sql` 하나로 스터디픽과 함께 쓰는 Supabase 프로젝트(`cwiftbtyfndnthzuutrx`)에
`liarpick_` 접두사 객체만 만든다. 재실행해도 안전(idempotent).

## 테이블
| 테이블 | 내용 | 공개 범위 |
| --- | --- | --- |
| `liarpick_profiles` | 닉네임·판수·승리·점수 | 인증 사용자 조회 |
| `liarpick_rooms` | 방 상태·단계·설정·공개 state | 방 참가자만 |
| `liarpick_secrets` | 제시어 후보 쌍(절대 비공개) | 접근 정책 없음(서버 함수만) |
| `liarpick_players` | 참가자·준비·생존 | 방 참가자만 |
| `liarpick_roles` | 본인 역할·제시어 | **본인 행만** |
| `liarpick_votes` | 투표 | **본인 표만** |
| `liarpick_actions` | 마피아·경찰·의사 밤 행동 | **본인 행만** |
| `liarpick_messages` | 채팅·시스템 메시지 | 방 참가자만 |

Realtime 발행은 `liarpick_rooms`, `liarpick_players`, `liarpick_messages` 세 개뿐이다.
역할·투표·행동·secrets 테이블은 발행에서 제외해 다른 참가자에게 새어 나가지 않는다.

## RPC (모두 SECURITY DEFINER, authenticated만 실행)
- 프로필: `liarpick_my_profile`, `liarpick_set_nickname`, `liarpick_leaderboard`
- 방: `liarpick_create_room`, `liarpick_join_room`, `liarpick_quick_match`,
  `liarpick_leave_room`, `liarpick_set_config`, `liarpick_list_rooms`,
  `liarpick_cleanup_stale`, `liarpick_room_snapshot`
- 게임: `liarpick_start_game`, `liarpick_liar_phase`, `liarpick_cast_vote`,
  `liarpick_vote_stats`, `liarpick_submit_guess`, `liarpick_mafia_phase`,
  `liarpick_night_action`, `liarpick_reset_lobby`

호스트 전용 단계 전환은 `host_id`를 서버에서 확인하고, 현재 단계가 맞을 때만 진행한다
(중복 호출은 스냅샷만 돌려준다).

## 적용 방법
Supabase 대시보드 → SQL Editor에서 `schema.sql` 전체를 실행.
새 RPC가 REST에 안 보이면 `notify pgrst, 'reload schema';`를 실행한다.
