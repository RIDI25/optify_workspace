-- ============================================================
-- 옵티파이 워크스페이스 — 스레드 프리셋 톤 개선 (0004)
-- 기존 channel_settings의 threads 프리셋 tone_rules에 자연스러운 구어체 규칙 추가.
-- 재실행 안전(idempotent): 이미 포함돼 있으면 건너뜀.
-- ============================================================

do $$
declare
  new_rule text := '실제 한국 스레드 사용자들이 쓰는 자연스러운 구어체 사용. 번역투 표현(~할 수 있습니다, ~하는 것이 중요합니다, 그것은/이것은 주어 반복) 금지. 문어체 접속사(그러나, 따라서, 또한) 대신 구어 연결(근데, 그래서, 아 그리고). 조사 생략이 자연스러운 곳은 생략. 실제 통용되는 표현 위주로.';
begin
  update channel_settings
  set preset = jsonb_set(
    preset,
    '{tone_rules}',
    coalesce(preset->'tone_rules', '[]'::jsonb) || to_jsonb(new_rule)
  )
  where channel = 'threads'
    and not (coalesce(preset->'tone_rules', '[]'::jsonb) @> to_jsonb(new_rule));
end $$;
