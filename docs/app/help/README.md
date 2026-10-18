# Help data

| File | Contents |
|---|---|
| `helplines.json` | Helplines and emergency numbers per country, keyed by ISO 3166 country code |
| `timezones.json` | Time zone to country table, built by `tools/build_timezones.py` from the IANA time zone database (public domain) |
| `safety.json` | When the gentle prompt appears: how many recent check-ins, within how many days, at which feeling |

## Adding a country

Add an entry to `countries` in `helplines.json`:

```json
"PT": {
  "name": "Portugal",
  "emergency": [{"label": "Emergency", "number": "112"}],
  "lines": [
    {"name": "Service name", "contact": [{"type": "call", "value": "123 456"}], "hours": "24 hours, every day, free", "source": "https://official.example"}
  ]
}
```

- `contact.type` is `call`, `text` or `chat`. A text contact can add `body` (the word to send) and `note` (the button label, for example "Text TALK to 50808").
- `source` must be the service's own website or an official government page.
- Use `"the United Kingdom"` style names where the country name reads with "the".
- Check every number on the official source, and update `checked` at the top of the file.
