
# Adaptations

Scripts that download a translation, then adapt and modify it, producing a manual source
(`source.zip` + `meta.json`) in `collection_official/sources/bibles/<id>/`. They're for
translations that need more than the collector's usual processing. Each translation has its own
subfolder named by its id.

After running a script, extract and process the result with the collector:

```bash
.bin/collector_official download --recheck <id>
.bin/collector_official process <id>
```

`--recheck` is needed because `download` otherwise skips an already-extracted source.

| Folder | Translation |
| --- | --- |
| `eng_ev/` | Everyday Version (OET Readers’ Version with traditional names) |
