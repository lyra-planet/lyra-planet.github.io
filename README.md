# lyra-planet.github.io

Personal site: home, CV and writing. Built with [Hugo](https://gohugo.io) 0.168.0 and deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

- `content/posts/` — write a post as Markdown with `title`, `date`, `lede` and `tags`; push, and it is live a minute later
- `data/cv.yaml` — everything on the CV page
- `data/icons.json`, `data/projects.json`, `static/img/planet-*.svg` — generated from the same source as my GitHub profile, so the two stay in sync
- The usage chart on the home page reads `data/claude-code-usage.json` from [lyra-planet/lyra-planet](https://github.com/lyra-planet/lyra-planet) in the browser, so it stays current without rebuilding this site
- Fonts: Newsreader and IBM Plex Mono, self-hosted under the SIL Open Font License (licences in `static/fonts/`)

Local preview: `hugo server`.
