# P-seudonymous.github.io

A Hugo site for Markdown-based blogs, research, and an About page.

## Preview locally

```sh
hugo server
```

Open `http://localhost:1313/`.

## Edit content

- `content/_index.md` controls the landing page text and links.
- `content/about.md`, `content/research/_index.md`, and `content/resume.md` control those pages.
- Add a Markdown file or page bundle under `content/blogs/` to publish a blog post. The home page and blog archive update automatically.

The site uses a shared bottom navigation dock and a persistent moving grid. The light/dark preference is saved in each visitor's browser.

## Live activity

Discord and current Spotify activity come from [Lanyard](https://github.com/Phineas/lanyard), using the Discord ID in `content/_index.md`. Spotify must be connected to Discord with activity sharing enabled. A browser that has seen a song playing remembers it locally and shows the last seen song while playback is idle. A Spotify API integration for a shared last-played song is not configured yet; no credentials belong in this repository or its published files.

## Deploy

The GitHub Actions workflow builds Hugo and deploys to GitHub Pages on pushes to `main`. In the repository's Pages settings, select **GitHub Actions** as the publishing source.
