# Источники и ограничения

## Материалы проекта
В полном пакете `docs/handoff/references/` лежат неизменённые оригиналы: исходный ZIP v73, технический аудит DOCX, два PDF, два MP4. Текст аудита продублирован в `AUDIT_V73.md` для удобства агента. Файлы игры в корне извлечены из оригинального ZIP без изменения. PDF описывают более старую версию: использовать как исторический контекст.

## Технические ориентиры
Ссылки ниже — стартовые материалы для самостоятельного изучения; не доказательство внутреннего устройства закрытых игр. Перепроверять актуальные технические детали и лицензии до применения.
- Cataclysm: DDA — https://github.com/CleverRaven/Cataclysm-DDA
- OpenXRay — https://github.com/OpenXRay/xray-16
- Suroi — https://github.com/HasangerGames/suroi
- Recast/Detour — https://github.com/recastnavigation/recastnavigation
- Project Zomboid — https://projectzomboid.com/blog/
- GDC — https://www.gdcvault.com/ (поиск AI Recycling и Horizon Zero Dawn AI)
- MDN Canvas optimization — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- OffscreenCanvas — https://web.dev/articles/offscreen-canvas
- Canvas performance — https://web.dev/articles/canvas-performance
- MDN localStorage — https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- MDN IndexedDB — https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- OWASP DOM XSS prevention — https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
- PixiJS — https://pixijs.com/
- OpenAI Codex workflow guide — https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

## Ограничения
Переписка представлена конспектом, не полным дословным экспортом. Новых запусков игры/тестов, нового мобильного профилирования и реализации обновлений при сборке пакета не было. Данные о v73 взяты из приложенного аудита и прежнего обсуждения; проверять по текущему коду. Закрытый код коммерческих игр не исследован напрямую. Результат отдельного Deep Research по дорожной карте не был доступен в переписке. Рекомендации по графике/архитектуре — предлагаемые, а не реализованные изменения.
