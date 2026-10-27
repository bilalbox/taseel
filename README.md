# تأصيل (Taseel)

Prototype offline search and quiz engine for fiqh and usul principles drawn from the _Noor 'ala al-Darb_ archives of Shaykh Ibn Baz and Shaykh Ibn Uthaymeen.

نموذج واجهات لمحرك بحث واختبار للقواعد الفقهية والأصولية من أرشيف نور على الدرب.

Domain terms: [GLOSSARY.md](GLOSSARY.md). UI variant notes: [docs/prototypes.md](docs/prototypes.md).

## Run

```bash
pnpm install
pnpm build:db   # compile public/content.sqlite3 from pipeline/data (local)
pnpm dev        # http://localhost:3000/
```

```bash
pnpm build
pnpm preview
# Cloudflare Pages:
pnpm deploy
```

Content SQLite and `pipeline/data/` are gitignored (large). Generate them locally before `dev` / deploy.

## License

MIT — see [LICENSE](LICENSE).
