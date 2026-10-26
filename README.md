# aethislabs-site

Landing page for Aethis Labs (aethislabs.com). Plain HTML, CSS, and JS with no build step.

- `public/` is the site that gets deployed.
- `design/logo-options.html` shows the three logo concepts.
- `.github/workflows/deploy.yml` deploys `public/` to Cloudflare Pages on every push to `main`.

Preview locally:

```
python3 -m http.server -d public 8000
```
