- for web research use hound: `web_search` to find sources, `web_fetch` to read pages and PDFs, `web_crawl` to map a site, `web_screenshot` when the rendered page matters
- check `content_ok` before trusting fetched content. if hound reports an unbypassable anti-bot wall, switch sources instead of retrying the same url

- run check/format/lint commands when your done making a change. if they don't exist, suggest making them for the project you're in
- avoid explicit return types unless absolutely needed
- `as any` should be an absolute last resort. always use real type safety. lean on type inference instead of manually writing new types over and over again
